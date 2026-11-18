import { test, expect, scenario, bookingId, privateMarker, visitFixture, expectFitsViewport, expectNoPrivateDraft } from "./fixture-test.mjs";

// FE09 / FRONTEND_MASTER §§5,10,19,20 (Family & privacy included).
// Every case is intentionally fixme: no page/auth/scenario integration is claimed.
scenario("patient.workspace", () => {
  test.use({ identity: "patient" });
  for (const width of [360, 390, 768, 1280]) {
    test.fixme("patient priorities and navigation fit " + width + "px", async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await visitFixture(page, "/en/patient/dashboard");
      await expect(page.getByTestId("patient-next-visit")).toBeVisible();
      await expect(page.getByRole("link", { name: "Find care", exact: true })).toBeVisible();
      await expect(page.getByTestId("profile-completion")).toBeVisible();
      await expect(page.getByTestId("patient-recent-notifications")).toBeVisible();
      await expect(page.getByTestId("provider-earnings")).toHaveCount(0);
      await expectFitsViewport(page);
      if (width < 768) await page.getByRole("button", { name: "Open navigation", exact: true }).click();
      const nav = page.getByRole("navigation", { name: "Patient navigation", exact: true });
      for (const [label, path] of [["Home", "dashboard"], ["Bookings", "bookings"], ["Records", "records"], ["Account", "profile"]]) {
        await expect(nav.getByRole("link", { name: label, exact: true })).toHaveAttribute("href", "/en/patient/" + path);
      }
      await expect(nav.getByRole("link", { name: /doctor dashboard|admin/i })).toHaveCount(0);
    });
  }
  test.fixme("bookings tabs and detail keep booking, clinical and payment states separate", async ({ page }) => {
    await visitFixture(page, "/en/patient/bookings");
    for (const name of ["Upcoming", "Past", "Cancelled"]) {
      await page.getByRole("tab", { name, exact: true }).click();
      await expect(page.getByRole("tab", { name, exact: true })).toHaveAttribute("aria-selected", "true");
      await expect(page.getByRole("tabpanel")).toBeVisible();
    }
    await page.goto("/en/patient/bookings/" + bookingId);
    await expect(page.getByTestId("booking-status")).toHaveText("Confirmed");
    await expect(page.getByTestId("payment-status")).toHaveText("Due");
    await expect(page.getByTestId("clinical-panel").getByTestId("gate-notice")).toBeVisible();
    await expect(page.getByTestId("booking-timeline")).toContainText(/requested|accepted|confirmed/i);
    await expect(page.getByRole("link", { name: "Download receipt", exact: true })).toHaveCount(0);
  });
  test.fixme("account routes have honest data or explicit gates and useful navigation", async ({ page }) => {
    for (const route of ["profile", "health-profile", "family", "addresses", "documents", "payments", "notifications", "support", "settings"]) {
      await visitFixture(page, "/en/patient/" + route);
      await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByTestId("patient-page-content")).toBeVisible();
      await expect(page.getByTestId("route-not-found")).toHaveCount(0);
    }
    await page.goto("/en/patient/memberships");
    await expect(page.getByTestId("gate-notice")).toBeVisible();
    await expect(page.getByRole("button", { name: /subscribe|buy plan/i })).toHaveCount(0);
  });
  for (const locale of ["te", "hi"]) {
    test.fixme(locale + " workspace preserves route and wraps native-script labels", async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 800 });
      await page.goto("/en/patient/bookings");
      await page.getByRole("combobox", { name: "Language", exact: true }).selectOption(locale);
      await expect(page).toHaveURL(new RegExp("/" + locale + "/patient/bookings$"));
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.getByRole("heading", { level: 1 })).not.toContainText(/patient\.[a-z]|booking\.[a-z]/);
      await expectFitsViewport(page);
    });
  }
});
scenario("patient.empty", () => {
  test.use({ identity: "patient" });
  test.fixme("no next visit is an empty state and bookings offer a real Find care action", async ({ page }) => {
    await visitFixture(page, "/en/patient/dashboard");
    await expect(page.getByTestId("patient-next-visit-empty")).toBeVisible();
    await page.goto("/en/patient/bookings");
    await expect(page.getByTestId("patient-bookings-empty")).toBeVisible();
    await expect(page.getByTestId("patient-booking-card")).toHaveCount(0);
    await page.getByRole("link", { name: "Find care", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/(doctors|lab-tests|ambulances|caretakers)(\?|$)/);
  });
});
scenario("patient.bookings_incomplete_page", () => {
  test.use({ identity: "patient" });
  test.fixme("a truncated page cannot claim no visits or an authoritative next visit", async ({ page }) => {
    await visitFixture(page, "/en/patient/dashboard");
    await expect(page.getByTestId("patient-next-visit-incomplete")).toBeVisible();
    await expect(page.getByTestId("patient-next-visit-empty")).toHaveCount(0);
    await page.goto("/en/patient/bookings");
    await expect(page.getByRole("button", { name: "Load more bookings", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Load more bookings", exact: true }).click();
    await expect(page.getByTestId("patient-booking-card")).toHaveCount(21);
  });
});
scenario("booking.cancellable", () => {
  test.use({ identity: "patient" });
  test.fixme("cancellation dialog shows server policy and consequences before explicit confirmation", async ({ page }) => {
    await visitFixture(page, "/en/patient/bookings/" + bookingId);
    const cancel = page.getByRole("button", { name: "Cancel booking", exact: true }); await cancel.click();
    const dialog = page.getByRole("dialog", { name: "Cancel booking", exact: true });
    await expect(dialog.getByTestId("cancellation-policy-version")).toHaveText("synthetic-policy-v1");
    await expect(dialog.getByTestId("cancellation-fee")).toContainText("₹0.00");
    await expect(dialog.getByTestId("cancellation-refund")).toContainText("₹0.00");
    await page.keyboard.press("Escape"); await expect(cancel).toBeFocused();
    await expect(page.getByTestId("booking-status")).toHaveText("Requested");
    await cancel.click(); await dialog.getByLabel("Reason", { exact: true }).selectOption("patient_request");
    await dialog.getByRole("button", { name: "Confirm cancellation", exact: true }).click();
    await expect(page.getByTestId("booking-status")).toHaveText("Cancelled");
    await expect(page.getByTestId("booking-timeline")).toContainText("Cancelled");
    await expect(page.getByTestId("payment-status")).not.toHaveText("Refunded");
  });
});
scenario("booking.cancellation_policy_missing", () => {
  test.use({ identity: "patient" });
  test.fixme("missing policy or fee quote blocks consequential cancellation", async ({ page }) => {
    await visitFixture(page, "/en/patient/bookings/" + bookingId);
    await expect(page.getByTestId("cancellation-unavailable")).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel booking", exact: true })).toBeDisabled();
    await expect(page.getByTestId("booking-status")).toHaveText("Requested");
  });
});
scenario("patient.records_gated", () => {
  test.use({ identity: "patient" });
  test.fixme("records remain gated and draft/other-member documents cannot appear as final", async ({ page }) => {
    await visitFixture(page, "/en/patient/records");
    await expect(page.getByTestId("gate-notice")).toBeVisible();
    await expect(page.getByRole("link", { name: /Synthetic draft record/ })).toHaveCount(0);
    await page.goto("/en/patient/records/00000000-0000-4000-8000-000000000099");
    await expect(page.getByTestId("private-access-denied")).toBeVisible();
    await expect(page.getByRole("link", { name: "Download PDF", exact: true })).toHaveCount(0);
  });
});
scenario("patient.notifications_write_fails", () => {
  test.use({ identity: "patient" });
  test.fixme("failed optimistic notification read rolls back and exposes retry", async ({ page }) => {
    await visitFixture(page, "/en/patient/notifications");
    const notification = page.getByTestId("notification-item").first();
    await expect(notification.getByText("Unread", { exact: true })).toBeVisible();
    await notification.getByRole("button", { name: "Mark as read", exact: true }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(notification.getByText("Unread", { exact: true })).toBeVisible();
    await notification.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(notification.getByText("Unread", { exact: true })).toHaveCount(0);
  });
});
scenario("patient.support", () => {
  test.use({ identity: "patient" });
  test.fixme("support ticket returns its actual reference and authorized timeline", async ({ page }) => {
    await visitFixture(page, "/en/patient/support");
    await page.getByRole("button", { name: "New ticket", exact: true }).click();
    await page.getByLabel("Category", { exact: true }).selectOption("service");
    await page.getByLabel("Description", { exact: true }).fill("Synthetic E2E scheduling assistance");
    await page.getByRole("button", { name: "Submit ticket", exact: true }).click();
    await expect(page.getByTestId("support-reference")).not.toBeEmpty();
    await expect(page.getByTestId("support-timeline")).toBeVisible();
    await expect(page.getByTestId("support-status")).toHaveText("Open");
    await expect(page.getByTestId("support-timeline")).not.toContainText(privateMarker);
  });
});
scenario("patient.workspace_switch", () => {
  test.use({ identity: "patient" });
  test.fixme("switching to another authorized workspace clears previous private views", async ({ page }) => {
    await visitFixture(page, "/en/patient/bookings/" + bookingId);
    await page.getByRole("combobox", { name: "Workspace", exact: true }).selectOption("synthetic-other-workspace");
    await expect(page.getByTestId("workspace-switch-pending")).toBeVisible();
    await expect(page.getByTestId("patient-booking-detail")).toHaveCount(0);
    await page.goto("/en/patient/bookings/" + bookingId);
    await expect(page.getByTestId("private-access-denied")).toBeVisible();
  });
});
scenario("patient.workspace", () => {
  test.use({ identity: "patient" });
  test.fixme("logout clears private drafts and browser Back does not restore an authorized page", async ({ page }) => {
    await visitFixture(page, "/en/patient/health-profile");
    await page.getByLabel("Important notes", { exact: true }).fill(privateMarker);
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/(login|$)/);
    await page.goBack(); await expect(page.getByTestId("patient-page-content")).toHaveCount(0);
    await expectNoPrivateDraft(page);
  });
});
scenario("patient.guest", () => {
  test.fixme("direct private URLs require sign-in with a safe locale-aware return path", async ({ page }) => {
    await page.goto("/hi/patient/bookings/" + bookingId);
    await expect(page).toHaveURL(/\/hi\/login(?:\?|$)/);
    const url = new URL(page.url()); const destination = url.searchParams.get("next");
    expect(destination).toBe("/hi/patient/bookings/" + bookingId);
    await expect(page.getByTestId("patient-booking-detail")).toHaveCount(0);
  });
});
scenario("patient.wrong_role", () => {
  test.use({ identity: "provider" });
  test.fixme("an authenticated provider cannot directly open a patient's booking", async ({ page }) => {
    await page.goto("/en/patient/bookings/" + bookingId);
    await expect(page.getByTestId("private-access-denied")).toBeVisible();
    await expect(page.getByTestId("patient-booking-detail")).toHaveCount(0);
  });
});
scenario("directory.available", () => {
  test.fixme("scheduled transport keeps 112 available to guests with JavaScript disabled", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, javaScriptEnabled: false, storageState: { cookies: [], origins: [] } });
    try {
      const page = await context.newPage(); await page.goto("/en/ambulances");
      await expect(page.getByRole("link", { name: /112/ })).toHaveAttribute("href", "tel:112");
      await expect(page.getByRole("button", { name: /dispatch now|emergency booking/i })).toHaveCount(0);
    } finally { await context.close(); }
  });
});
