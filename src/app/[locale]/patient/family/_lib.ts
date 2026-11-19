import { redirect } from "next/navigation";
import type { ApiResult } from "@/lib/api/result";
import type { Locale } from "@/lib/format";
import { getFamilyMembersApi, type FamilyMembersApi } from "@/modules/family-members";
import { getPatientSession, patientLoginRedirect } from "@/modules/patient-dashboard/session";

export const toLocale = (l: string): Locale => (l === "te" || l === "hi" ? l : "en");

/** Advisory page guard: signed-out visitors go to login with the family list as the return path. */
export function familyPage(locale: Locale): { api: FamilyMembersApi; synthetic: boolean } {
  const session = getPatientSession();
  if (session.status !== "ok") redirect(patientLoginRedirect(locale, `/${locale}/patient/family`));
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
