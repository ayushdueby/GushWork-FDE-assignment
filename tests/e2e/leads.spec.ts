import { expect, test } from "@playwright/test";
import { expectToast, loginAs } from "./helpers";

test("the public web form creates a lead", async ({ page }, testInfo) => {
  const tag = `${testInfo.project.name}-${Date.now()}`;
  await page.goto("/request");
  await page.getByLabel(/Your name/).fill(`Playwright ${tag}`);
  await page.getByLabel("Business").fill(`Test Bistro ${tag}`);
  await page.getByLabel("Phone").fill("512-555-9" + String(Date.now()).slice(-3)); // seed uses 555-01xx; never collide
  await page.getByLabel("Equipment").selectOption("ice machine");
  await page.getByLabel(/What's going on/).fill("Ice machine stopped making ice overnight, we open at 11.");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page).toHaveURL(/\/request\/thanks/);
  await expect(page.getByText("Got it")).toBeVisible();

  await loginAs(page, "Denise Carter");
  await page.goto(`/jobs?view=list&q=${encodeURIComponent(`Test Bistro ${tag}`)}`);
  const rowText = page.locator("tbody tr").first();
  await expect(rowText).toContainText(`Test Bistro ${tag}`);
  await expect(rowText).toContainText("Needs quote");
  await expect(rowText).toContainText("Website form");
});

test("validation: the form refuses an empty message and needs a way to reach you", async ({ page }) => {
  await page.goto("/request");
  await page.getByLabel(/Your name/).fill("No Contact");
  await page.getByLabel(/What's going on/).fill("Cooler is warm.");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.locator('p[role="alert"]')).toContainText(/phone number or an email/);
});

test("a missed call becomes a lead at the top of Today", async ({ page }) => {
  await loginAs(page, "Denise Carter");
  await page.goto("/dialer");
  await page.getByTestId("inbound-5125550842").click();
  await expect(page.getByTestId("dialer").getByRole("alert")).toContainText("Incoming call");
  await page.getByTestId("decline-call").click();
  await expectToast(page, /missed call/i);

  await page.goto("/");
  const rows = page.getByTestId("call-row");
  const rules = await rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-rule")));
  const missedIdx = rules.indexOf("missed-call");
  expect(missedIdx).toBeGreaterThanOrEqual(0);
  // Only "equipment down" rows may sit above it.
  for (const r of rules.slice(0, missedIdx)) expect(r).toBe("equipment-down");
  await expect(rows.nth(missedIdx)).toContainText("(512) 555-0842");
  await expect(rows.nth(missedIdx)).toContainText("Missed call — call back");
});
