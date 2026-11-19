import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { Locale } from "@/lib/format";
import { requirePatientSession } from "@/modules/patient-dashboard/session";

export const toPatientLocale = (l: string): Locale => (l === "te" || l === "hi" ? l : "en");

/**
 * Advisory page guard for patient pages (fe-b requireRole via modules/patient-dashboard/session.ts).
 * Module adapters and the backend still authorize every read. `path` is locale-less ("/patient/records").
 */
export async function guardPatientPage(rawLocale: string, path: string) {
  await connection();
  const locale = toPatientLocale(rawLocale);
  const session = await requirePatientSession(locale, `/${locale}${path}`);
  // Unusable patient workspace: the dashboard renders the denied state (no loop: it does not redirect here).
  if (session.status !== "ok") redirect(`/${locale}/patient/dashboard`);
  return { locale, session };
}
