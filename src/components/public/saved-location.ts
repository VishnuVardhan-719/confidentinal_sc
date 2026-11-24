/**
 * The visitor's own answer to "Where do you need care?", kept only in this browser (localStorage).
 * It is a locality name or a 6-digit PIN, never coordinates, and it is never sent anywhere until the
 * visitor searches with it. Every access is guarded: storage can be blocked or throw.
 */
import { resolveLocation } from "./localities";

export const LOCATION_KEY = "scv.location.v1";
export const LOCATION_EVENT = "scv:location-changed";

export type SavedLocation = { v: 1; label: string; pin: string } | { v: 1; skipped: true };

export function readSavedLocation(): SavedLocation | null {
  try {
    const raw = window.localStorage.getItem(LOCATION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (data?.v !== 1) return null;
    if (data.skipped === true) return { v: 1, skipped: true };
    const resolved = typeof data.label === "string" ? resolveLocation(data.label) : null;
    return resolved ? { v: 1, label: resolved.label, pin: resolved.pin } : null;
  } catch {
    return null;
  }
}

function write(value: SavedLocation) {
  try {
    window.localStorage.setItem(LOCATION_KEY, JSON.stringify(value));
  } catch {
    /* storage unavailable: the answer just is not remembered */
  }
  window.dispatchEvent(new Event(LOCATION_EVENT));
}

/** Saves a typed locality or PIN. Returns false when it is neither. */
export function saveLocation(typed: string): boolean {
  const resolved = resolveLocation(typed);
  if (!resolved) return false;
  write({ v: 1, label: resolved.label, pin: resolved.pin });
  return true;
}

export function skipLocation() {
  write({ v: 1, skipped: true });
}
