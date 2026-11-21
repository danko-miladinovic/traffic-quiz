import { expect, test } from "@playwright/test";

test("preview placements reserve space before hydration and send no external requests", async ({
  page,
  browser,
  baseURL,
}, info) => {
  const external: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      ["http:", "https:", "ws:", "wss:"].includes(url.protocol) &&
      url.host !== new URL(baseURL!).host
    )
      external.push(url.host);
  });
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: page.viewportSize()!,
  });
  try {
    const plain = await context.newPage();
    await plain.goto(baseURL + "/");
    const initial = await plain.locator('[data-ad-placement="home-after-topics"]').boundingBox();
    expect(initial).not.toBeNull();
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Dozvoli analitiku" })).toBeEnabled();
    const slot = page.getByRole("complementary", { name: "Oglas — razvojni pregled" });
    await expect(slot).toHaveAttribute("data-ad-placement", "home-after-topics");
    await expect(slot).toContainText("Oglasi nisu aktivni.");
    const hydrated = (await slot.boundingBox())!;
    expect(hydrated.height).toBeGreaterThanOrEqual(176);
    expect(hydrated.height).toBeCloseTo(initial!.height, 0);
    expect(hydrated.y).toBeCloseTo(initial!.y, 0);
    expect(await slot.locator("a,button,input,iframe,script,[tabindex]").count()).toBe(0);
    await slot.screenshot({ path: info.outputPath("advertising-preview.png") });
    await page.goto("/ucenje/oblasti/saobracajni-znakovi");
    await expect(page.locator("[data-ad-placement]")).toHaveAttribute(
      "data-ad-placement",
      "category-after-lessons",
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const gap = await page.evaluate(() => {
      const slot = document.querySelector(".ad-slot")!.getBoundingClientRect();
      const next = document.querySelector(".education-next")!.getBoundingClientRect();
      return next.top - slot.bottom;
    });
    expect(gap).toBeGreaterThanOrEqual(47);
    await page.goto("/ucenje");
    await expect(page.locator("[data-ad-placement]")).toHaveCount(0);
    expect(external).toEqual([]);
  } finally {
    await context.close();
  }
});
