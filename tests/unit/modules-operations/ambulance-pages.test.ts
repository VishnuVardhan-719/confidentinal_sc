// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string | { pathname: string; query?: Record<string, string> }; children: ReactNode }) =>
    createElement("a", { href: typeof href === "string" ? href : `${href.pathname}?${new URLSearchParams(href.query).toString()}`, ...rest }, children),
  useRouter: () => ({ refresh: vi.fn() }),
  usePathname: () => "/ambulance/dashboard",
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => undefined }) }));

import { workspaceMemberships as W } from "@/fixtures/operations/workspaces";
import { listWorkspaces } from "@/modules/admin/workspace";
import { loadAmbulanceDashboard, loadDriverQueue, loadEmergencyPlaceholder, loadFleet, loadRequests, loadTripDetail } from "@/modules/ambulance/loaders";
import { AmbulanceDashboardView, DriverView, EmergencyView, FleetView, RequestsView, TripDetailView } from "@/components/ambulance/ambulance-views";
import { withIntl } from "./render-helpers";

afterEach(cleanup);
const FX = { FRONTEND_ADAPTER: "fixture", APP_ENV: "staging" };
const ETA = /\bETA\b|\b\d+\s*(min|mins|minutes)\b|arriving in|on the way|live (location|tracking)/i;
const ctx = (m: Parameters<typeof listWorkspaces>[0], now = "2026-11-20T03:00:00Z") => ({ workspace: listWorkspaces(m)[0], env: FX, now: () => new Date(now) });

describe("ambulance operator pages", () => {
  it("dashboard shows real counts, credential expiry and no ETA language", async () => {
    const { container } = render(withIntl(createElement(AmbulanceDashboardView, { result: await loadAmbulanceDashboard(ctx(W.ambulanceOperator)), workspaceName: "Op" })));
    expect(screen.getByTestId("metric-pending-requests").textContent).toBe("2");
    expect(screen.getByText("Fixture Van 2")).toBeTruthy();
    expect(screen.getByText("Synthetic data, not live")).toBeTruthy();
    expect(container.textContent).not.toMatch(ETA);
  });

  it("fleet labels an unverified vehicle as not verified", async () => {
    const { container } = render(withIntl(createElement(FleetView, { result: await loadFleet(ctx(W.ambulanceOperator)) })));
    const row = within(container.querySelector("tbody") as HTMLElement).getAllByRole("row")[2];
    expect(row.textContent).toContain("Fixture Van 3");
    expect(row.textContent).toContain("Type not verified");
  });

  it("requests: stale quote blocks accept; fresh quote can be accepted; decline needs a reason", async () => {
    const { container } = render(withIntl(createElement(RequestsView, { result: await loadRequests(ctx(W.ambulanceOperator)) })));
    const [stale, fresh] = within(container.querySelector("tbody") as HTMLElement).getAllByRole("row");
    expect((within(stale).getByRole("button", { name: "Accept" }) as HTMLButtonElement).disabled).toBe(true);
    expect(stale.textContent).toContain("Quote expired: re-quote before accepting");
    expect((within(fresh).getByRole("button", { name: "Accept" }) as HTMLButtonElement).disabled).toBe(false);
    expect(fresh.textContent).toContain("₹1,340.00");
    fireEvent.click(within(fresh).getByRole("button", { name: "Decline" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Decline" }));
    expect(await within(dialog).findByText("Select a reason to continue.")).toBeTruthy();
  });

  it("accept form lists only assignable vehicles and drivers", async () => {
    const { container } = render(withIntl(createElement(RequestsView, { result: await loadRequests(ctx(W.ambulanceOperator)) })));
    const fresh = within(container.querySelector("tbody") as HTMLElement).getAllByRole("row")[1];
    fireEvent.click(within(fresh).getByRole("button", { name: "Accept" }));
    const dialog = await screen.findByRole("dialog");
    const vehicle = within(dialog).getByLabelText("Vehicle") as HTMLSelectElement;
    expect([...vehicle.options].map((o) => o.textContent)).toEqual(["Select", "Fixture Van 1", "Fixture Van 2"]);
    const driver = within(dialog).getByLabelText("Driver") as HTMLSelectElement;
    expect([...driver.options].map((o) => o.textContent)).not.toContain("Fixture Driver C");
    fireEvent.click(within(dialog).getByRole("button", { name: "Accept and assign" }));
    expect((await within(dialog).findAllByText("Choose a vehicle.")).length).toBeGreaterThan(0);
  });

  it("trip detail has no milestone buttons for the operator", async () => {
    render(withIntl(createElement(TripDetailView, { result: await loadTripDetail(ctx(W.ambulanceOperator), "fx-trip-1") })));
    expect(screen.queryByRole("button", { name: "I have set off" })).toBeNull();
    expect(screen.getByText("Trip progress is recorded by the assigned driver only.")).toBeTruthy();
  });
});

describe("ambulance driver page", () => {
  it("shows only the current trip with a single next step and no ETA", async () => {
    const { container } = render(withIntl(createElement(DriverView, { result: await loadDriverQueue(ctx(W.ambulanceDriver)) })));
    expect(screen.getByRole("heading", { name: "#SCV-BKG-900311" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "I have set off" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Arrived at pickup" })).toBeNull();
    expect(container.textContent).not.toContain("#SCV-BKG-900313");
    expect(container.textContent).not.toMatch(ETA);
  });

  it("before the window, the driver sees no trip details", async () => {
    const { container } = render(withIntl(createElement(DriverView, { result: await loadDriverQueue(ctx(W.ambulanceDriver, "2026-11-19T00:00:00Z")) })));
    expect(screen.getByText("No trip right now")).toBeTruthy();
    expect(container.textContent).toContain("1 later trip assigned.");
    expect(container.textContent).not.toContain("#SCV-BKG-900311");
    expect(container.textContent).not.toContain("Fixture Nagar");
  });
});

describe("emergency placeholder", () => {
  it.each([{}, { FEATURE_EMERGENCY_DISPATCH: "true", FEATURE_GPS: "true" }])("dispatch unavailable, Call 112 tel link always shown (%o)", (env) => {
    const { container } = render(withIntl(createElement(EmergencyView, { guidance: loadEmergencyPlaceholder({ env }) })));
    const call = screen.getByRole("link", { name: "Call 112" });
    expect(call.getAttribute("href")).toBe("tel:112");
    expect(screen.getByText("Emergency dispatch is not available on SureCure Visit.")).toBeTruthy();
    expect(container.querySelector('[data-gate="emergencyDispatch"]')).toBeTruthy();
    expect(screen.queryByRole("button", { name: /dispatch|book emergency|request ambulance now/i })).toBeNull();
    expect(container.textContent).not.toMatch(ETA);
  });
});
