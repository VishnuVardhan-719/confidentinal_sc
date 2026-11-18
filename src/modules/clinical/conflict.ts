import type { ApiErrorCode } from "@/lib/api/result";
import type { EditableStepId } from "./editor";
import type { ClinicalDraftContent } from "./schemas";
import type { DraftSnapshot } from "./types";

/**
 * Conflict reconciliation view model (DC05). When the server has a newer draft, autosave stops,
 * the authorized latest version is fetched, and the clinician chooses per review:
 * keep their on-screen text (rebased on the new version) or take the server version.
 * Newer clinical notes are never silently overwritten.
 */
export type ConflictView =
  | { phase: "loading" }
  /** editSeq: local edit sequence this diff was computed against; pass it back to resolve. */
  | { phase: "review"; server: DraftSnapshot; changedSteps: EditableStepId[]; editSeq: number }
  | { phase: "error"; code: ApiErrorCode };

const STEPS: readonly EditableStepId[] = ["vitals", "assessment", "prescription", "care"];

/** Stable JSON (sorted keys) so key order differences are not reported as changes. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>)
      .filter(([, x]) => x !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, x]) => `${JSON.stringify(k)}:${stable(x)}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

/** Which steps differ between the clinician's on-screen draft and the server's newer draft. */
export function diffDraftSteps(local: ClinicalDraftContent, server: ClinicalDraftContent): EditableStepId[] {
  return STEPS.filter((s) => stable(local[s]) !== stable(server[s]));
}
