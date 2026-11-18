import { getTranslations } from "next-intl/server";
import { AdminRouteGate } from "@/components/admin/admin-frame";
import { SupportQueueView } from "@/components/admin/admin-views";
import { privateMetadata } from "@/components/admin/ops/metadata";
import { loadSupportQueue } from "@/modules/admin/loaders";

export async function generateMetadata() {
  return privateMetadata((await getTranslations("admin.nav"))("support"));
}

export default function Page() {
  return <AdminRouteGate route="support">{async (ctx) => <SupportQueueView result={await loadSupportQueue(ctx)} />}</AdminRouteGate>;
}