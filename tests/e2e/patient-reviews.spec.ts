/**
 * fe-p R7: post-visit reviews against the synthetic fixture app. Modes as in patient-family.spec.ts.
 * Seeded visits: SYN-BKG-0201 (doctor) and SYN-BKG-0202 (lab) completed and due; 0203 pending
 * moderation; 0204 published; 0205 not completed. The store is shared and a review can be sent once,
 * so the mobile project reviews 0201 and the desktop project reviews 0202 (run each mode once per server).
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const MODE = process.env.E2E_FEP_MODE;
const CLINICAL = process.env.E2E_FEP_CLINICAL;
const IDS = { doctorDue: "00000000-0000-4000-8000-0000000002a1", labDue: "00000000-0000-4000-8000-0000000002a2", published: "00000000-0000-4000-8000-0000000002a4", upcoming: "00000000-0000-4000-8000-0000000002a5" };

async function expectAxeClean(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}
async function expectNoHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
}
const isNarrow = (page: Page) => (page.viewportSize()?.width ?? 1280) < 1024;

test.describe("reviews (signed-in, seeded)", () => {
  test.skip(MODE !== "session" || CLINICAL !== "on", "needs the session fixture server (seeded visits)");

  test("list separates visits to review from submitted reviews with moderation badges", async ({ page }) => {
    await page.goto("/en/patient/reviews");
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { level: 1, name: "Your reviews" })).toBeVisible();
    const due = main.getByRole("region", { name: /visits? to review/ });
    await expect(due.getByRole("link", { name: /^Write a review for/ }).first()).toBeVisible();
    await expect(due).not.toContainText("SYN-BKG-0205");
    const done = main.getByRole("region", { name: "Your submitted reviews" });
    const pending = done.getByRole("listitem").filter({ hasText: "SYN-BKG-0203" });
    await expect(pending).toContainText("Waiting for moderation");
    await expect(pending).toContainText("4 stars out of 5");
    await expect(pending).toContainText("only you can see this review");
    await expect(done.getByRole("listitem").filter({ hasText: "SYN-BKG-0204" })).toContainText("Published");
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);
  });

  test("validation errors, then a successful review that waits for moderation", async ({ page }) => {
    const [id, ref] = isNarrow(page) ? [IDS.doctorDue, "SYN-BKG-0201"] : [IDS.labDue, "SYN-BKG-0202"];
    await page.goto(`/en/patient/reviews/${id}`);
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { level: 1, name: "Review your visit" })).toBeVisible();
    await expectAxeClean(page);

    await main.getByRole("button", { name: "Send review" }).click();
    const summary = main.getByRole("alert").filter({ hasText: "Choose a rating" });
    await expect(summary).toBeFocused();
    await expect(summary.getByRole("link")).toHaveText(["Choose a rating from 1 to 5 stars.", "Write at least 10 characters."]);
    await summary.getByRole("link", { name: "Choose a rating from 1 to 5 stars." }).click();
    await expect(main.getByRole("radio", { name: "1 star: Poor" })).toBeFocused();

    // Keyboard: arrow keys move through the star options.
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(main.getByRole("radio", { name: "4 stars: Very good" })).toBeChecked();
    await main.getByLabel("Your review").fill("Call me on 98765 43210 for details");
    await main.getByRole("button", { name: "Send review" }).click();
    await expect(main.getByRole("alert").getByRole("link")).toHaveText(["Remove phone numbers, emails and links from your review."]);

    await main.getByLabel("Your review").fill("Arrived on time and explained the synthetic visit clearly.");
    await main.getByRole("button", { name: "Send review" }).click();
    await expect(page).toHaveURL(/\/en\/patient\/reviews\?status=sent$/);
    await expect(main.getByText("Your review was sent and is waiting for moderation.")).toBeVisible();
    const mine = main.getByRole("region", { name: "Your submitted reviews" }).getByRole("listitem").filter({ hasText: ref });
    await expect(mine).toContainText("Waiting for moderation");
    await expect(mine).toContainText("4 stars out of 5");

    // One review per booking: the form is gone for this visit.
    await page.goto(`/en/patient/reviews/${id}`);
    await expect(main.getByText("You have already reviewed this visit.", { exact: false })).toBeVisible();
    await expect(main.getByRole("button", { name: "Send review" })).toHaveCount(0);
  });

  test("not-completed, reviewed and unknown bookings show a notice instead of the form", async ({ page }) => {
    for (const [id, text] of [
      [IDS.upcoming, "Only completed visits can be reviewed."],
      [IDS.published, "You have already reviewed this visit."],
      ["00000000-0000-4000-8000-0000000002ff", "This visit is not available."],
      ["not-a-booking", "This visit is not available."],
    ]) {
      await page.goto(`/en/patient/reviews/${id}`);
      await expect(page.getByRole("main").getByText(text, { exact: false })).toBeVisible();
      await expect(page.getByRole("button", { name: "Send review" })).toHaveCount(0);
    }
  });

  test("te and hi render the list and the form without raw keys", async ({ page }) => {
    for (const locale of ["te", "hi"]) {
      for (const path of ["patient/reviews", `patient/reviews/${IDS.upcoming}`]) {
        await page.goto(`/${locale}/${path}`);
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
        await expect(page.getByRole("main")).not.toContainText(/patientAccount\.|reviews\.(form|state|status)\./);
        await expectNoHorizontalScroll(page);
      }
      await page.goto(`/${locale}/patient/reviews`);
      await expectAxeClean(page);
    }
  });
});

test.describe("reviews (signed-in, empty)", () => {
  test.skip(MODE !== "session" || CLINICAL !== "off", "needs FIXTURE_REVIEWS_SCENARIO=empty");

  test("empty state points to bookings", async ({ page }) => {
    await page.goto("/en/patient/reviews");
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { name: "No visits to review" })).toBeVisible();
    await expect(main.getByRole("link", { name: "View your bookings" })).toHaveAttribute("href", "/en/patient/bookings");
    await expectAxeClean(page);
  });
});

test.describe("reviews (guest)", () => {
  test.skip(MODE !== "guest", "needs the guest-mode fixture server");

  test("redirects to login; the booking id never travels in the return path", async ({ page }) => {
    for (const [path, next] of [["/en/patient/reviews", "/en/patient/reviews"], [`/hi/patient/reviews/${IDS.doctorDue}`, "/hi/patient/reviews"]]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/(en|te|hi)\/login\?/);
      expect(new URL(page.url()).searchParams.get("next")).toBe(next);
    }
  });
});
