/**
 * fe-p R8-P2: patient edits and withdraws reviews (session + clinical on, seeded). Each project uses its
 * own seeded rows so parallel runs never touch the same review: mobile edits SYN-BKG-0206 and
 * withdraws 0208, desktop edits 0207 and withdraws 0209. Run once per server (the script restarts it).
 */
import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, test, type Page } from "@playwright/test";

const expect = baseExpect.configure({ timeout: 15_000 });
const MODE = process.env.E2E_FEP_MODE;
const CLINICAL = process.env.E2E_FEP_CLINICAL;
const ROWS = {
  mobile: { edit: ["00000000-0000-4000-8000-0000000002a6", "SYN-BKG-0206", "Synthetic lab provider"], withdraw: ["SYN-BKG-0208", "Synthetic doctor 6"] },
  desktop: { edit: ["00000000-0000-4000-8000-0000000002a7", "SYN-BKG-0207", "Synthetic doctor 5"], withdraw: ["SYN-BKG-0209", "Synthetic caretaker provider"] },
};
const rows = (page: Page) => ((page.viewportSize()?.width ?? 1280) < 1024 ? ROWS.mobile : ROWS.desktop);
const submitted = (page: Page) => page.getByRole("main").getByRole("region", { name: "Your submitted reviews" });

async function expectAxeClean(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

test.describe("review edit and withdraw (signed-in, seeded)", () => {
  test.skip(MODE !== "session" || CLINICAL !== "on", "needs the seeded session fixture server");

  test("a rejected review shows the reason; editing sends it back to moderation", async ({ page }) => {
    const [id, ref, provider] = rows(page).edit;
    await page.goto("/en/patient/reviews");
    const card = submitted(page).getByRole("listitem").filter({ hasText: ref });
    await expect(card).toContainText("Not published");
    await expect(card).toContainText("Why it was not published: It was not about the service received.");
    await card.getByRole("link", { name: `Edit review for ${provider}` }).click();
    await expect(page).toHaveURL(new RegExp(`/en/patient/reviews/${id}/edit$`));
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { level: 1, name: "Edit your review" })).toBeVisible();
    await expect(main.getByText("Editing sends the review back for moderation.", { exact: false })).toBeVisible();
    await expect(main.getByRole("radio", { name: "2 stars: Fair" })).toBeChecked();
    await expectAxeClean(page);

    await main.getByLabel("Your review").fill("short");
    await main.getByRole("button", { name: "Send changes" }).click();
    await expect(main.getByRole("alert").getByRole("link")).toHaveText(["Write at least 10 characters."]);
    // The radio input is visually hidden; its label is the click target.
    await main.getByText("3 stars: Good", { exact: true }).click();
    await expect(main.getByRole("radio", { name: "3 stars: Good" })).toBeChecked();
    await main.getByLabel("Your review").fill("Edited: the synthetic visit itself was on time and clear.");
    await main.getByRole("button", { name: "Send changes" }).click();
    await expect(page).toHaveURL(/\/en\/patient\/reviews\?status=edited$/);
    await expect(main.getByText("Your changes were sent and are waiting for moderation.")).toBeVisible();
    const after = submitted(page).getByRole("listitem").filter({ hasText: ref });
    await expect(after).toContainText("Waiting for moderation");
    await expect(after).toContainText("3 stars out of 5");
    await expect(after).toContainText("Edited: the synthetic visit");
  });

  test("withdraw needs confirmation, is final and removes the actions", async ({ page }) => {
    const [ref, provider] = rows(page).withdraw;
    await page.goto("/en/patient/reviews");
    const card = submitted(page).getByRole("listitem").filter({ hasText: ref });
    const trigger = card.getByRole("button", { name: `Withdraw your review for ${provider}` });
    await trigger.click();
    const dialog = page.getByRole("alertdialog", { name: "Withdraw this review?" }).or(page.getByRole("dialog", { name: "Withdraw this review?" }));
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await trigger.click();
    await dialog.getByRole("button", { name: "Yes, withdraw" }).click();
    await expect(page).toHaveURL(/status=withdrawn$/);
    await expect(page.getByRole("main").getByText("Your review was withdrawn.")).toBeVisible();
    const after = submitted(page).getByRole("listitem").filter({ hasText: ref });
    await expect(after).toContainText("Withdrawn");
    await expect(after).toContainText("You withdrew this review.");
    await expect(after.getByRole("button", { name: /^Withdraw/ })).toHaveCount(0);
    await expect(after.getByRole("link", { name: /^Edit/ })).toHaveCount(0);
  });

  test("te and hi render the edit page without raw keys", async ({ page }) => {
    const [id] = rows(page).edit;
    for (const locale of ["te", "hi"]) {
      await page.goto(`/${locale}/patient/reviews/${id}/edit`);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("main")).not.toContainText(/patientAccount\.|reviews\.(form|withdraw|state)\./);
    }
  });

  test("editing an unknown or unreviewed booking shows a notice, not a form", async ({ page }) => {
    for (const id of ["00000000-0000-4000-8000-0000000002ff", "00000000-0000-4000-8000-0000000002a5", "nope"]) {
      await page.goto(`/en/patient/reviews/${id}/edit`);
      await expect(page.getByRole("main").getByText("This visit is not available.", { exact: false })).toBeVisible();
      await expect(page.getByRole("button", { name: "Send changes" })).toHaveCount(0);
    }
  });
});
