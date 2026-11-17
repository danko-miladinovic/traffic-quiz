import { expect, test } from "@playwright/test";

test("educational areas are readable without JavaScript and drafts stay private", async ({
  browser,
  baseURL,
}, testInfo) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport:
      testInfo.project.name === "mobile"
        ? { width: 393, height: 851 }
        : { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  await page.goto(baseURL + "/ucenje");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Razumi pravilo.");
  await expect(
    page.getByRole("heading", { name: "Lekcije prolaze stručnu proveru." }),
  ).toBeVisible();
  await page.getByRole("link", { name: /01 Saobraćajni znakovi/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Saobraćajni znakovi");
  await expect(page.getByRole("heading", { name: "Objašnjenja su na proveri." })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    "content",
    /Saobraćajni znakovi/,
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    baseURL + "/ucenje/oblasti/saobracajni-znakovi",
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("education-category.png"), fullPage: true });
  const draft = await page.goto(baseURL + "/ucenje/lekcije/kako-uciti-saobracajne-znakove");
  expect(draft?.status()).toBe(404);
  await expect(page.getByText("Od prepoznavanja do značenja")).toHaveCount(0);
  const unknown = await page.goto(baseURL + "/ucenje/oblasti/nepostojeca");
  expect(unknown?.status()).toBe(404);
  await context.close();
});

test("education navigation, SEO defaults and private route directives", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Glavna navigacija" })
    .getByRole("link", { name: "Učenje", exact: true })
    .click();
  await expect(page).toHaveURL(/\/ucenje$/);
  await page.keyboard.press("Tab");
  await page.goto("/ucenje");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Pređi na sadržaj" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
  for (const path of ["/duel", "/vezbanje"]) {
    const response = await request.get(path);
    expect(await response.text()).toMatch(/name="robots" content="noindex, nofollow"/);
  }
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /");
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).not.toContain("<loc>");
});
