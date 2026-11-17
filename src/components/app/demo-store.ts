"use client";

import { useSyncExternalStore } from "react";
import { z } from "zod";
import { EMPTY_DEMO_STATE, reduceDemo, type DemoAction, type DemoState } from "./demo-model";

/**
 * Demo state for this browser tab: requests made in /book, provider and admin decisions, profile edits.
 * No network. Mirrored to sessionStorage so it survives a reload, and cleared when the tab closes.
 * Stored data is re-validated on read because anything in storage can be edited by the user.
 */
const KEY = "surecure-demo-v2";

const status = z.enum(["requested", "accepted", "completed", "cancelled", "declined"]);
const storedSchema = z.object({
  created: z
    .array(
      z.object({
        id: z.string().max(80),
        providerId: z.string().max(80),
        serviceId: z.string().max(80),
        patientName: z.string().max(120),
        startsAt: z.iso.datetime(),
        status,
        paymentStatus: z.literal("not_collected"),
      }),
    )
    .max(100),
  status: z.record(z.string().max(80), status),
  decisions: z.record(z.string().max(80), z.enum(["approved", "rejected"])),
  applications: z
    .array(z.object({ id: z.string().max(80), name: z.string().max(140), kind: z.string().max(40), submittedAt: z.iso.datetime() }))
    .max(50),
  profiles: z.record(
    z.string().max(20),
    z.object({ name: z.string().max(120), phone: z.string().max(20), email: z.string().max(254), language: z.string().max(5) }),
  ),
});

let state: DemoState | null = null;
const listeners = new Set<() => void>();

function load(): DemoState {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return EMPTY_DEMO_STATE;
    const parsed = storedSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : EMPTY_DEMO_STATE;
  } catch {
    return EMPTY_DEMO_STATE;
  }
}

function getSnapshot(): DemoState {
  state ??= load();
  return state;
}

const getServerSnapshot = () => EMPTY_DEMO_STATE;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function dispatchDemo(action: DemoAction) {
  state = reduceDemo(getSnapshot(), action);
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage can be full or blocked; the demo still works for this page view.
  }
  listeners.forEach((l) => l());
}

/** Server render and hydration use the empty state, so shared demo rows render first, then this tab's changes. */
export function useDemoState(): DemoState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
