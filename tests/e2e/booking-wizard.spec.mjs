import { test, expect, scenario, categories, providerId, addressId, privateMarker, visitFixture, expectFitsViewport, expectNoPrivateDraft } from "./fixture-test.mjs";

// FE08 / FRONTEND_MASTER §§9,19,20. Scenario clock: 2026-11-18T00:00:00Z.
// Removing fixme also requires a reviewed synthetic offer/consent prepare boundary.
test.use({ identity: "patient" });
const steps = ["service", "patient", "location", "schedule", "details", "paymentPolicy", "review", "result"];
async function currentStep(page, name) {
  await expect(page.getByTestId("booking-step-" + name)).toBeVisible();
  await expect(page.getByTestId("booking-progress").locator('[aria-current="step"]')).toHaveAttribute("data-step", name);
}
async function next(page) { await page.getByRole("button", { name: "Continue", exact: true }).click(); }
async function reachReview(page, category = categories[0], patientName = "Myself", options = {}) {
  await visitFixture(page, "/en/" + category.route + "/" + providerId(category.index) + "?pin=500001");
  await page.getByRole("button", { name: "Request care", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/patient\/bookings\/new$/);
  await currentStep(page, "service");
  await expect(page.getByTestId("booking-progress").getByRole("listitem")).toHaveCount(8);
  await next(page); await currentStep(page, "patient");
  await page.getByRole("radio", { name: patientName, exact: true }).check();
  await next(page); await currentStep(page, "location");
  await page.getByLabel("Saved address", { exact: true }).selectOption(addressId);
  await next(page); await currentStep(page, "schedule");
  await page.getByLabel("Visit date", { exact: true }).fill("2026-11-20");
  await page.getByLabel("Visit time (IST)", { exact: true }).fill("10:00");
  await next(page); await currentStep(page, "details");
  if (category.category === "doctor") await page.getByLabel("Reason for visit", { exact: true }).fill(privateMarker);
  if (category.category === "lab") {
    await page.getByRole("checkbox", { name: "Synthetic lab service", exact: true }).check();
    if (category.multi) await page.getByRole("checkbox", { name: "Additional synthetic lab test", exact: true }).check();
    await page.getByRole("radio", { name: "Home collection", exact: true }).check();
  }
  if (category.category === "ambulance") {
    await expect(page.getByTestId("scheduled-transport-notice")).toBeVisible();
    await page.getByLabel("Destination address", { exact: true }).selectOption("00000000-0000-4000-8000-000000000022");
    await page.getByLabel("Passengers", { exact: true }).fill("1");
    await expect(page.getByRole("link", { name: /112/ })).toHaveAttribute("href", "tel:112");
  }
  if (category.category === "caretaker") {
    await page.getByRole("checkbox", { name: "Companionship", exact: true }).check();
    await page.getByLabel("Hours", { exact: true }).fill("1");
    await expect(page.getByTestId("nonclinical-scope-notice")).toBeVisible();
  }
  await next(page); await currentStep(page, "paymentPolicy");
  if (options.stopAtPolicy) return;
  await page.getByRole("radio", { name: "Pay after service", exact: true }).check();
  await expect(page.getByTestId("booking-price-snapshot")).toContainText(category.multi ? "₹1,000.00" : "₹500.00");
  await expect(page.getByTestId("booking-policy-version")).not.toBeEmpty();
  await page.getByRole("checkbox", { name: "I accept the cancellation policy", exact: true }).check();
  await next(page); await currentStep(page, "review");
  await expect(page.getByTestId("booking-review-schedule")).toContainText(/10:00/);
  await expect(page.getByTestId("booking-review-schedule")).toContainText(/IST/);
  await expectNoPrivateDraft(page);
}

scenario("booking.requestable", () => {
  for (const category of categories) {
    test.fixme(category.category + " completes all eight steps with an honest REQUESTED receipt", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await reachReview(page, category);
      await page.getByRole("button", { name: "Request booking", exact: true }).click();
      await currentStep(page, steps[7]);
      await expect(page.getByTestId("booking-status")).toHaveText("Requested");
      await expect(page.getByTestId("booking-result")).not.toContainText(/booking confirmed|payment successful/i);
      await expect(page.getByTestId("booking-result")).not.toContainText(/SCV-[A-Z0-9-]+/);
      await expect(page.getByRole("link", { name: "View booking", exact: true })).toHaveAttribute("href", /^\/en\/patient\/bookings\/[0-9a-f-]{36}$/);
      await expectFitsViewport(page); await expectNoPrivateDraft(page);
    });
  }
  for (const width of [360, 768, 1280]) {
    test.fixme("review remains usable at " + width + "px and does not expose private draft state", async ({ page }) => {
      await page.setViewportSize({ width, height: 900 }); await reachReview(page);
      await expect(page.getByRole("button", { name: "Request booking", exact: true })).toBeEnabled();
      await expectFitsViewport(page); await expectNoPrivateDraft(page);
    });
  }
  test.fixme("invalid schedule focuses its field error; back preserves safe draft values", async ({ page }) => {
    await reachReview(page);
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await currentStep(page, "details");
    await expect(page.getByLabel("Reason for visit", { exact: true })).toHaveValue(privateMarker);
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await currentStep(page, "schedule");
    await page.getByLabel("Visit date", { exact: true }).fill("2026-11-17"); await next(page);
    await expect(page.getByTestId("form-error-summary")).toBeVisible();
    await expect(page.getByLabel("Visit date", { exact: true })).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByLabel("Visit date", { exact: true })).toBeFocused();
    await expect(page.getByTestId("booking-result")).toHaveCount(0);
  });
});
scenario("booking.delayed_create", () => {
  test.fixme("double-click is one request and produces one server-backed booking", async ({ page, appObserver }) => {
    await reachReview(page);
    const observation = await appObserver.begin("double-click");
    await page.getByRole("button", { name: "Request booking", exact: true }).dblclick();
    await expect(page.getByTestId("booking-submit-pending")).toBeVisible();
    await expect(page.getByRole("button", { name: "Request booking", exact: true })).toBeDisabled();
    const calls = await appObserver.settle(observation);
    expect(calls).toMatchObject({ createCalls: 1, persistedBookings: 1, uniqueIntentKeys: 1, bodyChanges: 0, inFlight: 0 });
    await currentStep(page, "result");
    const detailHref = await page.getByRole("link", { name: "View booking", exact: true }).getAttribute("href");
    expect(detailHref).toMatch(/^\/en\/patient\/bookings\/[0-9a-f-]{36}$/);
    await page.goto("/en/patient/bookings");
    await expect(page.getByTestId("patient-booking-card")).toHaveCount(1);
    await expect(page.getByTestId("patient-booking-card").getByRole("link")).toHaveAttribute("href", detailHref);
  });
});
scenario("booking.uncertain_after_commit", () => {
  test.fixme("lost create response stays uncertain until explicit reconciliation; no new intent", async ({ page, appObserver }) => {
    await reachReview(page);
    const observation = await appObserver.begin("lost-response-reconciliation");
    await page.getByRole("button", { name: "Request booking", exact: true }).click();
    await expect(page.getByTestId("booking-uncertain")).toBeVisible();
    await expect(page.getByTestId("booking-result")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Back", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Request booking", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Check request status", exact: true }).click();
    expect(await appObserver.settle(observation)).toMatchObject({ createCalls: 2, persistedBookings: 1, uniqueIntentKeys: 1, bodyChanges: 0, inFlight: 0 });
    await currentStep(page, "result");
    await expect(page.getByTestId("booking-status")).toHaveText("Requested");
    await page.goto("/en/patient/bookings"); await expect(page.getByTestId("patient-booking-card")).toHaveCount(1);
  });
});
for (const change of ["changed_price", "changed_policy"]) {
  scenario("booking." + change, () => {
    test.fixme(change + " invalidates review and requires explicit fresh approval", async ({ page }) => {
      await reachReview(page); await page.getByRole("button", { name: "Request booking", exact: true }).click();
      await expect(page.getByRole("alert")).toBeVisible();
      await expect(page.getByTestId("booking-result")).toHaveCount(0);
      await expect(page.getByTestId("booking-reapproval-required")).toBeVisible();
      await expect(page.getByRole("checkbox", { name: "I accept the cancellation policy", exact: true })).not.toBeChecked();
      await expectNoPrivateDraft(page);
    });
  });
}
scenario("booking.stale_slot", () => {
  test.fixme("a stale slot requires a new schedule instead of a fabricated receipt", async ({ page }) => {
    await reachReview(page); await page.getByRole("button", { name: "Request booking", exact: true }).click();
    await expect(page.getByTestId("schedule-conflict")).toBeVisible();
    await expect(page.getByTestId("booking-result")).toHaveCount(0);
    await page.getByRole("button", { name: "Choose another time", exact: true }).click();
    await currentStep(page, "schedule");
    await expect(page.getByRole("button", { name: "Request booking", exact: true })).toHaveCount(0);
  });
});
scenario("patient.incomplete", () => {
  test.fixme("incomplete questionnaire cannot advance to private booking details", async ({ page }) => {
    await visitFixture(page, "/en/patient/bookings/new");
    await expect(page.getByTestId("profile-completion-required")).toBeVisible();
    await expect(page.getByRole("link", { name: "Complete health profile", exact: true })).toHaveAttribute("href", /\/en\/patient\/(onboarding|health-profile)/);
    await expect(page.getByRole("button", { name: "Request booking", exact: true })).toHaveCount(0);
  });
});
scenario("family.denied", () => {
  test.fixme("an adult without a grant cannot be selected or reveal private family details", async ({ page }) => {
    await visitFixture(page, "/en/patient/bookings/new");
    await next(page); await currentStep(page, "patient");
    await expect(page.getByTestId("family-access-denied")).toBeVisible();
    await expect(page.getByRole("radio", { name: "Synthetic unapproved adult", exact: true })).toHaveCount(0);
    await expect(page.getByTestId("family-private-record")).toHaveCount(0);
  });
});
scenario("booking.requestable", () => {
  test.fixme("offline state does not queue a booking or auto-submit on reconnect", async ({ page, context, appObserver }) => {
    await reachReview(page);
    const observation = await appObserver.begin("offline-reconnect");
    await context.setOffline(true);
    await expect(page.getByTestId("offline-banner")).toBeVisible();
    await expect(page.getByRole("button", { name: "Request booking", exact: true })).toBeDisabled();
    await context.setOffline(false);
    await expect(page.getByRole("button", { name: "Request booking", exact: true })).toBeEnabled();
    expect(await appObserver.settle(observation)).toMatchObject({ createCalls: 0, persistedBookings: 0, inFlight: 0 });
    await expect(page.getByTestId("booking-result")).toHaveCount(0);
    await expectNoPrivateDraft(page);
  });
});

scenario("family.authorized", () => {
  test.fixme("a granted family member is selected explicitly and remains the reviewed patient", async ({ page }) => {
    await reachReview(page, categories[0], "Synthetic authorized family member");
    await expect(page.getByTestId("booking-review-patient")).toHaveText("Synthetic authorized family member");
    await expectNoPrivateDraft(page);
  });
});
scenario("booking.lab_multi", () => {
  test.fixme("multiple distinct tests have a server-reviewed total and no duplicate line", async ({ page }) => {
    await reachReview(page, { ...categories[1], multi: true });
    await expect(page.getByTestId("booking-review-test-line")).toHaveCount(2);
    await expect(page.getByTestId("booking-review-total")).toContainText("₹1,000.00");
    await expect(page.getByRole("button", { name: "Request booking", exact: true })).toBeEnabled();
  });
});
scenario("booking.policy_missing", () => {
  test.fixme("missing approved policy blocks checkout even with complete prior steps", async ({ page }) => {
    await reachReview(page, categories[0], "Myself", { stopAtPolicy: true });
    await expect(page.getByTestId("booking-policy-gate")).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeDisabled();
    await expect(page.getByTestId("booking-result")).toHaveCount(0);
  });
});
