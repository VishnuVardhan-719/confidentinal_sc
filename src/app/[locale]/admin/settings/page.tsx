import { getTranslations } from "next-intl/server";
import { AdminRouteGate } from "@/components/admin/admin-frame";
import { SettingsView } from "@/components/admin/admin-views";
import { privateMetadata } from "@/components/admin/ops/metadata";
import { loadSettings } from "@/modules/admin/loaders";

export async function generateMetadata() {
  return privateMetadata((await getTranslations("admin.nav"))("settings"));
}

export default function Page() {
  return <AdminRouteGate route="settings">{async (ctx) => <SettingsView result={await loadSettings(ctx)} />}</AdminRouteGate>;
}