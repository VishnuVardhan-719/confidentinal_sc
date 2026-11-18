import { getTranslations } from "next-intl/server";
import { privateMetadata } from "@/components/admin/ops/metadata";
import { AmbulanceRouteGate } from "@/components/ambulance/ambulance-frame";
import { TRIP_QUEUES, TripsView } from "@/components/ambulance/ambulance-views";
import type { TripQueue } from "@/modules/ambulance/api";
import { loadTrips } from "@/modules/ambulance/loaders";

export async function generateMetadata() {
  return privateMetadata((await getTranslations("ambulance.nav"))("trips"));
}

/** Only the queue name is read from the URL; unknown values fall back to today. */
export default async function Page({ searchParams }: PageProps<"/[locale]/ambulance/trips">) {
  const raw = (await searchParams).queue;
  const queue: TripQueue = typeof raw === "string" && (TRIP_QUEUES as readonly string[]).includes(raw) ? (raw as TripQueue) : "today";
  return <AmbulanceRouteGate route="trips">{async (ctx) => <TripsView queue={queue} result={await loadTrips(ctx, queue)} />}</AmbulanceRouteGate>;
}