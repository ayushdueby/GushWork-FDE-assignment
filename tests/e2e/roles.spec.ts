import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

test("bookkeeper: reports, quotes and customers only, read-only, incl. direct URLs and APIs", async ({ page }) => {
  await loginAs(page, "Ray Carter");
  await expect(page).toHaveURL(/\/reports/);
  for (const path of ["/", "/inbox", "/dialer", "/jobs", "/schedule", "/tech"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/reports\?denied=1/);
    await expect(page.locator('p[role="status"]')).toContainText(/available for your role/);
  }
  await page.goto("/customers");
  await expect(page).toHaveURL(/\/customers$/);
  await expect(page.getByRole("button", { name: "New customer" })).toHaveCount(0);
  await page.goto("/quotes");
  await expect(page).toHaveURL(/\/quotes$/);
  // Nav shows only what's allowed.
  const nav = page.getByRole("navigation", { name: "Main" }).first();
  await expect(nav).toContainText("Reports");
  await expect(nav).not.toContainText("Dialer");
  // APIs are enforced server-side too.
  expect((await page.request.get("/api/calls/recent")).status()).toBe(403);
  expect((await page.request.post("/api/calls", { data: { number: "5125550100" } })).status()).toBe(403);
  expect((await page.request.get("/api/reports/export")).status()).toBe(200);
});

test("tech: only the tech view and only their own jobs", async ({ page }) => {
  await loginAs(page, "Marcus Lee");
  await expect(page).toHaveURL(/\/tech/);
  for (const path of ["/", "/jobs", "/customers", "/quotes", "/reports", "/schedule", "/inbox", "/dialer"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/tech\?denied=1/);
  }
  expect((await page.request.get("/api/reports/export")).status()).toBe(403);
  expect((await page.request.get("/api/notifications")).status()).toBe(403);
  // Every job shown belongs to Marcus (the seed gives other techs jobs too).
  await page.goto("/tech");
  const cards = page.getByTestId("tech-job");
  expect(await cards.count()).toBeGreaterThan(0);
  await expect(page.getByRole("heading", { name: /Marcus's jobs/ })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Pick a tech" })).toHaveCount(0);
});

test("logged out: pages redirect to login, APIs return 401, public pages work", async ({ page }) => {
  await page.goto("/jobs");
  await expect(page).toHaveURL(/\/login/);
  expect((await page.request.get("/api/calls/recent")).status()).toBe(401);
  await page.goto("/request");
  await expect(page.getByRole("button", { name: "Send request" })).toBeVisible();
});
