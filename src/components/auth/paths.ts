import type { StatusTone } from "@/components/shared/status";
import type { WorkspaceState } from "@/modules/auth/types";

/**
 * Module route helpers return localized paths ("/te/doctor/dashboard"). next-intl's <Link>
 * adds the locale itself, so strip a leading locale segment before passing the href.
 */
export function withoutLocale(path: string): string {
  const stripped = path.replace(/^\/(en|te|hi)(?=\/|$)/, "");
  return stripped === "" ? "/" : stripped;
}

export const WORKSPACE_STATE_TONE: Readonly<Record<WorkspaceState, StatusTone>> = {
  active: "success",
  onboarding_incomplete: "warning",
  pending_review: "info",
  restricted: "danger",
  unknown: "neutral",
};
