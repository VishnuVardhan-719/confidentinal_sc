// @vitest-environment jsdom
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { createElement, type ComponentType, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string | { pathname: string }; children: ReactNode }) =>
    createElement("a", { href: typeof href === "string" ? href : href.pathname, ...rest }, children),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/lab/dashboard",
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => undefined }) }));

import * as admin from "@/components/admin/admin-views";
import * as ambulance from "@/components/ambulance/ambulance-views";
import * as caretaker from "@/components/caretaker/caretaker-views";
import * as cms from "@/components/content/cms-views";
import * as lab from "@/components/lab/lab-views";
import type { LoaderResult } from "@/modules/admin/access";
import { EN_MESSAGES, withIntl } from "./render-helpers";

/**
 * R9-E7: every list, queue and detail view in the lab, ambulance, caretaker, admin and CMS areas
 * renders each non-data state honestly: empty is an empty state (never an error or zeros), an error
 * is an alert with "Try again", a gated backend says "not connected", and a denied request shows the
 * access-denied panel without any data. Loading is a route-level loading.tsx (checked at the end).
 */

afterEach(cleanup);

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each view has its own result type
type AnyView = ComponentType<any>;
const VIEWS: [string, AnyView, Record<string, unknown>][] = [
  ["lab dashboard", lab.LabDashboardView, { workspaceName: "Synthetic Lab One" }],
  ["lab branches", lab.LabBranchesView, {}],
  ["lab catalogue", lab.LabCatalogView, {}],
  ["lab staff", lab.LabStaffView, {}],
  ["lab orders", lab.LabOrdersView, { queue: "pending" }],
  ["lab order detail", lab.LabOrderDetailView, {}],
  ["lab collections", lab.LabCollectionsView, {}],
  ["lab reports", lab.LabReportsView, {}],
  ["ambulance dashboard", ambulance.AmbulanceDashboardView, { workspaceName: "Synthetic Ambulance" }],
  ["ambulance fleet", ambulance.FleetView, {}],
  ["ambulance crew", ambulance.CrewView, {}],
  ["ambulance availability", ambulance.AvailabilityView, {}],
  ["ambulance requests", ambulance.RequestsView, {}],
  ["ambulance trips", ambulance.TripsView, { queue: "upcoming" }],
  ["ambulance trip detail", ambulance.TripDetailView, {}],
  ["ambulance driver", ambulance.DriverView, {}],
  ["caretaker dashboard", caretaker.CareDashboardView, { workspaceName: "Synthetic Care" }],
  ["caretaker services", caretaker.CareServicesView, {}],
  ["caretaker staff", caretaker.CareStaffView, {}],
  ["caretaker requests", caretaker.CareRequestsView, {}],
  ["caretaker assignments", caretaker.CareAssignmentsView, {}],
  ["caretaker shifts", caretaker.CareShiftsView, {}],
  ["caretaker assignment detail", caretaker.CareAssignmentDetailView, {}],
  ["admin dashboard", admin.AdminDashboardView, {}],
  ["admin users", admin.AdminUsersView, {}],
  ["admin payments", admin.PaymentsView, {}],
  ["admin support queue", admin.SupportQueueView, {}],
  ["admin audit", admin.AuditView, {}],
  ["admin settings", admin.SettingsView, {}],
  ["cms list", cms.CmsListView, { canEdit: true }],
  ["cms editor", cms.CmsEditorView, {}],
];

const MESSAGES = EN_MESSAGES;
const show = (View: AnyView, props: Record<string, unknown>, result: LoaderResult<unknown>) =>
  render(withIntl(createElement(View, { ...props, result }), MESSAGES));

const DENIED = "You do not have access to this page";
const ERROR_TITLE = "Something went wrong";

describe.each(VIEWS)("%s", (_name, View, props) => {
  it("empty: an empty state, no error, no denied panel", () => {
    const { container } = show(View, props, { status: "empty", fixture: false });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(DENIED)).toBeNull();
    expect(container.querySelector(".border-dashed, [data-not-connected]"), "empty state rendered").not.toBeNull();
  });

  it("error: an alert with Try again, never an empty state", () => {
    const { container } = show(View, props, { status: "error", code: "unavailable" });
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain(ERROR_TITLE);
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(container.querySelector(".border-dashed")).toBeNull();
  });

  it("gated: says the screen is not connected (or names the gate), with no data", () => {
    const { container } = show(View, props, { status: "gated" });
    const text = container.textContent ?? "";
    expect(/not connected|not available|turned off|switched off/i.test(text), text.slice(0, 200)).toBe(true);
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("denied: the access-denied panel and nothing else from the area", () => {
    const { container } = show(View, props, { status: "denied" });
    expect(screen.getByText(DENIED)).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(container.querySelectorAll("button").length, "no actions offered").toBe(0);
  });
});

describe("loading", () => {
  const APP = path.resolve(import.meta.dirname, "../../../src/app/[locale]");
  const pages = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const full = path.join(dir, n);
      return statSync(full).isDirectory() ? pages(full) : n === "page.tsx" ? [full] : [];
    });
  const hasLoading = (pageFile: string) => {
    for (let dir = path.dirname(pageFile); dir.length >= APP.length; dir = path.dirname(dir)) {
      if (existsSync(path.join(dir, "loading.tsx"))) return true;
    }
    return /<Suspense[\s>]/.test(readFileSync(pageFile, "utf8"));
  };

  /**
   * Story detail renders blocking on purpose: a loading boundary would flush the shell before
   * notFound() runs and turn the HTTP 404 for an unpublished slug into a soft 200. Its only await is
   * the published-story lookup that src/proxy.ts already made for the same request.
   */
  const EXEMPT = new Set([path.join("(public)", "stories", "[slug]", "page.tsx")]);

  it.each(["lab", "ambulance", "caretaker", "admin", "(public)/stories"])("every %s page has a loading state", (area) => {
    const missing = pages(path.join(APP, area))
      .filter((p) => !EXEMPT.has(path.relative(APP, p)) && !hasLoading(p))
      .map((p) => path.relative(APP, p));
    expect(missing).toEqual([]);
  });
});

