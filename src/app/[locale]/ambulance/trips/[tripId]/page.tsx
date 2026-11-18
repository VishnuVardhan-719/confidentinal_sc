import { getTranslations } from "next-intl/server";
import { privateMetadata } from "@/components/admin/ops/metadata";
import { AmbulanceRouteGate } from "@/components/ambulance/ambulance-frame";
import { TripDetailView } from "@/components/ambulance/ambulance-views";
import { loadTripDetail } from "@/modules/ambulance/loaders";

export async function generateMetadata() {
  return privateMetadata((await getTranslations("ambulance.nav"))("trips"));
}

export default async function Page({ params }: PageProps<"/[locale]/ambulance/trips/[tripId]">) {
  const { tripId } = await params;
  return <AmbulanceRouteGate route="trips">{async (ctx) => <TripDetailView result={await loadTripDetail(ctx, decodeURIComponent(tripId))} />}</AmbulanceRouteGate>;
}