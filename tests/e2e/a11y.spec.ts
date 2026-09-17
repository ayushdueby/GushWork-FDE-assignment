import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./helpers";

async function checkA11y(page: Page, name: string) {
  // No horizontal page scroll (inner scrollers like the kanban and the week board are fine).
  const overflow = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(overflow.scroll, `${name}: page scrolls horizontally`).toBeLessThanOrEqual(overflow.client + 1);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  if (serious.length) console.log(`[axe:${name}]`, JSON.stringify(serious.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.slice(0, 3).map((n) => n.html) })), null, 2));
  expect(serious, `${name}: serious/critical accessibility violations`).toEqual([]);
}

test("Today, Dialer, Inbox and the public quote page have no serious axe violations", async ({ page }) => {
  await loginAs(page, "Denise Carter");
  await page.goto("/");
  await page.getByTestId("call-row").first().waitFor();
  await checkA11y(page, "today");
  await page.goto("/dialer");
  await page.getByTestId("dialer").waitFor();
  await checkA11y(page, "dialer");
  await page.goto("/inbox");
  await page.getByTestId("thread").first().waitFor();
  await checkA11y(page, "inbox");
  await page.goto("/jobs");
  await checkA11y(page, "jobs");
  await page.goto("/schedule");
  await checkA11y(page, "schedule");

  // A sent quote's public page.
  await page.goto("/quotes?status=sent");
  await page.locator("tbody tr a").first().click();
  await expect(page).toHaveURL(/\/quotes\/[^/]+$/);
  const href = await page.locator('a[href^="/q/"]').first().getAttribute("href");
  await page.goto(href!);
  await page.getByTestId("accept-quote").waitFor();
  await checkA11y(page, "public-quote");
});
