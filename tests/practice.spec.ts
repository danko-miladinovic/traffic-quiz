import { expect, test, type Page } from "@playwright/test";

async function startDemo(page: Page) {
  await page.goto("/vezbanje");
  const category = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: "Tehnička proba", exact: true }) });
  await category.getByRole("button", { name: "Započni" }).click();
  await expect(page.getByText("PITANJE 1 OD 5", { exact: true })).toBeVisible();
}

test("practice completes, explains mistakes, resumes, and retries on desktop/mobile", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await startDemo(page);
  await page.screenshot({ path: testInfo.outputPath("question.png"), fullPage: true });
  await expect(page.getByRole("button", { name: "Potvrdi odgovor" })).toBeDisabled();
  const initial = await page.evaluate(() => sessionStorage.getItem("duel.practice.attempt"));
  expect(initial).toBeTruthy();
  const response = await page.request.get(`/api/practice/attempts/${initial}`);
  const state = await response.json();
  expect(state.current).not.toHaveProperty("correctOption");
  expect(state.current).not.toHaveProperty("explanation");
  expect(state.result).toBeNull();
  for (let index = 0; index < 5; index++) {
    await page.locator(`input[value="opcija-${index === 0 ? 2 : 1}"]`).check();
    await page.getByRole("button", { name: "Potvrdi odgovor" }).click();
    await expect(page.getByText(`${index + 1} / 5 odgovoreno`, { exact: true })).toBeVisible();
    await expect(page.locator(".practice-feedback")).toBeVisible();
    if (index === 0) {
      await expect(
        page.getByRole("heading", { name: "Još jedna prilika da naučiš" }),
      ).toBeVisible();
      await page.reload();
      await expect(page.getByText("1 / 5 odgovoreno", { exact: true })).toBeVisible();
      await expect(page.locator(".practice-feedback")).toBeVisible();
    }
    await page
      .getByRole("button", { name: index === 4 ? "Pogledaj rezultat" : "Sledeće pitanje" })
      .click();
  }
  await expect(page.getByRole("heading", { name: "Svaki pokušaj je korak napred." })).toBeVisible();
  await expect(page.getByText("80% tačnih odgovora", { exact: true })).toBeVisible();
  await expect(page.locator(".practice-score strong")).toHaveText("4/5");
  await page.screenshot({ path: testInfo.outputPath("result.png"), fullPage: true });
  await page.locator("details summary").first().click();
  await expect(page.locator("details").first().getByText("Tačan odgovor:")).toBeVisible();
  await page.reload();
  await expect(page.getByText("80% tačnih odgovora", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Vežbaj ponovo" }).click();
  await expect(page.getByText("0 / 5 odgovoreno", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("duel.practice.attempt"))).not.toBe(
    initial,
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("lost answer response can be retried without advancing twice", async ({ page }) => {
  await startDemo(page);
  let intercepted = false;
  await page.route("**/api/practice/attempts/*/answers", async (route) => {
    if (!intercepted) {
      intercepted = true;
      await route.fetch(); // Server accepts; browser never receives the response.
      await route.abort("failed");
    } else await route.continue();
  });
  await page.locator('input[value="opcija-1"]').check();
  await page.getByRole("button", { name: "Potvrdi odgovor" }).click();
  await expect(page.getByRole("alert", { name: "Greška pri vežbanju" })).toBeVisible();
  await expect(page.getByRole("radio").first()).toBeDisabled();
  await page.getByRole("button", { name: "Ponovi slanje" }).click();
  await expect(page.getByText("1 / 5 odgovoreno", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sledeće pitanje" }).click();
  await expect(page.getByText("PITANJE 2 OD 5", { exact: true })).toBeVisible();
});

test("lost start response survives reload without creating a second attempt", async ({ page }) => {
  let acceptedId = "";
  await page.route("**/api/practice/attempts", async (route) => {
    if (!acceptedId) {
      const response = await route.fetch();
      acceptedId = (await response.json()).id;
      await route.abort("failed");
    } else await route.continue();
  });
  await page.goto("/vezbanje");
  const category = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: "Tehnička proba", exact: true }) });
  await category.getByRole("button", { name: "Započni" }).click();
  await expect(page.getByRole("alert", { name: "Greška pri vežbanju" })).toBeVisible();
  expect(acceptedId).toBeTruthy();
  await page.reload();
  await expect(page.getByText("PITANJE 1 OD 5", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("duel.practice.attempt"))).toBe(
    acceptedId,
  );
});

test("service errors can be retried and an empty bank is clearly explained", async ({ page }) => {
  let available = false;
  await page.route("**/api/practice/categories", async (route) => {
    await route.fulfill({
      status: available ? 200 : 503,
      contentType: "application/json",
      body: JSON.stringify(
        !available
          ? { error: { message: "Vežbanje trenutno nije dostupno." } }
          : { categories: [] },
      ),
    });
  });
  await page.goto("/vezbanje");
  await expect(page.getByRole("alert", { name: "Greška pri vežbanju" })).toBeVisible();
  available = true;
  await page.getByRole("button", { name: "Pokušaj ponovo" }).click();
  await expect(page.getByRole("heading", { name: "Pitanja su na proveri" })).toBeVisible();
});

test("keyboard controls, focus, offline recovery, session ownership and CSRF", async ({
  page,
  context,
  browser,
}) => {
  await startDemo(page);
  await page.getByRole("radio").first().focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Potvrdi odgovor" })).toBeFocused();
  await context.setOffline(true);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert", { name: "Greška pri vežbanju" })).toBeVisible();
  await context.setOffline(false);
  await page.getByRole("button", { name: "Ponovi slanje" }).click();
  await expect(page.getByText("1 / 5 odgovoreno", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sledeće pitanje" }).click();
  await expect(page.locator(".practice-question h2")).toBeFocused();
  const id = await page.evaluate(() => sessionStorage.getItem("duel.practice.attempt"));
  const cookies = await context.cookies();
  const guest = cookies.find((cookie) => cookie.name === "duel_guest");
  expect(guest?.httpOnly).toBe(true);
  expect(guest?.sameSite).toBe("Lax");
  expect(await page.evaluate(() => document.cookie)).not.toContain("duel_guest");
  const outsider = await browser.newContext();
  const origin = new URL(page.url()).origin;
  await outsider.request.post(`${origin}/api/practice/session`, { headers: { origin }, data: {} });
  expect((await outsider.request.get(`${origin}/api/practice/attempts/${id}`)).status()).toBe(404);
  await outsider.close();
  expect(
    (
      await page.request.post("/api/practice/session", {
        headers: { origin: "https://untrusted.example" },
        data: {},
      })
    ).status(),
  ).toBe(403);
  const headers = { origin };
  const state = await (await page.request.get(`/api/practice/attempts/${id}`)).json();
  expect(
    (
      await page.request.post(`/api/practice/attempts/${id}/answers`, {
        headers,
        data: { questionId: state.current.id, optionKey: "opcija-1", score: 100 },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.post("/api/practice/attempts", {
        headers: { ...headers, "content-type": "application/json" },
        data: "x".repeat(2049),
      })
    ).status(),
  ).toBe(413);
});
