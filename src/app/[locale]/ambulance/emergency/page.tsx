import { getTranslations } from "next-intl/server";
import { privateMetadata } from "@/components/admin/ops/metadata";
import { AmbulanceRouteGate } from "@/components/ambulance/ambulance-frame";
import { EmergencyView } from "@/components/ambulance/ambulance-views";
import { loadEmergencyPlaceholder } from "@/modules/ambulance/loaders";

export async function generateMetadata() {
  return privateMetadata((await getTranslations("ambulance.nav"))("emergency"));
}

/** Hard-gated placeholder: dispatch is never available; Call 112 is always shown. */
export default function Page() {
  return <AmbulanceRouteGate route="emergency">{() => <EmergencyView guidance={loadEmergencyPlaceholder()} />}</AmbulanceRouteGate>;
}