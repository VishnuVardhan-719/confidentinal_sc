import { getTranslations } from "next-intl/server";
import { AdminRouteGate } from "@/components/admin/admin-frame";
import { AUDIT_CATEGORIES, AUDIT_OUTCOMES, AuditView } from "@/components/admin/admin-views";
import { privateMetadata } from "@/components/admin/ops/metadata";
import { loadAudit } from "@/modules/admin/loaders";
import type { AuditCategory, AuditOutcome } from "@/modules/audit/types";

export async function generateMetadata() {
  return privateMetadata((await getTranslations("admin.nav"))("audit"));
}

/** Only allowlisted filter values are read from the URL (no free text, no personal data). */
export default async function Page({ searchParams }: PageProps<"/[locale]/admin/audit">) {
  const sp = await searchParams;
  const category = typeof sp.category === "string" && (AUDIT_CATEGORIES as readonly string[]).includes(sp.category) ? (sp.category as AuditCategory) : undefined;
  const outcome = typeof sp.outcome === "string" && (AUDIT_OUTCOMES as readonly string[]).includes(sp.outcome) ? (sp.outcome as AuditOutcome) : undefined;
  return (
    <AdminRouteGate route="audit">
      {async (ctx) => <AuditView category={category} outcome={outcome} result={await loadAudit(ctx, { ...(category ? { category } : {}), ...(outcome ? { outcome } : {}) })} />}
    </AdminRouteGate>
  );
}