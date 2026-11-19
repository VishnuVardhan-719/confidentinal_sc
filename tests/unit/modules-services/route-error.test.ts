// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import common from "@/messages/en/common.json";
import errors from "@/messages/en/errors.json";
import services from "@/messages/en/services.json";
import hiServices from "@/messages/hi/services.json";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: ReactNode }) => createElement("a", { href, ...props }, children),
}));
const { ServiceRouteError } = await import("@/components/service-requests/route-error");
const h = createElement;
const withIntl = (ui: ReactNode, locale: "en" | "te" | "hi" = "en", own = services) => h(NextIntlClientProvider, { locale, timeZone: "Asia/Kolkata", messages: { common, errors, services: own }, children: ui });

afterEach(cleanup);

describe("service route error boundary", () => {
  it("never shows the raw error, offers retry and a way back, and shows only the digest", () => {
    const retry = vi.fn();
    const error = Object.assign(new Error("ECONNREFUSED 10.0.0.5 secret stack"), { digest: "abc123" });
    render(withIntl(h(ServiceRouteError, { area: "lab", error, retry })));
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1, name: "We could not load this page" }));
    expect(document.body.textContent).not.toContain("ECONNREFUSED");
    expect(screen.getByText("Reference for support: abc123")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "Back to lab tests" }).getAttribute("href")).toBe("/patient/lab-tests");
    expect(screen.queryByRole("link", { name: "112" })).toBeNull();
  });

  it("keeps the 112 call link first on ambulance pages, in every locale", () => {
    render(withIntl(h(ServiceRouteError, { area: "ambulance", error: new Error("x"), retry: vi.fn() }), "hi", hiServices));
    const call = screen.getByRole("link", { name: "112" });
    expect(call.getAttribute("href")).toBe("tel:112");
    expect(screen.getByText("आपातकाल? अभी 112 पर कॉल करें। इस पेज का इंतज़ार न करें।")).toBeTruthy();
    expect(screen.getByRole("link", { name: "एम्बुलेंस स्थानांतरण पर वापस" }).getAttribute("href")).toBe("/patient/ambulance");
    const order = [...document.querySelectorAll("a, h1")].map(node => node.tagName);
    expect(order[0]).toBe("A");
  });
});
