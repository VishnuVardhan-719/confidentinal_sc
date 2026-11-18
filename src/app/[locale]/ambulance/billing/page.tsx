import { getTranslations } from "next-intl/server";
import { privateMetadata } from "@/components/admin/ops/metadata";
import { AmbulanceRouteGate } from "@/components/ambulance/ambulance-frame";
import { AmbulanceNotConnectedView } from "@/components/ambulance/ambulance-views";

export async function generateMetadata() {
  return privateMetadata((await getTranslations("ambulance.nav"))("billing"));
}

export default function Page() {
  return <AmbulanceRouteGate route="billing">{() => <AmbulanceNotConnectedView section="billing" />}</AmbulanceRouteGate>;
}