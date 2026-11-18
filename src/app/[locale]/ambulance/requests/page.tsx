import { getTranslations } from "next-intl/server";
import { readCursor } from "@/components/admin/ops/cursor";
import { privateMetadata } from "@/components/admin/ops/metadata";
import { AmbulanceRouteGate } from "@/components/ambulance/ambulance-frame";
import { RequestsView } from "@/components/ambulance/ambulance-views";
import { loadRequests } from "@/modules/ambulance/loaders";

export async function generateMetadata() {
  return privateMetadata((await getTranslations("ambulance.nav"))("requests"));
}

/** Only a validated opaque pagination cursor is read from the URL. */
export default async function Page({ searchParams }: PageProps<"/[locale]/ambulance/requests">) {
  const cursor = readCursor((await searchParams).cursor);
  return <AmbulanceRouteGate route="requests">{async (ctx) => <RequestsView cursor={cursor} result={await loadRequests(ctx, cursor)} />}</AmbulanceRouteGate>;
}