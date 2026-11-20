// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { createElement as h, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import accessibility from "@/messages/en/accessibility.json";
import common from "@/messages/en/common.json";
import errors from "@/messages/en/errors.json";
import payment from "@/messages/en/payment.json";
import services from "@/messages/en/services.json";
import bookingEn from "@/messages/en/booking.json";
import bookingTe from "@/messages/te/booking.json";
import bookingHi from "@/messages/hi/booking.json";
import { normalize, structuredSearchFor, type Speciality, type Symptom } from "@/modules/providers/doctor-search";
import { CANCEL_WINDOW_MINUTES, cancellationTermsFor, cancelState } from "@/modules/service-requests/core";

vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }));
const { CancelRequest } = await import("@/components/service-requests/request-controls");

afterEach(cleanup);

/**
 * R9-C9 fixes for fe-q's open ADVERSARIAL_REVIEW.md findings: 1b (service-request cancellation never shows an
 * invented approved policy), F8-2 (directory "not connected" states use GateNotice) and 5 (typed symptom and
 * speciality labels become taxonomy keys in the URL instead of free text).
 */
describe("1b: service-request cancellation terms", () => {
  const startAt = "2026-12-01T10:00:00.000Z";
  const start = Date.parse(startAt);

  it("only synthetic requests carry the labelled sample terms; real ones get none", () => {
    expect(cancellationTermsFor({ synthetic: true })).toEqual({ version: "synthetic-v1", cancelWindowMinutes: CANCEL_WINDOW_MINUTES });
    expect(cancellationTermsFor({ synthetic: false })).toBeNull();
  });

  it("without terms no window is guessed: an accepted request stays open (the dialog then refuses)", () => {
    expect(cancelState({ status: "CONFIRMED", startAt }, start - 60_000, null)).toBe("open");
    expect(cancelState({ status: "CONFIRMED", startAt }, start - 60_000, CANCEL_WINDOW_MINUTES)).toBe("closed");
    expect(cancelState({ status: "CONFIRMED", startAt }, start - 60_000)).toBe("closed");
    expect(cancelState({ status: "DECLINED", startAt }, 0, null)).toBe("final");
  });

  const messages = { accessibility, common, errors, payment, services };
  const withIntl = (ui: ReactNode) => h(NextIntlClientProvider, { locale: "en", messages, timeZone: "Asia/Kolkata", children: ui });

  it("an unavailable policy opens a dialog that cannot cancel and never calls the server", () => {
    const cancel = vi.fn();
    render(withIntl(h(CancelRequest, { id: "00000000-0000-4000-8000-000000000001", version: 1, policy: { state: "unavailable" }, cancel })));
    fireEvent.click(screen.getByRole("button", { name: services.common.status.cancel }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).not.toContain(services.common.status.policySummary);
    for (const button of Array.from(dialog.querySelectorAll("button"))) if (!button.disabled) fireEvent.click(button);
    expect(cancel).not.toHaveBeenCalled();
  });

  it("no component hard-codes an approved policy with a literal version", () => {
    const files = ["components/service-requests/request-controls.tsx", "components/service-requests/request-status.tsx", "app/[locale]/patient/book/[id]/page.tsx"];
    const src = path.resolve(import.meta.dirname, "../../../src");
    for (const file of files) expect(readFileSync(path.join(src, file), "utf8"), file).not.toMatch(/state:\s*"approved",\s*version:\s*"/);
  });
});

describe("F8-2: directory 'not connected' states use the shared GateNotice", () => {
  const src = path.resolve(import.meta.dirname, "../../../src");
  const files = ["components/directory/doctor-profile.tsx", "components/directory/doctor-search-page.tsx", "components/directory/lab-directory.tsx", "components/service-requests/provider-directory.tsx"];

  it("every gated branch renders GateNotice reason=contract_pending, never a hand-made lock Notice", () => {
    for (const file of files) {
      const text = readFileSync(path.join(src, file), "utf8");
      const gatedBranches = text.split("\n").filter(line => /code === "gated"/.test(line)).length;
      expect(gatedBranches, file).toBeGreaterThan(0);
      expect((text.match(/<GateNotice reason="contract_pending"/g) ?? []).length, file).toBeGreaterThanOrEqual(gatedBranches);
      expect(text, file).not.toMatch(/<Notice[^>]*icon="lock"/);
    }
  });

  it("the lab directory's gated state no longer offers 'Back to doctors' as its only way on", () => {
    const text = readFileSync(path.join(src, "components/directory/lab-directory.tsx"), "utf8");
    expect(text).not.toContain('ts("errorPage.back.book")');
  });
});

describe("5: typed symptom and speciality labels become taxonomy keys", () => {
  const labelsFor = (search: { specialities: Record<string, string>; symptoms: Record<string, string> }) => ({
    speciality: (key: Speciality) => search.specialities[key],
    symptom: (key: Symptom) => search.symptoms[key],
  });
  const en = labelsFor(bookingEn.search);

  it("exact labels map to symptom= or speciality=, ignoring case, accents and spacing", () => {
    expect(structuredSearchFor("Fever", en)).toEqual({ symptom: "fever" });
    expect(structuredSearchFor("  back   PAIN ", en)).toEqual({ symptom: "backPain" });
    expect(structuredSearchFor("cardiology", en)).toEqual({ speciality: "cardiology" });
    expect(structuredSearchFor(bookingEn.search.specialities.cardiology, en)).toEqual({ speciality: "cardiology" });
    expect(structuredSearchFor("general physician", en)).toEqual({ speciality: "general_physician" });
  });

  it("works in Telugu and Hindi with the active language's labels", () => {
    expect(structuredSearchFor(bookingTe.search.symptoms.fever, labelsFor(bookingTe.search))).toEqual({ symptom: "fever" });
    expect(structuredSearchFor(bookingHi.search.symptoms.jointPain, labelsFor(bookingHi.search))).toEqual({ symptom: "jointPain" });
  });

  it("anything that is not an exact label stays q (names, partial words); empty input gives nothing", () => {
    expect(structuredSearchFor("Synthetic doctor 1", en)).toEqual({ q: "Synthetic doctor 1" });
    expect(structuredSearchFor("fev", en)).toEqual({ q: "fev" });
    expect(structuredSearchFor("fever and cough", en)).toEqual({ q: "fever and cough" });
    expect(structuredSearchFor("   ", en)).toEqual({});
  });

  it("every symptom and speciality label is distinct after normalize, so a mapping is never ambiguous", () => {
    for (const search of [bookingEn.search, bookingTe.search, bookingHi.search]) {
      const all = [...Object.values(search.symptoms), ...Object.values(search.specialities)].map(normalize);
      expect(new Set(all).size).toBe(all.length);
    }
  });

  it("the search bar submits through structuredSearchFor", () => {
    const text = readFileSync(path.resolve(import.meta.dirname, "../../../src/components/directory/doctor-search-bar.tsx"), "utf8");
    expect(text).toMatch(/go\(q \? structuredSearchFor\(q, taxonomyLabels\) : \{\}\)/);
  });
});
