// @vitest-environment jsdom
/**
 * R9-P5 provider-side states for the admin moderation pages fe-p owns (/admin/reviews and
 * /admin/reviews/log): loading, empty, error, gated and permission denied, plus the populated and
 * paged views. Signed out is covered by tests/unit/modules-operations/admin-return-path.test.ts and
 * the e2e "redirects to login".
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => createElement("a", { href, ...rest }, children),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/admin/reviews",
}));

import AdminError from "@/app/[locale]/admin/error";
import AdminLoading from "@/app/[locale]/admin/loading";
import { DecisionLogView, ModerationQueueView } from "@/app/[locale]/admin/reviews/_components/moderation-views";
import { intlTree } from "./intl-helper";
import { fail, ok, type ApiResult } from "@/lib/api/result";
import type { ModerationItem, ModerationLogEntry, ModerationPage } from "@/modules/reviews";
import accessibility from "@/messages/en/accessibility.json";
import admin from "@/messages/en/admin.json";
import common from "@/messages/en/common.json";
import errors from "@/messages/en/errors.json";
import patientAccount from "@/messages/en/patientAccount.json";
import teAdmin from "@/messages/te/admin.json";
import teCommon from "@/messages/te/common.json";
import teErrors from "@/messages/te/errors.json";
import teAccessibility from "@/messages/te/accessibility.json";
import tePatientAccount from "@/messages/te/patientAccount.json";

afterEach(cleanup);

const EN = { accessibility, admin, common, errors, patientAccount };
const TE = { accessibility: teAccessibility, admin: teAdmin, common: teCommon, errors: teErrors, patientAccount: tePatientAccount };
const intl = (ui: ReactNode, locale: "en" | "te" = "en") =>
  intlTree(ui, locale, locale === "en" ? EN : TE);
const h = createElement;

const item = (n: number, status: ModerationItem["status"] = "pending_moderation"): ModerationItem => ({
  reviewId: `00000000-0000-4000-8000-00000000030${n}`,
  bookingReference: `SYN-BKG-03${String(n).padStart(2, "0")}`,
  category: "doctor",
  providerDisplayName: "Synthetic doctor 5",
  rating: 4,
  text: "Synthetic review text for testing only.",
  status,
  submittedAt: "2026-11-19T04:30:00.000Z",
  rejectionReason: status === "rejected" ? "spam" : null,
  version: 1,
});
const entry = (n: number): ModerationLogEntry => ({
  entryId: `00000000-0000-4000-8000-00000000040${n}`,
  bookingReference: `SYN-BKG-02${String(n).padStart(2, "0")}`,
  category: "lab",
  providerDisplayName: "Synthetic lab provider",
  outcome: n % 2 ? "rejected" : "published",
  reason: n % 2 ? "not_about_service" : null,
  decidedAt: `2026-11-1${n}T10:00:00.000Z`,
  decidedBySelf: n === 1,
});
const page = <T>(items: T[], nextCursor: string | null = null): ApiResult<ModerationPage<T>> => ok({ items, nextCursor });
const listHref = (c?: string) => `/admin/reviews?status=pending_moderation${c ? `&cursor=${c}` : ""}`;
const logHref = (c?: string) => (c ? `/admin/reviews/log?cursor=${c}` : "/admin/reviews/log");
const actions = () => h("button", { type: "button" }, "ACTIONS");
const queue = (result: ApiResult<ModerationPage<ModerationItem>>, extra: Partial<Parameters<typeof ModerationQueueView>[0]> = {}) =>
  render(intl(h(ModerationQueueView, { result, filter: "pending_moderation", done: null, listHref, renderActions: actions, ...extra })));

describe("moderation queue states", () => {
  it("populated: items, actions only on pending items, no pager on a single page", () => {
    queue(page([item(1), item(2)]));
    expect(screen.getByRole("heading", { level: 1, name: "Review moderation" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Waiting: 2 reviews" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "ACTIONS" })).toHaveLength(2);
    expect(screen.queryByRole("navigation", { name: "Review pages" })).toBeNull();
    cleanup();
    render(intl(h(ModerationQueueView, { result: page([item(3, "rejected")]), filter: "rejected", done: null, listHref, renderActions: actions })));
    expect(screen.queryByRole("button", { name: "ACTIONS" })).toBeNull();
    expect(screen.getByText("Reason: Advertising or spam")).toBeTruthy();
  });

  it("empty: a sentence for the filter, no list and no pager", () => {
    const { container } = queue(page<ModerationItem>([]));
    expect(screen.getByText("No reviews are waiting for moderation.")).toBeTruthy();
    expect(container.querySelector("main ul, section ul")).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Review pages" })).toBeNull();
  });

  it("paged: next page link with the opaque cursor; later pages link back to the first", () => {
    queue(page([item(1)], "p20"));
    const pager = screen.getByRole("navigation", { name: "Review pages" });
    expect(within(pager).getByRole("link", { name: "Next page" }).getAttribute("href")).toBe("/admin/reviews?status=pending_moderation&cursor=p20");
    expect(screen.getByRole("heading", { level: 2, name: "Waiting: 1 review on this page" })).toBeTruthy();
    cleanup();
    queue(page<ModerationItem>([]), { cursor: "p40" });
    const last = screen.getByRole("navigation", { name: "Review pages" });
    expect(within(last).getByRole("link", { name: "Back to first page" }).getAttribute("href")).toBe("/admin/reviews?status=pending_moderation");
    expect(within(last).getByText("End of this list")).toBeTruthy();
  });

  it("gated: honest not-connected notice, no list", () => {
    queue(fail("gated"));
    expect(screen.getByText("Review moderation is not connected yet. Nothing here is saved.")).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 2, name: /Waiting/ })).toBeNull();
  });

  it("permission denied: the server refused this principal -> denied view, no data", () => {
    queue(fail("forbidden"));
    expect(screen.getByRole("heading", { level: 2, name: admin.ops.denied.title })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "ACTIONS" })).toBeNull();
  });

  it("error: inline error with a retry action", () => {
    queue(fail("unavailable"));
    expect(screen.getByRole("button", { name: common.actions.retry })).toBeTruthy();
  });

  it("decision notices are announced in a status region", () => {
    queue(page([item(1)]), { done: "conflict" });
    expect(within(screen.getAllByRole("status")[0]).getByText(admin.reviews.conflict)).toBeTruthy();
  });

  it("te renders without raw keys", () => {
    const { container } = render(intl(h(ModerationQueueView, { result: page([item(1)], "p20"), filter: "pending_moderation", done: "published", listHref, renderActions: actions }), "te"));
    expect(container.textContent).toContain(teAdmin.reviews.title);
    expect(container.textContent).not.toMatch(/admin\.reviews\.|patientAccount\./);
  });
});

describe("decision log states", () => {
  it("populated: read-only, newest-first order as given, who decided, no controls", () => {
    const { container } = render(intl(h(DecisionLogView, { result: page([entry(3), entry(2), entry(1)]), logHref })));
    expect(screen.getByRole("heading", { level: 2, name: "3 decisions" })).toBeTruthy();
    expect(container.querySelectorAll("ol > li")).toHaveLength(3);
    expect(screen.getAllByText(/Decided by another moderator/)).toHaveLength(2);
    expect(screen.getByText(/Decided by you/)).toBeTruthy();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("empty, gated, denied and error states", () => {
    render(intl(h(DecisionLogView, { result: page<ModerationLogEntry>([]), logHref })));
    expect(screen.getByText(admin.reviews.log.empty)).toBeTruthy();
    cleanup();
    render(intl(h(DecisionLogView, { result: fail("gated"), logHref })));
    expect(screen.getByText(admin.reviews.log.gated)).toBeTruthy();
    cleanup();
    render(intl(h(DecisionLogView, { result: fail("forbidden"), logHref })));
    expect(screen.getByRole("heading", { level: 2, name: admin.ops.denied.title })).toBeTruthy();
    cleanup();
    render(intl(h(DecisionLogView, { result: fail("unavailable"), logHref })));
    expect(screen.getByRole("button", { name: common.actions.retry })).toBeTruthy();
  });

  it("paged: next link carries the cursor; past the end shows the end and the first-page link", () => {
    render(intl(h(DecisionLogView, { result: page([entry(1)], "l20"), logHref })));
    expect(screen.getByRole("link", { name: "Next page" }).getAttribute("href")).toBe("/admin/reviews/log?cursor=l20");
    cleanup();
    render(intl(h(DecisionLogView, { result: page<ModerationLogEntry>([]), cursor: "l999", logHref })));
    expect(screen.getByRole("heading", { level: 2, name: "0 decisions on this page" })).toBeTruthy();
    expect(screen.getByText(admin.reviews.log.end)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to first page" }).getAttribute("href")).toBe("/admin/reviews/log");
  });
});

describe("admin area loading and error boundaries (used by both moderation pages)", () => {
  it("loading announces a localized status", () => {
    render(intl(h(AdminLoading)));
    expect(within(screen.getByRole("status")).getByText(accessibility.loading)).toBeTruthy();
  });

  it("error boundary shows a retry and the digest only, never the raw message", () => {
    const retry = vi.fn();
    const err = Object.assign(new Error("secret internal detail"), { digest: "abc123" });
    const { container } = render(intl(h(AdminError, { error: err, retry })));
    screen.getByRole("button", { name: errors.boundary.retry }).click();
    expect(retry).toHaveBeenCalled();
    expect(container.textContent).toContain("abc123");
    expect(container.textContent).not.toContain("secret internal detail");
  });
});
