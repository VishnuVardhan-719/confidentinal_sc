import { getTranslations } from "next-intl/server";
import { readCursor } from "@/components/admin/ops/cursor";
import { privateMetadata } from "@/components/admin/ops/metadata";
import { AmbulanceRouteGate } from "@/components/ambulance/ambulance-frame";
import { TRIP_QUEUES, TripsView } from "@/components/ambulance/ambulance-views";
import type { TripQueue } from "@/modules/ambulance/api";
import { loadTrips } from "@/modules/ambulance/loaders";

export async function generateMetadata() {
  return privateMetadata((await getTranslations("ambulance.nav"))("trips"));
}

/** Only the queue name and a validated opaque cursor are read from the URL; unknown queues fall back to today. */
export default async function Page({ searchParams }: PageProps<"/[locale]/ambulance/trips">) {
  const sp = await searchParams;
  const raw = sp.queue;
  const cursor = readCursor(sp.cursor);
  const queue: TripQueue = typeof raw === "string" && (TRIP_QUEUES as readonly string[]).includes(raw) ? (raw as TripQueue) : "today";
  return <AmbulanceRouteGate route="trips">{async (ctx) => <TripsView queue={queue} cursor={cursor} result={await loadTrips(ctx, queue, cursor)} />}</AmbulanceRouteGate>;
}