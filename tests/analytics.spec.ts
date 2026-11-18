import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { createDatabase } from "@duel/db";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

test("analytics requires opt-in, excludes URL secrets, counts server results once, and withdraws", async ({
  page,
  context,
}, testInfo) => {
  const db = createDatabase();
  try {
    const payloads: unknown[] = [];
    page.on("request", (request) => {
      if (request.url().endsWith("/api/analytics/events")) payloads.push(request.postDataJSON());
    });
    await page.goto("/?secret=NEVER_SEND#poziv=ALSO_SECRET");
    await expect(page.getByRole("button", { name: "Dozvoli analitiku" })).toBeEnabled();
    expect((await context.cookies()).some((cookie) => cookie.name === "duel_analytics")).toBe(
      false,
    );
    expect(payloads).toHaveLength(0);
    await page.getByRole("button", { name: "Bez analitike", exact: true }).click();
    await expect(page.getByText("Analitika je isključena.", { exact: true })).toBeAttached();
    await page.reload();
    await page.locator(".analytics-preferences summary").click();
    await page.getByRole("button", { name: "Dozvoli analitiku" }).click();
    await expect(page.getByText("Analitika je dozvoljena.", { exact: true })).toBeAttached();
    const cookie = (await context.cookies()).find((cookie) => cookie.name === "duel_analytics")!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe("Lax");
    expect(await page.evaluate(() => document.cookie)).not.toContain(cookie.value);
    const visitor = await db.analyticsVisitor.findUniqueOrThrow({
      where: { tokenHash: hash(cookie.value) },
    });
    await expect
      .poll(() => db.analyticsEvent.count({ where: { visitorId: visitor.id, name: "page_view" } }))
      .toBe(1);
    await page.goto("/vezbanje?secret=NEVER_SEND#poziv=ALSO_SECRET");
    const category = page
      .getByRole("article")
      .filter({ has: page.getByRole("heading", { name: "Tehnička proba", exact: true }) });
    await category.getByRole("button", { name: "Započni" }).click();
    for (let i = 0; i < 5; i++) {
      await page.locator('input[value="opcija-1"]').check();
      await page.getByRole("button", { name: "Potvrdi odgovor" }).click();
      await page
        .getByRole("button", { name: i === 4 ? "Pogledaj rezultat" : "Sledeće pitanje" })
        .click();
    }
    await expect
      .poll(() =>
        db.analyticsEvent.count({ where: { visitorId: visitor.id, name: "practice_completed" } }),
      )
      .toBe(1);
    expect(
      await db.analyticsEvent.count({
        where: { visitorId: visitor.id, name: "question_answered" },
      }),
    ).toBe(5);
    await page.reload();
    expect(
      await db.analyticsEvent.count({
        where: { visitorId: visitor.id, name: "practice_completed" },
      }),
    ).toBe(1);
    expect(JSON.stringify(payloads)).not.toMatch(/NEVER_SEND|ALSO_SECRET|optionKey|correctOption/);
    const headers = { Origin: "http://localhost:3310" };
    const forged = await page.request.post("/api/analytics/events", {
      headers,
      data: { name: "duel_completed", requestId: crypto.randomUUID(), score: 99 },
    });
    expect(forged.status()).toBe(400);
    const crossSite = await page.request.post("/api/analytics/preferences", {
      headers: { Origin: "https://evil.example" },
      data: { consent: true },
    });
    expect(crossSite.status()).toBe(403);
    await page.locator(".analytics-preferences summary").click();
    await page.screenshot({
      path: testInfo.outputPath("analytics-preference.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Bez analitike", exact: true }).click();
    await expect.poll(() => db.analyticsEvent.count({ where: { visitorId: visitor.id } })).toBe(0);
    expect((await context.cookies()).some((cookie) => cookie.name === "duel_analytics")).toBe(
      false,
    );
    const before = payloads.length;
    await page.goto("/ucenje");
    await expect(page.locator("h1")).toContainText("Razumi pravilo");
    expect(payloads.length).toBe(before);
  } finally {
    await db.$disconnect();
  }
});

test("privacy signals prevent granting analytics consent", async ({ page, context }) => {
  await context.setExtraHTTPHeaders({ "Sec-GPC": "1" });
  await page.goto("/");
  await expect(
    page.getByText("Poštujemo signal privatnosti pregledača.", { exact: false }),
  ).toBeAttached();
  await page.locator(".analytics-preferences summary").click();
  await expect(page.getByRole("button", { name: "Dozvoli analitiku" })).toBeDisabled();
  const reply = await page.request.post("/api/analytics/preferences", {
    headers: { Origin: "http://localhost:3310", "Sec-GPC": "1" },
    data: { consent: true },
  });
  expect((await reply.json()).consent).toBe(false);
  expect((await context.cookies()).some((cookie) => cookie.name === "duel_analytics")).toBe(false);
});

test("consented invitation actions use room authorization without transmitting the invite token", async ({
  page,
  context,
}) => {
  const db = createDatabase();
  const outgoing: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/analytics/events")) outgoing.push(request.postData() ?? "");
  });
  try {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/");
    await page.getByRole("button", { name: "Dozvoli analitiku" }).click();
    await expect(page.getByText("Analitika je dozvoljena.", { exact: true })).toBeAttached();
    const token = (await context.cookies()).find(
      (cookie) => cookie.name === "duel_analytics",
    )!.value;
    const visitor = await db.analyticsVisitor.findUniqueOrThrow({
      where: { tokenHash: hash(token) },
    });
    await page.goto("/duel");
    await expect(page.getByText("Analitika je dozvoljena.", { exact: true })).toBeAttached();
    const card = page
      .getByRole("article")
      .filter({ has: page.getByRole("heading", { name: "Tehnička proba", exact: true }) });
    await card.getByRole("button", { name: /Kreiraj/ }).click();
    const inviteUrl = await page.locator("input[readonly]").inputValue();
    const invitation = new URL(inviteUrl).hash.split("=")[1];
    await page.getByRole("button", { name: "Kopiraj link" }).click();
    await expect
      .poll(() =>
        db.analyticsEvent.count({ where: { visitorId: visitor.id, name: "invite_action" } }),
      )
      .toBe(1);
    expect(
      await db.analyticsEvent.count({ where: { visitorId: visitor.id, name: "challenge_shared" } }),
    ).toBe(1);
    expect(
      await db.analyticsEvent.count({ where: { visitorId: visitor.id, name: "duel_created" } }),
    ).toBe(1);
    expect(outgoing.join(" ")).not.toContain(invitation);
    expect(outgoing.join(" ")).not.toContain(token);
  } finally {
    await db.$disconnect();
  }
});
