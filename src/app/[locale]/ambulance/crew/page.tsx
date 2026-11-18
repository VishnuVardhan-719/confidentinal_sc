import { getTranslations } from "next-intl/server";
import { privateMetadata } from "@/components/admin/ops/metadata";
import { AmbulanceRouteGate } from "@/components/ambulance/ambulance-frame";
import { CrewView } from "@/components/ambulance/ambulance-views";
import { loadCrew } from "@/modules/ambulance/loaders";

export async function generateMetadata() {
  return privateMetadata((await getTranslations("ambulance.nav"))("crew"));
}

export default function Page() {
  return <AmbulanceRouteGate route="crew">{async (ctx) => <CrewView result={await loadCrew(ctx)} />}</AmbulanceRouteGate>;
}