import { getTranslations } from "next-intl/server";
import { AdminRouteGate } from "@/components/admin/admin-frame";
import { AdminUsersView } from "@/components/admin/admin-views";
import { privateMetadata } from "@/components/admin/ops/metadata";
import { loadAdminUsers } from "@/modules/admin/loaders";

export async function generateMetadata() {
  return privateMetadata((await getTranslations("admin.nav"))("users"));
}

export default function Page() {
  return <AdminRouteGate route="users">{async (ctx) => <AdminUsersView result={await loadAdminUsers(ctx)} />}</AdminRouteGate>;
}