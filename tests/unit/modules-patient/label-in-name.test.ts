import { describe, expect, it } from "vitest";
import enAccount from "@/messages/en/patientAccount.json";
import teAccount from "@/messages/te/patientAccount.json";
import hiAccount from "@/messages/hi/patientAccount.json";
import enAdmin from "@/messages/en/admin.json";
import teAdmin from "@/messages/te/admin.json";
import hiAdmin from "@/messages/hi/admin.json";

/**
 * WCAG 2.5.3 label in name: where a control has an aria-label, its accessible name must contain the
 * visible text, in every locale. Pairs are [aria-label key, visible text key].
 */
type Msgs = Record<string, unknown>;
const get = (m: Msgs, path: string) => path.split(".").reduce<unknown>((o, k) => (o as Msgs)?.[k], m) as string;
const PAIRS: [string, string][] = [
  ["family.editLabel", "family.edit"],
  ["saved.viewLabel", "saved.view"],
  ["saved.saveLabel", "saved.save"],
  ["saved.unsaveLabel", "saved.unsave"],
  ["reviews.writeLabel", "reviews.write"],
  ["reviews.editLabel", "reviews.edit"],
  ["reviews.withdraw.triggerLabel", "reviews.withdraw.trigger"],
];
const ADMIN_PAIRS: [string, string][] = [
  ["reviews.publishLabel", "reviews.publish"],
  ["reviews.rejectLabel", "reviews.reject"],
];

describe("aria-labels contain the visible label (WCAG 2.5.3)", () => {
  for (const [locale, account, admin] of [["en", enAccount, enAdmin], ["te", teAccount, teAdmin], ["hi", hiAccount, hiAdmin]] as const) {
    it(`${locale}`, () => {
      const misses: string[] = [];
      for (const [label, visible] of PAIRS) if (!get(account, label).toLowerCase().includes(get(account, visible).toLowerCase())) misses.push(`patientAccount.${label}`);
      for (const [label, visible] of ADMIN_PAIRS) if (!get(admin, label).toLowerCase().includes(get(admin, visible).toLowerCase())) misses.push(`admin.${label}`);
      expect(misses).toEqual([]);
    });
  }
});
