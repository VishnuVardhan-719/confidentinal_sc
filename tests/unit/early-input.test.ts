// @vitest-environment jsdom
/**
 * REQUESTS R-FE-D-41: shared controlled inputs keep what was typed before hydration. Each case
 * renders the server HTML, types into the DOM (JS not loaded yet), then hydrates the same tree.
 */
import { act, cleanup, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { createElement, useState, type ReactNode } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import common from "@/messages/en/common.json";
import { OTPInput } from "@/components/shared/otp-input";
import { PhoneInput } from "@/components/shared/phone-input";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

const h = createElement;
const withIntl = (ui: ReactNode) => h(NextIntlClientProvider, { locale: "en", messages: { common }, timeZone: "Asia/Kolkata", children: ui });

/** changes collects onValueChange calls; the React state is rendered into <output> for reading. */
type Probe = { changes: string[] };
const stateValue = () => document.querySelector("output")?.textContent ?? null;
function Controlled({ kind, probe, initial = "" }: { kind: "phone" | "otp" | "plain"; probe: Probe; initial?: string }) {
  const [value, setValue] = useState(initial);
  const [, bump] = useState(0);
  const onValueChange = (v: string) => {
    probe.changes.push(v);
    setValue(v);
  };
  return h(
    "div",
    null,
    kind === "phone"
      ? h(PhoneInput, { "aria-label": "Mobile", value, onValueChange })
      : kind === "otp"
        ? h(OTPInput, { "aria-label": "Code", value, onValueChange })
        : h("input", { "aria-label": "Plain", value, onChange: (e: { target: { value: string } }) => onValueChange(e.target.value) }),
    // Any later re-render (e.g. a hydration-dependent flag flipping) is what wrote "" back.
    h("button", { type: "button", onClick: () => bump((n) => n + 1) }, "rerender"),
    h("output", null, value),
  );
}

/** Server HTML -> type into the DOM -> hydrate -> force a re-render. Returns the input. */
async function typeBeforeHydration(ui: ReactNode, typed: string): Promise<HTMLInputElement> {
  const container = document.createElement("div");
  container.innerHTML = renderToString(ui);
  document.body.appendChild(container);
  const input = container.querySelector("input")!;
  input.value = typed;
  await act(async () => {
    hydrateRoot(container, ui, { onRecoverableError: () => {} });
  });
  await act(async () => container.querySelector("button")!.click());
  return input;
}

describe("input typed before hydration (R-FE-D-41)", () => {
  it("baseline: a plain controlled input loses it (the bug this guards against)", async () => {
    const probe: Probe = { changes: [] };
    const input = await typeBeforeHydration(withIntl(h(Controlled, { kind: "plain", probe })), "typed early");
    expect(input.value).toBe("");
    expect(stateValue()).toBe("");
  });

  it("PhoneInput adopts and normalises the early digits", async () => {
    const probe: Probe = { changes: [] };
    const input = await typeBeforeHydration(withIntl(h(Controlled, { kind: "phone", probe })), "+91 98765-43210");
    expect(probe.changes).toEqual(["9876543210"]);
    expect(stateValue()).toBe("9876543210");
    expect(input.value).toBe("9876543210");
  });

  it("OTPInput adopts and sanitises the early code", async () => {
    const probe: Probe = { changes: [] };
    const input = await typeBeforeHydration(withIntl(h(Controlled, { kind: "otp", probe })), "24 68 10 99");
    expect(probe.changes).toEqual(["246810"]);
    expect(input.value).toBe("246810");
  });

  it("nothing typed early, or the DOM already equals state: no change is reported", async () => {
    const empty: Probe = { changes: [] };
    await typeBeforeHydration(withIntl(h(Controlled, { kind: "phone", probe: empty })), "");
    expect(empty.changes).toEqual([]);
    cleanup();
    document.body.innerHTML = "";
    const same: Probe = { changes: [] };
    await typeBeforeHydration(withIntl(h(Controlled, { kind: "phone", probe: same, initial: "9876543210" })), "9876543210");
    expect(same.changes).toEqual([]);
  });

  it("a client-side mount never reads the DOM over state, and the caller's ref still works", () => {
    const probe: Probe = { changes: [] };
    const ref = vi.fn();
    render(withIntl(h(PhoneInput, { "aria-label": "Mobile", value: "", onValueChange: (v: string) => probe.changes.push(v), ref })));
    expect(probe.changes).toEqual([]);
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLInputElement));
  });
});
