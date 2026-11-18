import { getTranslations } from "next-intl/server";
import { AdminRouteGate } from "@/components/admin/admin-frame";
import { PaymentsView } from "@/components/admin/admin-views";
import { privateMetadata } from "@/components/admin/ops/metadata";
import { loadPayments } from "@/modules/admin/loaders";

export async function generateMetadata() {
  return privateMetadata((await getTranslations("admin.nav"))("payments"));
}

export default function Page() {
  return <AdminRouteGate route="payments">{async (ctx) => <PaymentsView result={await loadPayments(ctx)} />}</AdminRouteGate>;
}