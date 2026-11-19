// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { createElement as h, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import errors from "@/messages/en/errors.json";
import common from "@/messages/en/common.json";
import { PatientRouteError } from "@/components/patient/route-error";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => h("a", { href }, children),
}));

afterEach(cleanup);

describe("PatientRouteError", () => {
  it("shows friendly copy, a retry and a way home, never the raw error", () => {
    const retry = vi.fn();
    const error = Object.assign(new Error("TypeError: secret stack at db.query(patient_id=123)"), { digest: "abc123" });
    render(h(NextIntlClientProvider, { locale: "en", messages: { errors, common }, timeZone: "Asia/Kolkata", children: h(PatientRouteError, { error, retry }) }));
    expect(screen.getByText("This page did not load")).toBeTruthy();
    expect(screen.queryByText(/secret stack|patient_id/)).toBeNull();
    expect(screen.getByText("Reference: abc123")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
    expect(screen.getByRole("link", { name: "Go to the home page" }).getAttribute("href")).toBe("/");
  });
});
