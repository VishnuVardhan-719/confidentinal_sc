/*
 * Patient request flow in a real browser against a synthetic /api (see helpers.mockBackend): category search
 * -> sign-in -> /book prefilled -> advisory times by provider reference -> details -> send -> visits -> cancel.
 * Driven by keyboard where a person would use it, at both viewports.
 */
import { expect, test } from "@playwright/test";
import { BOOK_DATE, PROVIDER_REF, SERVICE_ID, expectNoHorizontalScroll, expectNoSeriousAxe, mockBackend, signIn, trackErrors } from "./helpers";

test("search, sign in, request a visit and cancel it", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = trackErrors(page);
  const api = await mockBackend(page);

  // Public category page: search by PIN with the keyboard.
  await page.goto("/categories/doctor");
  const pin = page.getByLabel("Your PIN code");
  await pin.fill("500001");
  await pin.press("Enter");
  await expect(page.getByRole("heading", { name: "Synthetic Clinic 1" })).toBeVisible();
  await expect(page.getByText("₹1,500 per visit", { exact: false }).first()).toBeVisible();
  await expectNoHorizontalScroll(page);

  // Request -> signed out, so the gate sends us to sign-in and back.
  await page.getByRole("link", { name: "Request Home visit from Synthetic Clinic 1" }).click();
  await page.waitForURL(/\/sign-in\?next=/);
  await page.getByLabel("Email address").fill("patient@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill("synthetic-password-1");
  await page.getByLabel("Password", { exact: true }).press("Enter");
  await page.waitForURL(/\/book\?/);

  // Step 3 opens directly, with the linked provider chosen once the catalog confirms it.
  await expect(page.getByRole("heading", { name: "Choose a provider and time" })).toBeVisible();
  await expect(page.getByRole("radio", { name: /Synthetic Clinic 1/ })).toBeChecked();
  await page.getByLabel("Date").fill(BOOK_DATE);
  const firstTime = page.getByRole("radio", { name: "10:00 am" });
  await expect(firstTime).toBeVisible();
  await firstTime.focus();
  await page.keyboard.press("Space");
  await expect(firstTime).toBeChecked();
  await expectNoSeriousAxe(page);
  await page.getByRole("button", { name: "Continue" }).press("Enter");

  // Details: validation first, then a valid entry.
  await expect(page.getByRole("heading", { name: "Where and who should the provider contact?" })).toBeFocused();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Enter the house or flat and street.")).toBeVisible();
  await expect(page.getByLabel(/House or flat/)).toBeFocused();
  await page.getByLabel(/House or flat/).fill("Flat 1, Synthetic Road");
  await page.getByLabel(/Area or locality/).fill("Synthetic Nagar");
  await page.getByLabel(/Mobile number/).fill("98765 43210");
  await page.getByRole("checkbox").focus();
  await page.keyboard.press("Space");
  await page.getByRole("button", { name: "Continue" }).click();

  // Review and send.
  await expect(page.getByRole("heading", { name: "Check your request" })).toBeVisible();
  await expect(page.getByText("₹1,500 per visit, set by the provider")).toBeVisible();
  await expectNoSeriousAxe(page);
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByRole("heading", { name: "Request sent to Synthetic Clinic 1" })).toBeVisible();
  await expect(page.getByText("SCV-000000900001")).toBeVisible();
  await expect(page.getByText("Payment not collected online")).toBeVisible();

  // What reached the API: public reference for availability, server-side price, idempotency key, UTC start.
  expect(api.log).toContainEqual(`GET /api/availability?provider=${PROVIDER_REF}&service=${SERVICE_ID}&date=${BOOK_DATE}`);
  expect(api.bookingRequests).toHaveLength(1);
  const sent = api.bookingRequests[0]!;
  expect(sent.headers["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/);
  expect(sent.body).toEqual({
    patientId: "9a000000-0000-4000-8000-000000000001",
    serviceId: SERVICE_ID,
    addressId: "ad000000-0000-4000-8000-000000000001",
    startAt: `${BOOK_DATE}T04:30:00.000Z`,
  });
  expect(JSON.stringify(sent.body)).not.toMatch(/paise|price|amount|state|paid/i);

  // Visits list, then a two-step cancel with the row's version.
  await page.getByRole("link", { name: "Go to your visits" }).click();
  await expect(page.getByText("Waiting for provider")).toBeVisible();
  await page.getByRole("button", { name: /^Cancel request: Home visit/ }).click();
  await expect(page.getByRole("button", { name: "Yes, cancel" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Request SCV-000000900001 was cancelled.")).toBeVisible();
  expect(api.cancelRequests).toEqual([{ expectedVersion: 1, reason: "patient_request" }]);
  await expectNoSeriousAxe(page);
  await expectNoHorizontalScroll(page);

  expect(errors, "console / page errors").toEqual([]);
});

test("catalog failure shows an error with retry, then the list", async ({ page }) => {
  await mockBackend(page, { catalogFailures: 1 });
  await page.goto("/categories/doctor");
  await page.getByLabel("Your PIN code").fill("500001");
  await page.getByRole("button", { name: "Find doctors" }).click();
  await expect(page.getByRole("alert")).toContainText("not available right now");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Synthetic Clinic 2" })).toBeVisible();
});

test("a wrong password is reported, and a signed-in patient cannot open the admin area", async ({ page }) => {
  await mockBackend(page);
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill("patient@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill("wrong");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toContainText("do not match");

  await signIn(page);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("No visits planned")).toBeVisible();
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "This area is not part of your account" })).toBeVisible();
});

test("signed-out visitors are sent to sign-in from the app area", async ({ page }) => {
  await mockBackend(page);
  await page.goto("/dashboard");
  await page.waitForURL(/\/sign-in\?next=%2Fdashboard/);
  await expect(page.getByText("Sign in to continue to")).toBeVisible();
});
