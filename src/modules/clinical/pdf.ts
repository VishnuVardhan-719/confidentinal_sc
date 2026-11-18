import type { PdfLink } from "./types";

/**
 * DC14 signed-version PDF link state. Links are short-lived; an expired link is recovered by
 * requesting a new one from the server (never by reusing or caching the old URL).
 */
export type PdfLinkState =
  | { kind: "ready"; url: string; version: number; secondsLeft: number }
  | { kind: "expired"; version: number; recovery: "request_new_link" }
  | { kind: "version_mismatch"; linkVersion: number; expectedVersion: number; recovery: "request_new_link" };

/** Treat links as expired slightly early so a click near expiry does not hit a dead URL. */
export const PDF_EXPIRY_SKEW_SECONDS = 10;

export function pdfLinkState(link: PdfLink, now: Date, expectedVersion?: number): PdfLinkState {
  if (expectedVersion !== undefined && link.version !== expectedVersion) {
    return { kind: "version_mismatch", linkVersion: link.version, expectedVersion, recovery: "request_new_link" };
  }
  const secondsLeft = Math.floor((Date.parse(link.expiresAt) - now.getTime()) / 1000) - PDF_EXPIRY_SKEW_SECONDS;
  if (secondsLeft <= 0) return { kind: "expired", version: link.version, recovery: "request_new_link" };
  return { kind: "ready", url: link.url, version: link.version, secondsLeft };
}
