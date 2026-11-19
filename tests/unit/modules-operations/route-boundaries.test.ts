// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { existsSync } from "node:fs";
import path from "node:path";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => createElement("a", { href, ...rest }, children),
}));

import { PublicRouteError } from "@/components/shared/public-route-error";
import { withIntl } from "./render-helpers";

afterEach(cleanup);

const APP = path.resolve(__dirname, "../../../src/app/[locale]");

describe("route loading/error boundaries", () => {
  it("every operations, admin, public and sign-in segment has an error boundary", () => {
    for (const seg of ["admin", "lab", "ambulance", "caretaker", "(public)", "(auth)"]) {
      expect(existsSync(path.join(APP, seg, "error.tsx")), `${seg}/error.tsx`).toBe(true);
    }
  });

  it("operations areas and sign-in have a loading state; public pages deliberately do not", () => {
    // A public loading.tsx wraps the page in Suspense: streamed content then needs JavaScript to
    // appear (FAQ/stories must work without it) and the catch-all 404 would stream as HTTP 200.
    for (const seg of ["admin", "lab", "ambulance", "caretaker", "(auth)"]) {
      expect(existsSync(path.join(APP, seg, "loading.tsx")), `${seg}/loading.tsx`).toBe(true);
    }
    for (const seg of ["(public)", "(public)/stories", "(public)/faq"]) {
      expect(existsSync(path.join(APP, seg, "loading.tsx")), `${seg}/loading.tsx must not exist`).toBe(false);
    }
  });

  it("public error shows localized copy and the digest, never the raw message, and retries", () => {
    const retry = vi.fn();
    const error = Object.assign(new Error("secret backend detail"), { digest: "abc123" });
    render(withIntl(createElement(PublicRouteError, { error, retry })));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("This page did not load");
    expect(screen.queryByText(/secret backend detail/)).toBeNull();
    expect(screen.getByText("Reference: abc123")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
