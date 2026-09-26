import { expect, test } from "@playwright/test";
import { expectToast, loginAs } from "./helpers";

/** Paths the main story doesn't take: a decline, a rejected lead, a nudge, the bookkeeper's export. */

test("a declined quote marks the job lost with the customer's words as the reason", async ({ page }, testInfo) => {
  const tag = `${testInfo.project.name}-${Date.now().toString().slice(-6)}`;
  const business = `Declining Diner ${tag}`;

  // A fresh lead of our own so this test never collides with the seeded demo data.
  await page.goto("/request");
  await page.getByLabel(/Your name/).fill(`Dana ${tag}`);
  await page.getByLabel("Business").fill(business);
  await page.getByLabel("Phone").fill("512-555-7" + String(Date.now()).slice(-3));
  await page.getByLabel(/What's going on/).fill("Reach-in cooler running warm, please quote.");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page).toHaveURL(/thanks/);

  await loginAs(page, "Denise Carter");
  await page.goto(`/jobs?view=list&q=${encodeURIComponent(business)}`);
  await page.locator("tbody tr").first().getByRole("link").first().click();
  await page.waitForURL(/\/jobs\/[^/?]+$/);
  const jobUrl = page.url();

  // Build and send a quote.
  await page.getByRole("button", { name: "Build a quote" }).click();
  await expect(page).toHaveURL(/\/quotes\/[^/]+$/);
  await page.getByLabel("Line 1 description").fill("Diagnostic visit");
  await page.getByLabel("Line 1 unit price").fill("180");
  await page.getByTestId("send-quote").click();
  const publicUrl = (await page.getByTestId("quote-public-link").getAttribute("href"))!;

  // The customer says no, with a reason.
  const ctx = await page.context().browser()!.newContext();
  const cpage = await ctx.newPage();
  await cpage.goto(publicUrl);
  await cpage.getByLabel(/Anything we should know/).fill("Landlord is replacing the unit");
  await cpage.getByTestId("decline-quote").click();
  await expect(cpage.getByTestId("quote-answered")).toContainText("You declined");
  await expect(cpage.getByTestId("decline-quote")).toHaveCount(0); // answered once, and only once
  await ctx.close();

  await page.goto(jobUrl);
  await expect(page.locator("main header").first()).toContainText("Lost");
  await expect(page.getByText(/Landlord is replacing the unit/).first()).toBeVisible();
  await expect(page.getByLabel("Activity")).toContainText("declined");

  // And it drops off the morning list.
  await page.goto("/");
  await expect(page.getByTestId("call-row").filter({ hasText: business })).toHaveCount(0);
});

test("'Not a lead' removes the job the pipeline created", async ({ page }) => {
  await loginAs(page, "Denise Carter");
  await page.goto("/inbox");
  await page.getByTestId("simulate-sms").click();
  await page.getByTestId("sample-sms-urgent").click();
  await expectToast(page, /Text received/);

  // The thread runs oldest → newest, so the message we just received is the last card.
  const card = page.getByTestId("review-card").last();
  await expect(card).toBeVisible();
  await expect(card.getByRole("link", { name: /Job:/ })).toBeVisible();
  const jobHref = await card.getByRole("link", { name: /Job:/ }).getAttribute("href");

  await card.getByRole("button", { name: "Not a lead" }).click();
  await expectToast(page, /Marked as not a lead/);
  await expect(page.getByTestId("review-card").last()).toContainText("Not a lead");

  // The job it created is gone, not just hidden.
  await page.goto(jobHref!);
  await expect(page.getByText(/not be found|404/i).first()).toBeVisible();
});

test("a quote that has gone quiet can be nudged from Today in one click", async ({ page }, testInfo) => {
  // One seeded target per viewport, so desktop and mobile never consume each other's row
  // (Lakeside Grill and Sushi Zen belong to safety.spec).
  const business = testInfo.project.name === "mobile" ? "Garden Gate Bistro" : "Big Sky Grocery";
  await loginAs(page, "Denise Carter");
  await page.goto("/");
  const row = page.locator('[data-testid="call-row"][data-rule="follow-up-quote"]').filter({ hasText: business }).first();
  await expect(row).toBeVisible();
  await expect(row).toContainText("Follow up on quote");
  const jobId = (await row.getAttribute("data-job-id"))!;
  await row.getByTestId("send-reminder").click();
  await expectToast(page, /Reminder sent/);
  // The nudge counts as contact, so that job leaves the list.
  await page.reload();
  await expect(page.locator(`[data-testid="call-row"][data-job-id="${jobId}"]`)).toHaveCount(0);
});

test("the bookkeeper can export the jobs CSV, and a tech cannot", async ({ page }) => {
  await loginAs(page, "Ray Carter");
  const csv = await page.request.get("/api/reports/export");
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  const body = await csv.text();
  expect(body.split("\r\n")[0]).toContain("Created,Business,Contact,Phone");
  expect(body.length).toBeGreaterThan(200);

  await loginAs(page, "Dev Patel");
  expect((await page.request.get("/api/reports/export")).status()).toBe(403);
});
