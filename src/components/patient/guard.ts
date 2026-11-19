import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { Locale } from "@/lib/format";
import { getPatientSession, patientLoginRedirect } from "@/modules/patient-dashboard/session";

export const toPatientLocale = (l: string): Locale => (l === "te" || l === "hi" ? l : "en");

/**
 * Advisory page guard for patient pages (interim session, see modules/patient-dashboard/session.ts).
 * Module adapters and the backend still authorize every read. `path` is locale-less ("/patient/records").
 */
export async function guardPatientPage(rawLocale: string, path: string) {
  await connection();
  const locale = toPatientLocale(rawLocale);
  const session = getPatientSession();
  if (session.status !== "ok") redirect(patientLoginRedirect(locale, `/${locale}${path}`));
  return { locale, session };
}
