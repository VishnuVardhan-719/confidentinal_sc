import { getTranslations } from "next-intl/server";
import { AdminRouteGate } from "@/components/admin/admin-frame";
import { privateMetadata } from "@/components/admin/ops/metadata";
import { CmsListView } from "@/components/content/cms-views";
import { cmsPermissions } from "@/modules/admin/routes";
import { loadContentList } from "@/modules/content/loaders";

export async function generateMetadata() {
  return privateMetadata((await getTranslations("admin.nav"))("cms"));
}

export default function Page() {
  return <AdminRouteGate route="cms">{async (ctx) => <CmsListView canEdit={cmsPermissions(ctx.principal).canEdit} result={await loadContentList(ctx)} />}</AdminRouteGate>;
}