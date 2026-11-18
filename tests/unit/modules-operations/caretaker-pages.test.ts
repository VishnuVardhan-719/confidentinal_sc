// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => createElement("a", { href, ...rest }, children),
  useRouter: () => ({ refresh: vi.fn() }),
  usePathname: () => "/caretaker/dashboard",
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => undefined }) }));

import { workspaceMemberships as W } from "@/fixtures/operations/workspaces";
import { listWorkspaces } from "@/modules/admin/workspace";
import { loadAssignments, loadCareRequests, loadCareServices, loadShifts } from "@/modules/caretaker/loaders";
import { CareAssignmentsView, CarePlansView, CareRequestsView, CareServicesView, CareShiftsView } from "@/components/caretaker/caretaker-views";
import { withIntl } from "./render-helpers";

afterEach(cleanup);
const FX = { FRONTEND_ADAPTER: "fixture", APP_ENV: "staging" };
const ctx = (m: Parameters<typeof listWorkspaces>[0]) => ({ workspace: listWorkspaces(m)[0], env: FX, now: () => new Date("2026-11-20T04:00:00Z") });
const CLINICAL = /medication|injection|wound|catheter|vital|diagnos|prescri/i;

describe("caretaker pages", () => {
  it("services show period rates, mark unsupported periods and offer no clinical tasks", async () => {
    const { container } = render(withIntl(createElement(CareServicesView, { result: await loadCareServices(ctx(W.agencyManager)) })));
    const table = container.querySelector("table") as HTMLElement;
    expect(table.textContent).toContain("₹300.00 per hour");
    expect(table.textContent).toContain("pending approval");
    expect(table.textContent).not.toMatch(CLINICAL);
  });

  it("requests offer accept only with caregivers covering every task", async () => {
    const { container } = render(withIntl(createElement(CareRequestsView, { result: await loadCareRequests(ctx(W.agencyManager)) })));
    const row = within(container.querySelector("tbody") as HTMLElement).getAllByRole("row")[0];
    expect(within(row).getByRole("button", { name: "Accept" })).toBeTruthy();
    expect(within(row).getByRole("button", { name: "Decline" })).toBeTruthy();
    expect(row.textContent).toContain("₹300.00 per hour × 4 = ₹1,200.00");
  });

  it("caregiver sees only own assignment with start/interrupt and no clinical action", async () => {
    const { container } = render(withIntl(createElement(CareAssignmentsView, { result: await loadAssignments(ctx(W.caregiverA)) })));
    const table = within(container.querySelector("table") as HTMLElement);
    expect(table.getByText("#SCV-BKG-900411")).toBeTruthy();
    expect(table.queryByText("#SCV-BKG-900412")).toBeNull();
    expect(table.getByRole("button", { name: "Start care" })).toBeTruthy();
    expect(table.queryAllByRole("button", { name: CLINICAL })).toEqual([]);
  });

  it("shifts: caregiver checks in; manager gets replacement for the absent shift", async () => {
    const cg = render(withIntl(createElement(CareShiftsView, { result: await loadShifts(ctx(W.caregiverA)) })));
    expect(within(cg.container.querySelector("table") as HTMLElement).getByRole("button", { name: "Check in" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Assign replacement" })).toBeNull();
    cleanup();
    render(withIntl(createElement(CareShiftsView, { result: await loadShifts(ctx(W.agencyManager)) })));
    expect(screen.getAllByRole("button", { name: "Assign replacement" }).length).toBeGreaterThan(0);
  });

  it("caregiver is denied staff-only data; plans are gated with no purchase controls", async () => {
    render(withIntl(createElement(CareRequestsView, { result: await loadCareRequests(ctx(W.caregiverA)) })));
    expect(screen.getByRole("heading", { name: "You do not have access to this page" })).toBeTruthy();
    cleanup();
    const { container } = render(withIntl(createElement(CarePlansView)));
    expect(container.querySelector("[data-not-connected]")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
