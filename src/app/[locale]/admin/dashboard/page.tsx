import { getTranslations } from "next-intl/server";
import { AdminRouteGate } from "@/components/admin/admin-frame";
import { AdminDashboardView } from "@/components/admin/admin-views";
import { privateMetadata } from "@/components/admin/ops/metadata";
import { loadAdminDashboard } from "@/modules/admin/loaders";

export async function generateMetadata() {
  return privateMetadata((await getTranslations("admin.nav"))("dashboard"));
}

export default function Page() {
  return <AdminRouteGate route="dashboard">{async (ctx, locale) => <AdminDashboardView result={await loadAdminDashboard(ctx, locale)} />}</AdminRouteGate>;
}