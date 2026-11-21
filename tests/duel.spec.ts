import { expect, test, type Page, type Browser } from "@playwright/test";
import { resolve } from "node:path";

async function createRoom(page: Page) {
  await page.goto("/duel");
  const card = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: "Tehnička proba", exact: true }) });
  await card.getByRole("button", { name: "Kreiraj duel" }).click();
  const input = page.getByLabel("Privatni pozivni link");
  await expect(input).toBeVisible();
  await expect(page.getByRole("img", { name: "QR kod za poziv u duel" })).toBeVisible();
  return input.inputValue();
}
async function join(browser: Browser, url: string) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(url);
  await expect(page.getByRole("heading", { name: "Oboje ste tu. Spremni?" })).toBeVisible();
  expect(new URL(page.url()).hash).toBe("");
  return { context, page };
}

test("QR invitation, identical questions, shared results and mutual rematch", async ({
  page,
  browser,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const url = await createRoom(page);
  await expect(page.locator("[data-ad-placement]")).toHaveCount(0);
  expect(url).toMatch(/\/duel#poziv=[a-f0-9]{64}$/);
  const credential = (await page.context().cookies()).find(
    (cookie) => cookie.name === "duel_guest",
  )!.value;
  expect(url).not.toContain(credential);
  await page.addScriptTag({ path: resolve("node_modules/jsqr/dist/jsQR.js") });
  const decoded = await page
    .getByRole("img", { name: "QR kod za poziv u duel" })
    .evaluate(async (image) => {
      await (image as HTMLImageElement).decode();
      const canvas = document.createElement("canvas");
      canvas.width = 240;
      canvas.height = 240;
      const context = canvas.getContext("2d")!;
      context.drawImage(image as HTMLImageElement, 0, 0, 240, 240);
      const pixels = context.getImageData(0, 0, 240, 240);
      return (
        window as unknown as {
          jsQR: (data: Uint8ClampedArray, width: number, height: number) => { data: string } | null;
        }
      ).jsQR(pixels.data, 240, 240)?.data;
    });
  expect(decoded).toBe(url);
  await page.screenshot({ path: info.outputPath("invitation.png"), fullPage: true });
  const guest = await join(browser, url);
  const third = await browser.newContext();
  const thirdPage = await third.newPage();
  await thirdPage.goto(url);
  await expect(thirdPage.getByRole("alert", { name: "Greška u duelu" })).toContainText(
    "već ima dva igrača",
  );
  await third.close();
  try {
    await page.getByRole("button", { name: "Spreman sam", exact: true }).click();
    await guest.page.getByRole("button", { name: "Spreman sam", exact: true }).click();
    for (let round = 0; round < 5; round++) {
      await expect(page.getByText(`PITANJE ${round + 1} OD 5`, { exact: true })).toBeVisible();
      await expect(
        guest.page.getByText(`PITANJE ${round + 1} OD 5`, { exact: true }),
      ).toBeVisible();
      await expect(page.locator("[data-ad-placement]")).toHaveCount(0);
      await expect(guest.page.locator("[data-ad-placement]")).toHaveCount(0);
      expect(await page.locator(".practice-question h2").textContent()).toBe(
        await guest.page.locator(".practice-question h2").textContent(),
      );
      expect(await page.locator(".practice-option").allTextContents()).toEqual(
        await guest.page.locator(".practice-option").allTextContents(),
      );
      await page.locator(`input[value="opcija-${round === 0 ? 2 : 1}"]`).check();
      await page.getByRole("button", { name: "Potvrdi odgovor" }).click();
      await expect(page.getByText("✓ Odgovor je sačuvan.", { exact: false })).toBeVisible();
      if (round === 0) {
        await expect(guest.page.getByText("Tačan odgovor:", { exact: true })).toHaveCount(0);
        await page.screenshot({ path: info.outputPath("active-question.png"), fullPage: true });
      }
      await guest.page.locator('input[value="opcija-1"]').check();
      await guest.page.getByRole("button", { name: "Potvrdi odgovor" }).click();
      await expect(
        page.getByText(`PITANJE ${round + 1} OD 5 · OBJAŠNJENJE`, { exact: true }),
      ).toBeVisible();
      await expect(page.locator("[data-ad-placement]")).toHaveCount(0);
    }
    await expect(
      page.getByRole("heading", { name: "Dobar izazov. Sledeći je tvoj!" }),
    ).toBeVisible();
    await expect(guest.page.getByRole("heading", { name: "Pobeda je tvoja!" })).toBeVisible();
    await expect(page.locator(".duel-scoreboard strong")).toHaveText(["4 / 5", "5 / 5"]);
    await expect(guest.page.locator(".duel-scoreboard strong")).toHaveText(["4 / 5", "5 / 5"]);
    const id = await page.evaluate(() => sessionStorage.getItem("duel.multiplayer.room"));
    expect(await guest.page.evaluate(() => sessionStorage.getItem("duel.multiplayer.room"))).toBe(
      id,
    );
    await expect(page.locator("[data-ad-placement]")).toHaveAttribute(
      "data-ad-placement",
      "duel-after-results",
    );
    await expect(guest.page.locator("[data-ad-placement]")).toHaveAttribute(
      "data-ad-placement",
      "duel-after-results",
    );
    const resultGap = await page.evaluate(
      () =>
        document.querySelector(".ad-slot")!.getBoundingClientRect().top -
        document.querySelector(".practice-leave")!.getBoundingClientRect().bottom,
    );
    expect(resultGap).toBeGreaterThanOrEqual(47);
    await page.screenshot({ path: info.outputPath("result.png"), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole("button", { name: "Želim revanš" }).click();
    await expect(guest.page.getByText("Protivnik želi revanš.", { exact: false })).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem("duel.multiplayer.room"))).toBe(id);
    await guest.page.getByRole("button", { name: "Želim revanš" }).click();
    await expect(page.getByRole("heading", { name: "Oboje ste tu. Spremni?" })).toBeVisible();
    await expect(guest.page.getByRole("heading", { name: "Oboje ste tu. Spremni?" })).toBeVisible();
    await expect(page.locator("[data-ad-placement]")).toHaveCount(0);
    await expect(guest.page.locator("[data-ad-placement]")).toHaveCount(0);
    const rematch = await page.evaluate(() => sessionStorage.getItem("duel.multiplayer.room"));
    expect(rematch).not.toBe(id);
    expect(await guest.page.evaluate(() => sessionStorage.getItem("duel.multiplayer.room"))).toBe(
      rematch,
    );
    await page.getByRole("button", { name: "Završi duel bez rezultata" }).click();
    await expect(guest.page.getByRole("heading", { name: "Duel je prekinut." })).toBeVisible();
    await expect(guest.page.locator("[data-ad-placement]")).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await guest.context.close();
  }
});

test("refresh reconnects to the same round; a failed reconnect has no winner", async ({
  page,
  browser,
}) => {
  const url = await createRoom(page);
  const guest = await join(browser, url);
  try {
    await page.getByRole("button", { name: "Spreman sam", exact: true }).click();
    await guest.page.getByRole("button", { name: "Spreman sam", exact: true }).click();
    await page.locator('input[value="opcija-1"]').check();
    await page.getByRole("button", { name: "Potvrdi odgovor" }).click();
    const question = await guest.page.locator(".practice-question h2").textContent();
    const before = Number((await guest.page.getByRole("timer").textContent())!.match(/\d+/)?.[0]);
    await guest.page.reload();
    await expect(guest.page.getByText("PITANJE 1 OD 5", { exact: true })).toBeVisible();
    await expect(guest.page.locator(".practice-question h2")).toHaveText(question!);
    const after = Number((await guest.page.getByRole("timer").textContent())!.match(/\d+/)?.[0]);
    expect(after).toBeLessThanOrEqual(before);
    await guest.context.close();
    await expect(page.getByRole("heading", { name: "Duel je prekinut." })).toBeVisible();
    await expect(page.getByText("Pobednik nije proglašen.", { exact: false })).toBeVisible();
  } finally {
    await guest.context.close();
  }
});

test("same-origin HTTP polling works when WebSocket transport is unavailable", async ({ page }) => {
  await page.routeWebSocket("**/socket.io/**", (socket) =>
    socket.close({ code: 1008, reason: "Test fallback" }),
  );
  await createRoom(page);
  await expect(page.getByRole("heading", { name: "Pozovi prijatelja na duel." })).toBeVisible();
  await page.getByRole("button", { name: "Završi duel bez rezultata" }).click();
  await expect(page.getByRole("heading", { name: "Duel je prekinut." })).toBeVisible();
});
