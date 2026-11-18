import { getTranslations } from "next-intl/server";
import { privateMetadata } from "@/components/admin/ops/metadata";
import { AmbulanceRouteGate } from "@/components/ambulance/ambulance-frame";
import { DriverView } from "@/components/ambulance/ambulance-views";
import { loadDriverQueue } from "@/modules/ambulance/loaders";

export async function generateMetadata() {
  return privateMetadata((await getTranslations("ambulance.nav"))("driver"));
}

export default function Page() {
  return <AmbulanceRouteGate route="driver">{async (ctx) => <DriverView result={await loadDriverQueue(ctx)} />}</AmbulanceRouteGate>;
}