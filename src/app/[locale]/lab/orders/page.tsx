import { getTranslations } from "next-intl/server";
import { privateMetadata } from "@/components/admin/ops/metadata";
import { LabRouteGate } from "@/components/lab/lab-frame";
import { LAB_QUEUES, LabOrdersView } from "@/components/lab/lab-views";
import type { LabOrderQueue } from "@/modules/lab/api";
import { loadLabOrders } from "@/modules/lab/loaders";

export async function generateMetadata() {
  return privateMetadata((await getTranslations("lab.nav"))("orders"));
}

/** Only the queue name is read from the URL (a public filter, no personal data); unknown values fall back. */
export default async function LabOrdersPage({ searchParams }: PageProps<"/[locale]/lab/orders">) {
  const raw = (await searchParams).queue;
  const queue: LabOrderQueue = typeof raw === "string" && (LAB_QUEUES as readonly string[]).includes(raw) ? (raw as LabOrderQueue) : "pending";
  return <LabRouteGate route="orders">{async (ctx) => <LabOrdersView queue={queue} result={await loadLabOrders(ctx, queue)} />}</LabRouteGate>;
}