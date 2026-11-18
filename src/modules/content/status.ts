import type { ContentState } from "./types";

/**
 * Canonical CMS label keys (namespace `admin`, CMS area) and tones.
 * Unknown values map to neutral "unknown", never to published.
 */
export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";
export type StatusDescriptor = { readonly labelKey: string; readonly tone: StatusTone; readonly known: boolean };

const UNKNOWN: StatusDescriptor = { labelKey: "admin.cms.status.unknown", tone: "neutral", known: false };

const CONTENT: Record<ContentState, readonly [string, StatusTone]> = {
  draft: ["admin.cms.status.draft", "neutral"],
  in_preview: ["admin.cms.status.inPreview", "warning"],
  published: ["admin.cms.status.published", "success"],
  archived: ["admin.cms.status.archived", "neutral"],
};

export function describeContent(raw: unknown): StatusDescriptor {
  if (typeof raw !== "string" || !Object.prototype.hasOwnProperty.call(CONTENT, raw)) return UNKNOWN;
  const [labelKey, tone] = CONTENT[raw as ContentState];
  return { labelKey, tone, known: true };
}
