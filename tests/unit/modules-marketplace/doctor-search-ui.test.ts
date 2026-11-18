// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import accessibility from "@/messages/en/accessibility.json";
import booking from "@/messages/en/booking.json";
import common from "@/messages/en/common.json";
import errors from "@/messages/en/errors.json";
import { ok } from "@/lib/api/result";
import { syntheticMembers } from "@/fixtures/marketplace/patient";
import { SYNTHETIC_DOCTORS } from "@/fixtures/marketplace/doctors";
import { readDoctorSearch, type DoctorPage, type Suggestion } from "@/modules/providers/doctor-search";

const push = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: ReactNode }) => createElement("a", { href, ...props }, children),
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => "/doctors",
}));
vi.mock("@/components/directory/actions", () => ({ suggestDoctorsAction: vi.fn(), searchDoctorsNearAction: vi.fn() }));

const { DoctorSearchBar } = await import("@/components/directory/doctor-search-bar");
const { LocationPicker } = await import("@/components/booking/location-picker");
const { PatientGate } = await import("@/components/booking/patient-gate");
const { DoctorResults } = await import("@/components/directory/doctor-results");

const h = createElement;
const withIntl = (ui: ReactNode) => h(NextIntlClientProvider, { locale: "en", timeZone: "Asia/Kolkata", messages: { common, accessibility, errors, booking }, children: ui });
// The fixture adapter refuses to run in a browser (jsdom), so views get plain synthetic page data.
const syntheticPage = (distance = false): DoctorPage => ({ total: SYNTHETIC_DOCTORS.length, page: 1, hasMore: false, origin: distance ? "device" : "none", synthetic: true,
  items: SYNTHETIC_DOCTORS.map(({ point, nextSlotOffsetHours, ...rest }, index) => ({ ...rest, nextSlotAt: nextSlotOffsetHours === null ? null : "2026-11-19T10:00:00.000Z",
    distanceKm: distance && point ? index + 0.5 : null })) });
beforeEach(() => push.mockReset());
afterEach(cleanup);

describe("DoctorSearchBar combobox", () => {
  it("groups local taxonomy and remote names and selects with the keyboard", async () => {
    const suggest = vi.fn(async () => ok({ items: [{ group: "doctor", providerId: "00000000-0000-4000-8000-000000000101", label: "Synthetic doctor 2", synthetic: true }] as Suggestion[] }));
    render(withIntl(h(DoctorSearchBar, { suggest, defaultCity: "Hyderabad" })));
    const input = screen.getByRole("combobox", { name: booking.search.label });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "fever" } });
    expect(input.getAttribute("aria-expanded")).toBe("true");
    const list = screen.getByRole("listbox");
    expect(within(list).getByRole("group", { name: booking.search.groups.symptom })).toBeTruthy();
    await waitFor(() => expect(suggest).toHaveBeenCalledWith("fever"));
    await waitFor(() => expect(within(list).getByRole("group", { name: booking.search.groups.doctor })).toBeTruthy());
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const active = input.getAttribute("aria-activedescendant");
    expect(active && document.getElementById(active)?.getAttribute("aria-selected")).toBe("true");
    fireEvent.submit(input.closest("form")!);
    expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/doctors\?city=Hyderabad&symptom=(fever|childFever)$/));
  });
  it("drops late suggestions for an older query and cleans free text before navigating", async () => {
    let releaseFirst: (value: unknown) => void = () => {};
    const suggest = vi.fn()
      .mockImplementationOnce(() => new Promise(resolve => { releaseFirst = resolve; }))
      .mockImplementationOnce(async () => ok({ items: [] }));
    render(withIntl(h(DoctorSearchBar, { suggest })));
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Synth" } });
    await waitFor(() => expect(suggest).toHaveBeenCalledTimes(1));
    fireEvent.change(input, { target: { value: "Synthetic <b>" } });
    await waitFor(() => expect(suggest).toHaveBeenCalledTimes(2));
    await act(async () => releaseFirst(ok({ items: [{ group: "clinic", label: "Stale clinic", synthetic: true }] })));
    expect(screen.queryByText("Stale clinic")).toBeNull();
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.submit(input.closest("form")!);
    expect(push).toHaveBeenCalledWith("/doctors?q=Synthetic+b");
  });
  it("submits as a plain GET form without JavaScript", () => {
    render(withIntl(h(DoctorSearchBar, {})));
    const form = screen.getByRole("search");
    expect(form.getAttribute("method")).toBe("get");
    expect(form.getAttribute("action")).toBe("/en/doctors");
    expect((screen.getByRole("combobox") as HTMLInputElement).name).toBe("q");
  });
});

describe("LocationPicker", () => {
  const position = (lat: number, lng: number, accuracy: number) => ({ coords: { latitude: lat, longitude: lng, accuracy } }) as GeolocationPosition;
  it("asks only after an explicit press, shows accuracy and confirms in memory only", () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => success(position(17.529412, 78.394588, 136.6)));
    const onConfirm = vi.fn();
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    render(withIntl(h(LocationPicker, { purpose: "search", onConfirm, geolocation: { getCurrentPosition } })));
    expect(getCurrentPosition).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: booking.location.useCurrent }));
    expect(screen.getByText("17.5294, 78.3946 (±137 m)")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: booking.location.confirm })[0]);
    expect(onConfirm).toHaveBeenCalledWith({ kind: "device", origin: { lat: 17.529412, lng: 78.394588, accuracyM: 136.6 } });
    expect(setItem).not.toHaveBeenCalled();
    expect(document.cookie).toBe("");
  });
  it.each([[1, booking.location.denied], [2, booking.location.unavailable], [3, booking.location.timeout]])("explains geolocation error %s", (code, message) => {
    const getCurrentPosition = vi.fn((_success: PositionCallback, failure?: PositionErrorCallback | null) => failure?.({ code } as GeolocationPositionError));
    render(withIntl(h(LocationPicker, { purpose: "search", onConfirm: vi.fn(), geolocation: { getCurrentPosition } })));
    fireEvent.click(screen.getByRole("button", { name: booking.location.useCurrent }));
    expect(screen.getByText(message)).toBeTruthy();
  });
  it("falls back to manual entry with validation", () => {
    const onConfirm = vi.fn();
    render(withIntl(h(LocationPicker, { purpose: "booking", onConfirm, geolocation: null })));
    fireEvent.click(screen.getByRole("button", { name: booking.location.useCurrent }));
    expect(screen.getByText(booking.location.unsupported)).toBeTruthy();
    const manual = screen.getAllByRole("button", { name: booking.location.confirm }).at(-1)!;
    fireEvent.change(screen.getByLabelText(booking.location.pin), { target: { value: "012345" } });
    fireEvent.click(manual);
    expect(screen.getByText(booking.location.pinInvalid)).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(booking.location.city), { target: { value: "Hyderabad" } });
    fireEvent.change(screen.getByLabelText(booking.location.pin), { target: { value: "50a0032" } });
    fireEvent.change(screen.getByLabelText(new RegExp(booking.location.line)), { target: { value: " Synthetic street " } });
    fireEvent.click(manual);
    expect(onConfirm).toHaveBeenCalledWith({ kind: "manual", city: "Hyderabad", pin: "500032", line: "Synthetic street" });
  });
});

describe("PatientGate", () => {
  it("requires a complete profile and explicit health-sharing consent", () => {
    const onContinue = vi.fn();
    render(withIntl(h(PatientGate, { members: syntheticMembers(), onContinue })));
    expect(screen.getByText(/Ready to book/)).toBeTruthy();
    expect(screen.getByText(/13 of 13 complete/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: booking.gate.continue }));
    expect(onContinue).not.toHaveBeenCalled();
    expect(screen.getByText(booking.gate.consentRequired)).toBeTruthy();
    fireEvent.click(screen.getByLabelText(new RegExp(booking.gate.consentLabel)));
    fireEvent.click(screen.getByRole("button", { name: booking.gate.continue }));
    expect(onContinue).toHaveBeenCalledWith({ patientId: syntheticMembers()[0].patientId, access: "self", questionnaireComplete: true, healthShareConsent: true });
  });
  it("blocks an incomplete family profile and links each missing item", () => {
    const onContinue = vi.fn();
    render(withIntl(h(PatientGate, { members: syntheticMembers(), onContinue })));
    fireEvent.click(screen.getByRole("radio", { name: /Synthetic family member/ }));
    expect(screen.getByText("10 of 13 complete: finish these to book")).toBeTruthy();
    expect(screen.getByRole("link", { name: booking.gate.items.allergies }).getAttribute("href")).toBe("/patient/health-profile#field-allergies");
    expect(screen.getByRole("link", { name: booking.gate.items.dateOfBirth }).getAttribute("href")).toBe("/patient/profile#field-dateOfBirth");
    expect((screen.getByRole("button", { name: booking.gate.continue }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("10");
  });
});

describe("DoctorResults", () => {
  it("renders honest cards, location-less note, disabled booking and the gated map", async () => {
    const search = readDoctorSearch(new URLSearchParams("showFull=1"));
    if (!search.ok) throw new Error("search");
    render(withIntl(h(DoctorResults, { search: search.data, page: syntheticPage(), nearSearch: vi.fn() })));
    expect(screen.getAllByTestId("doctor-card")).toHaveLength(6);
    expect(screen.queryByText(/out of 5/)).toBeNull();
    expect(screen.getByText(booking.results.noLocationNote)).toBeTruthy();
    expect(screen.getByText(booking.card.bookDisabledFull)).toBeTruthy();
    expect(screen.getByText(booking.card.bookDisabledLocation)).toBeTruthy();
    const book = screen.getAllByRole("link", { name: booking.card.book })[0].getAttribute("href")!;
    expect(book).toMatch(/^\/patient\/bookings\/new\?providerId=[0-9a-f-]{36}&serviceId=[0-9a-f-]{36}&category=doctor&pin=\d{6}$/);
    fireEvent.click(screen.getByRole("button", { name: booking.sort.fee_asc }));
    expect(push).toHaveBeenCalledWith("/doctors?sort=fee_asc&showFull=1");
    fireEvent.click(screen.getByRole("button", { name: booking.view.map }));
    expect(screen.getByText(booking.view.mapGatedTitle)).toBeTruthy();
  });
  it("re-sorts by distance through the server action and never puts coordinates in the URL", async () => {
    const search = readDoctorSearch(new URLSearchParams(""));
    if (!search.ok) throw new Error("search");
    const nearSearch = vi.fn(async () => ok(syntheticPage(true)));
    const getCurrentPosition = vi.fn((success: PositionCallback) => success({ coords: { latitude: 17.44, longitude: 78.35, accuracy: 40 } } as GeolocationPosition));
    Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition }, configurable: true });
    render(withIntl(h(DoctorResults, { search: search.data, page: syntheticPage(), nearSearch })));
    fireEvent.click(screen.getByRole("button", { name: booking.results.useLocation }));
    fireEvent.click(await screen.findByRole("button", { name: booking.location.useCurrent }));
    fireEvent.click(screen.getAllByRole("button", { name: booking.location.confirm })[0]);
    await waitFor(() => expect(screen.getByText(/Sorted by distance from your location: 17.4400, 78.3500/)).toBeTruthy());
    expect(nearSearch).toHaveBeenCalledWith("", { lat: 17.44, lng: 78.35, accuracyM: 40 });
    expect(push).not.toHaveBeenCalled();
    expect(screen.getAllByText(/km from your location/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: booking.sort.nearest }).getAttribute("aria-pressed")).toBe("true");
  });
});
