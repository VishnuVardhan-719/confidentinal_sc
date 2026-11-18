import { getTranslations } from "next-intl/server";
import { privateMetadata } from "@/components/admin/ops/metadata";
import { LabRouteGate } from "@/components/lab/lab-frame";
import { LabOrderDetailView } from "@/components/lab/lab-views";
import { loadLabOrderDetail } from "@/modules/lab/loaders";

export async function generateMetadata() {
  return privateMetadata((await getTranslations("lab.nav"))("orders"));
}

export default async function LabOrderDetailPage({ params }: PageProps<"/[locale]/lab/orders/[orderId]">) {
  const { orderId } = await params;
  return <LabRouteGate route="orders">{async (ctx) => <LabOrderDetailView result={await loadLabOrderDetail(ctx, decodeURIComponent(orderId))} />}</LabRouteGate>;
}