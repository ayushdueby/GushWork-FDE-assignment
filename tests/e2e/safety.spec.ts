import { expect, test } from "@playwright/test";
import { expectToast, loginAs } from "./helpers";

test("names and messages containing HTML render as text, never as markup", async ({ page }, testInfo) => {
  const tag = testInfo.project.name;
  const evil = `<img src=x onerror="window.__xss=1"> Evil & Co ${tag}`;
  await page.goto("/request");
  await page.getByLabel(/Your name/).fill(`<script>window.__xss=2</script> Mallory ${tag}`);
  await page.getByLabel("Business").fill(evil);
  await page.getByLabel("Phone").fill("512-555-8" + String(Date.now()).slice(-3)); // seed uses 555-01xx; never collide
  await page.getByLabel(/What's going on/).fill(`<b>bold</b> <a href="javascript:alert(1)">click</a> walk-in cooler warm ${tag}`);
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page).toHaveURL(/thanks/);

  await loginAs(page, "Denise Carter");
  for (const path of ["/", "/inbox", `/jobs?view=list&q=${encodeURIComponent(`Evil & Co ${tag}`)}`, "/customers?q=Evil"]) {
    await page.goto(path);
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    expect(await page.locator('img[src="x"]').count()).toBe(0);
    expect(await page.locator('a[href^="javascript:"]').count()).toBe(0);
  }
  // The parser strips tags from names it extracts; the raw message is kept verbatim and must
  // render as literal text, not markup.
  await page.goto(`/jobs?view=list&q=${encodeURIComponent(`Evil & Co ${tag}`)}`);
  await expect(page.locator("tbody tr").first()).toContainText(`Evil & Co ${tag}`);
  await page.goto("/inbox?channel=web_form");
  const thread = page.getByTestId("thread").filter({ hasText: `Evil & Co ${tag}` }).first();
  await thread.click();
  const body = page.getByTestId("message").filter({ hasText: "Mallory" }).first();
  await expect(body).toContainText('<a href="javascript:alert(1)">click</a>');
  await expect(body).toContainText("<img src=x onerror=");
  expect(await page.locator('img[src="x"]').count()).toBe(0);
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();

  // Typed straight into a job by the owner, too.
  await page.goto(`/jobs?view=list&q=${encodeURIComponent(`Evil & Co ${tag}`)}`);
  await page.locator("tbody tr").first().getByRole("link").first().click();
  await page.getByLabel("Issue").fill(`<svg onload="window.__xss=3"> typed by Denise ${tag}`);
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByText(`<svg onload="window.__xss=3"> typed by Denise ${tag}`).first()).toBeVisible();
  expect(await page.locator("svg[onload]").count()).toBe(0);
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
});

test("double-clicking 'move to next stage' advances exactly one stage", async ({ page }, testInfo) => {
  // Desktop and mobile each consume a different seeded 'waiting on yes' row.
  const business = testInfo.project.name === "mobile" ? "Sushi Zen" : "Lakeside Grill";
  await loginAs(page, "Denise Carter");
  await page.goto("/");
  const row = page.getByTestId("call-row").filter({ hasText: business }).first();
  await expect(row).toBeVisible();
  const btn = row.getByRole("button", { name: /Approved – schedule/ });
  await btn.dblclick();
  await expectToast(page, /Moved to Approved|Already moved/);
  await page.goto(`/jobs?view=list&q=${encodeURIComponent(business)}`);
  const tr = page.locator("tbody tr").filter({ hasText: business }).first();
  await expect(tr).toContainText("Approved – schedule");
  await tr.getByRole("link", { name: business }).click();
  const timeline = page.getByLabel("Activity");
  await expect(timeline).toContainText("Stage → Approved – schedule");
  expect(await timeline.getByText("Stage → Approved – schedule", { exact: false }).count()).toBe(1);
  await expect(timeline).not.toContainText("Stage → Scheduled");
});
