import { getTranslations } from "next-intl/server";
import { AdminRouteGate } from "@/components/admin/admin-frame";
import { AccessDenied } from "@/components/admin/ops/states";
import { privateMetadata } from "@/components/admin/ops/metadata";
import { CmsNewView, isContentKind } from "@/components/content/cms-views";
import { cmsPermissions } from "@/modules/admin/routes";

export async function generateMetadata() {
  return privateMetadata((await getTranslations("admin.nav"))("cms"));
}

export default async function Page({ searchParams }: PageProps<"/[locale]/admin/cms/new">) {
  const kind = (await searchParams).kind;
  return (
    <AdminRouteGate route="cms">
      {(ctx, locale) => (cmsPermissions(ctx.principal).canEdit ? <CmsNewView kind={isContentKind(kind) ? kind : "story"} locale={locale} /> : <AccessDenied />)}
    </AdminRouteGate>
  );
}