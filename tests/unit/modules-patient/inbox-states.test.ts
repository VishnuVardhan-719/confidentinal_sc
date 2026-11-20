// @vitest-environment jsdom
/**
 * R9-P6: the patient inbox pages fe-p owns (/patient/notifications and /patient/settings/reminders)
 * render every state without throwing, in en, te and hi: loading, empty, error, gated, denied and
 * ready. Missing message keys throw (intlTree onError). Signed out is a server redirect, covered by
 * the e2e guest runs.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => createElement("a", { href, ...rest }, children),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/patient/notifications",
}));

import NotificationsError from "@/app/[locale]/patient/notifications/error";
import NotificationsLoading from "@/app/[locale]/patient/notifications/loading";
import { NotificationsBody } from "@/app/[locale]/patient/notifications/_components/notifications-body";
import RemindersError from "@/app/[locale]/patient/settings/reminders/error";
import RemindersLoading from "@/app/[locale]/patient/settings/reminders/loading";
import { ReminderBody, reminderPageState } from "@/app/[locale]/patient/settings/reminders/_components/reminder-body";
import { syntheticNotification } from "@/fixtures/marketplace/notifications";
import { fail, ok, type ApiResult } from "@/lib/api/result";
import { defaultReminderPrefs } from "@/modules/reminder-prefs/fixture";
import { intlTree } from "./intl-helper";

type Locale = "en" | "te" | "hi";
const NS = ["accessibility", "common", "errors", "patient", "patientAccount"] as const;
const messagesFor = async (locale: Locale) =>
  Object.fromEntries(await Promise.all(NS.map(async (ns) => [ns, (await import(`@/messages/${locale}/${ns}.json`)).default] as const)));

afterEach(cleanup);
const h = createElement;
const markRead = vi.fn(async () => ok({ version: 2 }));
const dashboard = h("a", { href: "/patient/dashboard" }, "DASHBOARD");
const inbox = (result: ApiResult<{ items: unknown[] }>) => h(NotificationsBody, { result, markRead, dashboardAction: dashboard });
const prefsBody = (result: ApiResult<unknown>) =>
  h(ReminderBody, { state: reminderPageState(result), dashboardAction: dashboard, renderForm: (p) => h("p", null, `FORM v${p.version}`) });

const LOCALES: Locale[] = ["en", "te", "hi"];

describe.each(LOCALES)("inbox states render in %s", (locale) => {
  const mount = async (ui: ReactNode) => render(intlTree(ui, locale, await messagesFor(locale)));
  const t = async () => messagesFor(locale) as Promise<Record<string, Record<string, Record<string, unknown>>>>;

  it("notifications: ready, empty, gated, denied, error, malformed", async () => {
    const m = await t();
    const n = m.patient.notifications as { state: Record<string, string> };
    const cn = m.common.notifications as { emptyTitle: string; kinds: Record<string, string> };
    await mount(inbox(ok({ items: [syntheticNotification] })));
    expect(screen.getByText(cn.kinds.booking_requested)).toBeTruthy();
    expect(screen.queryByText("DASHBOARD")).toBeNull();
    cleanup();

    await mount(inbox(ok({ items: [] })));
    expect(screen.getByText(cn.emptyTitle)).toBeTruthy();
    cleanup();

    await mount(inbox(fail("gated")));
    expect(screen.getByText(n.state.gatedTitle)).toBeTruthy();
    expect(screen.getByRole("link", { name: n.state.gatedAction }).getAttribute("href")).toBe("/patient/bookings");
    cleanup();

    for (const code of ["forbidden", "not_found"] as const) {
      await mount(inbox(fail(code)));
      expect(screen.getByText(n.state.denied)).toBeTruthy();
      expect(screen.getByText("DASHBOARD")).toBeTruthy();
      cleanup();
    }

    await mount(inbox(fail("unavailable")));
    expect(screen.getByRole("button")).toBeTruthy(); // retry
    cleanup();

    // One malformed row fails the whole list: an error, never a partial inbox.
    await mount(inbox(ok({ items: [syntheticNotification, { ...syntheticNotification, id: "not-a-uuid" }] })));
    expect(screen.getByRole("button")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("reminders: ready, gated, denied, error, malformed", async () => {
    const m = await t();
    const r = m.patientAccount.reminders as { state: Record<string, string> };
    await mount(prefsBody(ok(defaultReminderPrefs())));
    expect(screen.getByText("FORM v1")).toBeTruthy();
    cleanup();

    await mount(prefsBody(fail("gated")));
    expect(screen.getByText(r.state.gated)).toBeTruthy();
    expect(screen.queryByText(/FORM/)).toBeNull();
    cleanup();

    await mount(prefsBody(fail("forbidden")));
    expect(screen.getByText(r.state.denied)).toBeTruthy();
    expect(screen.getByText("DASHBOARD")).toBeTruthy();
    cleanup();

    await mount(prefsBody(fail("rate_limited")));
    expect(screen.getByRole("button")).toBeTruthy();
    cleanup();

    await mount(prefsBody(ok({ ...defaultReminderPrefs(), quietHours: { enabled: true, start: "25:00", end: "07:00" } })));
    expect(screen.queryByText(/FORM/)).toBeNull();
    expect(screen.getByRole("button")).toBeTruthy();
  });

  it("route loading and error boundaries", async () => {
    const m = await t();
    for (const Loading of [NotificationsLoading, RemindersLoading]) {
      await mount(h(Loading));
      expect(screen.getByRole("status").textContent).toContain(m.accessibility.loading as unknown as string);
      cleanup();
    }
    for (const Boundary of [NotificationsError, RemindersError]) {
      const retry = vi.fn();
      const { container } = await mount(h(Boundary, { error: Object.assign(new Error("internal detail"), { digest: "d1" }), retry }));
      expect(container.textContent).not.toContain("internal detail");
      expect(container.textContent).toContain("d1");
      cleanup();
    }
  });
});

describe("reminderPageState", () => {
  it("maps adapter results without trusting the body", () => {
    expect(reminderPageState(fail("gated"))).toEqual({ kind: "gated" });
    expect(reminderPageState(fail("forbidden"))).toEqual({ kind: "denied" });
    expect(reminderPageState(fail("conflict"))).toEqual({ kind: "error", code: "conflict" });
    expect(reminderPageState(ok({ nope: true }))).toEqual({ kind: "error", code: "unavailable" });
    expect(reminderPageState(ok(defaultReminderPrefs())).kind).toBe("ready");
  });
});
