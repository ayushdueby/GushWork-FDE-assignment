import { expect, test } from "@playwright/test";
import { expectToast, loginAs } from "./helpers";

/**
 * The one continuous story: email → lead on Today → call from Today → apply the transcript
 * → build & send a quote → customer accepts at the public link → drag onto a tech's schedule
 * → tech marks it done → reports reflect it.
 */
test("full story from inbound email to completed job", async ({ page, browserName }, testInfo) => {
  test.setTimeout(240_000); // nine screens, one continuous story
  const isMobile = testInfo.project.name === "mobile";
  await loginAs(page, "Denise Carter");

  // Baseline for the report check at the end.
  await page.goto("/reports");
  const completedBefore = Number((await page.getByText("Jobs completed").locator("..").locator("p").nth(1).textContent())?.trim() ?? "0");

  // 1. Incoming email → lead.
  await page.goto("/inbox");
  await page.getByTestId("simulate-email").click();
  await page.getByTestId("sample-email-urgent").click();
  await expectToast(page, /Email received/);
  await expect(page.getByTestId("review-card").first()).toContainText(/urgent/i);

  // 2. It's on Today, in red.
  await page.goto("/");
  const row = page.getByTestId("call-row").filter({ hasText: "Santos Taqueria" }).first();
  await expect(row).toBeVisible();
  await expect(row).toContainText("Equipment down — call now");
  await expect(row.getByTestId("suggestion")).toContainText(/./);

  // 3. Call from Today → dialer opens prefilled → sample call → apply.
  await row.getByRole("button", { name: /^Call Santos Taqueria/ }).click();
  const dialer = page.getByTestId("dialer");
  await expect(dialer).toBeVisible();
  await expect(dialer.getByTestId("dial-number")).toHaveValue(/512/);
  await dialer.getByTestId("sample-call-urgent-with-price").click();
  const review = page.getByTestId("call-review");
  await expect(review).toBeVisible();
  await expect(review).toContainText("Quote (draft)");
  await expect(review).toContainText("$1,800");
  await review.getByTestId("apply-changes").click();
  await expect(review).toContainText("Applied to the job");
  const jobHref = await review.getByRole("link", { name: "Open the job" }).getAttribute("href");
  expect(jobHref).toMatch(/^\/jobs\//);
  const jobId = jobHref!.split("/").pop()!;

  // 4. Build and send the quote.
  await page.goto(`/quotes/new?jobId=${jobId}`);
  await expect(page).toHaveURL(/\/quotes\/[^/]+$/);
  await expect(page.getByTestId("quote-total")).toContainText("$1,800");
  await page.getByTestId("send-quote").click();
  const link = page.getByTestId("quote-public-link");
  await expect(link).toBeVisible();
  const publicUrl = (await link.getAttribute("href"))!;
  expect(publicUrl).toContain("/q/");

  // 5. Customer accepts at the public link (no login needed — use a fresh context).
  const customer = await page.context().browser()!.newContext({ viewport: isMobile ? { width: 393, height: 851 } : undefined });
  const cpage = await customer.newPage();
  await cpage.goto(publicUrl);
  await expect(cpage.getByText("Santos Taqueria").first()).toBeVisible();
  await cpage.getByTestId("accept-quote").click();
  await expect(cpage.getByTestId("quote-answered")).toContainText("You accepted");
  // Answering again is impossible: the buttons are gone.
  await expect(cpage.getByTestId("accept-quote")).toHaveCount(0);
  await customer.close();

  // 6. Job is approved, and Denise got a notification.
  await page.goto(`/jobs/${jobId}`);
  await expect(page.locator("main header").first()).toContainText("Approved – schedule");

  // 7. Dispatch: drag onto Marcus (desktop) or use the Schedule dialog (mobile).
  await page.goto("/schedule");
  const card = page.getByTestId("unscheduled").getByTestId("schedule-card").filter({ hasText: "Santos Taqueria" }).first();
  await expect(card).toBeVisible();
  if (!isMobile && browserName === "chromium") {
    // Real HTML5 drag-and-drop: hover the source, press, move over the target twice, release.
    const marcusSlot = page.getByLabel(/^Marcus Lee \d{4}-\d{2}-\d{2} 10am$/).last();
    const target = (await marcusSlot.count()) ? marcusSlot : page.locator('[data-testid^="slot-"]').first();
    await card.dragTo(target);
    await expectToast(page, /Scheduled/);
  } else {
    await card.getByRole("button", { name: /Schedule/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Tech").selectOption({ label: "Marcus Lee" });
    await dialog.getByRole("button", { name: "Save" }).click();
    await expectToast(page, /Scheduled/);
  }
  await page.goto(`/jobs/${jobId}`);
  await expect(page.locator("main header").first()).toContainText("Scheduled");
  await expect(page.getByText(/with Marcus Lee/).first()).toBeVisible();

  // 8. Marcus marks it done from the tech view.
  await loginAs(page, "Marcus Lee");
  await expect(page).toHaveURL(/\/tech/);
  const techJob = page.getByTestId("tech-job").filter({ hasText: "Santos Taqueria" }).first();
  await expect(techJob).toBeVisible();
  await techJob.getByTestId("mark-done").click();
  await page.getByTestId("done-notes").fill("Replaced compressor, freezer back to -5°F.");
  await page.getByTestId("confirm-done").click();
  await expectToast(page, /Marked done/);
  await expect(page.getByTestId("tech-job").filter({ hasText: "Santos Taqueria" }).first()).toContainText("Done");

  // 9. Reports reflect it (bookkeeper can see them, read-only).
  await loginAs(page, "Ray Carter");
  await expect(page).toHaveURL(/\/reports/);
  const completedAfter = Number((await page.getByText("Jobs completed").locator("..").locator("p").nth(1).textContent())?.trim() ?? "0");
  expect(completedAfter).toBeGreaterThanOrEqual(completedBefore + 1);
  await expect(page.getByText("Marcus Lee")).toBeVisible();
});
