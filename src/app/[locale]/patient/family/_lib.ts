import { redirect } from "next/navigation";
import type { ApiResult } from "@/lib/api/result";
import type { Locale } from "@/lib/format";
import { getFamilyMembersApi, type FamilyMembersApi } from "@/modules/family-members";
import { patientLoginRedirect, requirePatientSession } from "@/modules/patient-dashboard/session";

export const toLocale = (l: string): Locale => (l === "te" || l === "hi" ? l : "en");

/**
 * Advisory page guard (fe-b requireRole): signed-out visitors go to login with the family list as
 * the return path. An unusable patient workspace goes to the dashboard, which shows the denied state.
 */
export async function familyPage(locale: Locale): Promise<{ api: FamilyMembersApi; synthetic: boolean }> {
  const session = await requirePatientSession(locale, `/${locale}/patient/family`);
  if (session.status !== "ok") redirect(`/${locale}/patient/dashboard`);
  return { api: getFamilyMembersApi(process.env, session.fixtureActor), synthetic: session.synthetic };
}

export function redirectIfSignedOut<T>(result: ApiResult<T>, locale: Locale): void {
  if (!result.ok && result.error.code === "unauthenticated") redirect(patientLoginRedirect(locale, `/${locale}/patient/family`));
}

/** Date-only DOB shown as a calendar date (no time zone shift). */
export function formatDob(dateOfBirth: string, locale: Locale): string {
  const [y, m, d] = dateOfBirth.split("-").map(Number);
  const tag = { en: "en-IN", te: "te-IN", hi: "hi-IN" }[locale];
  return new Intl.DateTimeFormat(tag, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

export const FLASH = ["added", "updated", "removed"] as const;
export type Flash = (typeof FLASH)[number];
export const parseFlash = (v: string | string[] | undefined): Flash | null => (FLASH as readonly string[]).find((f) => f === v) as Flash | undefined ?? null;
