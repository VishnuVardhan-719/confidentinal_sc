// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string | { pathname: string; query?: Record<string, string> }; children: ReactNode }) =>
    createElement("a", { href: typeof href === "string" ? href : `${href.pathname}?${new URLSearchParams(href.query).toString()}`, ...rest }, children),
  useRouter: () => ({ refresh, push: vi.fn() }),
  usePathname: () => "/admin/audit",
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => undefined }) }));
vi.mock("next/server", () => ({ connection: async () => undefined }));

import { AuditView } from "@/components/admin/admin-views";
import { BookingSearchForm } from "@/components/admin/admin-forms";
import { readCursor } from "@/components/admin/ops/cursor";
import { OpsAction } from "@/components/admin/ops/ops-action";
import { WorkspaceChooser } from "@/components/admin/ops/workspace-switcher";
import { AcceptRequestForm } from "@/components/ambulance/accept-request-form";
import { TripsView } from "@/components/ambulance/ambulance-views";
import { CatalogEditForm } from "@/components/lab/catalog-edit-form";
import { adminPrincipals } from "@/fixtures/operations/admin";
import { workspaceMemberships as W } from "@/fixtures/operations/workspaces";
import type { LoaderResult } from "@/modules/admin/access";
import type { ActionResult } from "@/modules/admin/action-result";
import { loadAudit } from "@/modules/admin/loaders";
import { listWorkspaces } from "@/modules/admin/workspace";
import { loadTrips } from "@/modules/ambulance/loaders";
import { withIntl } from "./render-helpers";

afterEach(() => {
  cleanup();
  refresh.mockReset();
});

const FX = { FRONTEND_ADAPTER: "fixture", APP_ENV: "staging" };
const NOW = () => new Date("2026-11-20T03:00:00Z");
const audit = () => loadAudit({ principal: adminPrincipals.superAdmin, env: FX, now: NOW });
const trips = () => loadTrips({ workspace: listWorkspaces(W.ambulanceOperator)[0], env: FX, now: NOW }, "today");
/** Fixture adapters return a single page; set a cursor to exercise the continuation control. */
function withNext<T extends { nextCursor: string | null }>(r: LoaderResult<T>, nextCursor: string | null): LoaderResult<T> {
  expect(r.status).toBe("ok");
  return r.status === "ok" ? { ...r, data: { ...r.data, nextCursor } } : r;
}

function deferred() {
  let resolve!: (r: ActionResult) => void;
  const promise = new Promise<ActionResult>((r) => (resolve = r));
  return { promise, resolve };
}

describe("readCursor", () => {
  it("accepts short URL-safe tokens and rejects anything else", () => {
    expect(readCursor("abc_123-XYZ.~=+/")).toBe("abc_123-XYZ.~=+/");
    expect(readCursor(undefined)).toBeUndefined();
    expect(readCursor("")).toBeUndefined();
    expect(readCursor(["a", "b"])).toBeUndefined();
    expect(readCursor("a".repeat(201))).toBeUndefined();
    expect(readCursor("<script>")).toBeUndefined();
    expect(readCursor("a b")).toBeUndefined();
  });
});

describe("cursor continuation", () => {
  it("audit shows Show more with nextCursor and keeps filters", async () => {
    render(withIntl(createElement(AuditView, { category: "booking", result: withNext(await audit(), "c2") })));
    const more = screen.getByRole("link", { name: "Show more" });
    expect(more.getAttribute("href")).toBe("/admin/audit?category=booking&cursor=c2");
    expect(screen.queryByRole("link", { name: "Back to the first page" })).toBeNull();
  });

  it("audit on a later page offers the first page and hides Show more at the end", async () => {
    render(withIntl(createElement(AuditView, { cursor: "c2", result: withNext(await audit(), null) })));
    expect(screen.queryByRole("link", { name: "Show more" })).toBeNull();
    expect(screen.getByRole("link", { name: "Back to the first page" }).getAttribute("href")).toBe("/admin/audit?");
  });

  it("trips continuation keeps the queue", async () => {
    render(withIntl(createElement(TripsView, { queue: "today", result: withNext(await trips(), "n1") })));
    expect(screen.getByRole("link", { name: "Show more" }).getAttribute("href")).toBe("/ambulance/trips?queue=today&cursor=n1");
  });
});

describe("pending tracking", () => {
  it("OpsAction is busy while the action runs and drops a double click", async () => {
    const d = deferred();
    const run = vi.fn(() => d.promise);
    render(withIntl(createElement(OpsAction, { run, labels: { label: "Do it", done: "Done" } })));
    const button = screen.getByRole("button", { name: "Do it" }) as HTMLButtonElement;
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(button.disabled).toBe(true));
    expect(run).toHaveBeenCalledTimes(1);
    await act(async () => d.resolve({ ok: true }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("OpsAction turns a rejected action into an error and re-enables", async () => {
    const run = vi.fn(() => Promise.reject(new Error("network")));
    render(withIntl(createElement(OpsAction, { run, labels: { label: "Do it", done: "Done" } })));
    const button = screen.getByRole("button", { name: "Do it" }) as HTMLButtonElement;
    fireEvent.click(button);
    await waitFor(() => expect(button.disabled).toBe(false));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("booking search is busy while the action runs", async () => {
    const d = deferred();
    const run = vi.fn(() => d.promise);
    render(withIntl(createElement(BookingSearchForm, { run, labels: { label: "Ref", hint: "h", search: "Search", invalid: "bad" } })));
    const button = screen.getByRole("button", { name: "Search" }) as HTMLButtonElement;
    fireEvent.click(button);
    await waitFor(() => expect(button.disabled).toBe(true));
    fireEvent.click(button);
    expect(run).toHaveBeenCalledTimes(1);
    await act(async () => d.resolve({ ok: false, code: "not_found" }));
    await waitFor(() => expect(button.disabled).toBe(false));
  });

  it("workspace chooser is busy while the switch runs, before any refresh", async () => {
    const d = deferred();
    const onSwitch = vi.fn(() => d.promise);
    render(withIntl(createElement(WorkspaceChooser, { options: [{ key: "a", name: "A" }, { key: "b", name: "B" }], labels: { title: "T", body: "B", open: "Open" }, onSwitch })));
    const a = screen.getByRole("button", { name: "Open A" }) as HTMLButtonElement;
    fireEvent.click(a);
    await waitFor(() => expect(a.disabled).toBe(true));
    expect(refresh).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Open B" }));
    expect(onSwitch).toHaveBeenCalledTimes(1);
    await act(async () => d.resolve({ ok: true }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("accept request stays pending while run executes", async () => {
    const d = deferred();
    const run = vi.fn(() => d.promise);
    const labels = { accept: "Accept", title: "Accept R1", body: "b", vehicle: "Vehicle", driver: "Driver", placeholder: "Choose", vehicleRequired: "vr", driverRequired: "dr", confirm: "Confirm", done: "ok" };
    render(withIntl(createElement(AcceptRequestForm, { vehicles: [{ resourceId: "v1", label: "Van" }], drivers: [{ resourceId: "d1", label: "Dev" }], run, labels })));
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    fireEvent.change(await screen.findByLabelText(/Vehicle/), { target: { value: "v1" } });
    fireEvent.change(screen.getByLabelText(/Driver/), { target: { value: "d1" } });
    const confirm = screen.getByRole("button", { name: "Confirm" }) as HTMLButtonElement;
    fireEvent.click(confirm);
    await waitFor(() => expect(confirm.disabled).toBe(true));
    await act(async () => d.resolve({ ok: false, code: "conflict" }));
    await waitFor(() => expect(confirm.disabled).toBe(false));
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("lab catalog save is pending while run executes", async () => {
    const d = deferred();
    const run = vi.fn(() => d.promise);
    const labels = { edit: "Edit", title: "Edit item", price: "Price", priceHint: "p", preparation: "Preparation", preparationHint: "ph", active: "Offered", save: "Save", saved: "Saved", priceInvalid: "pi", preparationInvalid: "pri" };
    render(withIntl(createElement(CatalogEditForm, { initial: { price: "100", preparation: "Fasting 8 hours", active: true }, run, labels })));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const save = (await screen.findByRole("button", { name: "Save" })) as HTMLButtonElement;
    fireEvent.click(save);
    await waitFor(() => expect(save.disabled).toBe(true));
    await act(async () => d.resolve({ ok: true }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(run).toHaveBeenCalledTimes(1);
  });
});
