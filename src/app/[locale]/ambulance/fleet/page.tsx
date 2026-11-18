import { getTranslations } from "next-intl/server";
import { privateMetadata } from "@/components/admin/ops/metadata";
import { AmbulanceRouteGate } from "@/components/ambulance/ambulance-frame";
import { FleetView } from "@/components/ambulance/ambulance-views";
import { loadFleet } from "@/modules/ambulance/loaders";

export async function generateMetadata() {
  return privateMetadata((await getTranslations("ambulance.nav"))("fleet"));
}

export default function Page() {
  return <AmbulanceRouteGate route="fleet">{async (ctx) => <FleetView result={await loadFleet(ctx)} />}</AmbulanceRouteGate>;
}