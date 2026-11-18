import { getTranslations } from "next-intl/server";
import { privateMetadata } from "@/components/admin/ops/metadata";
import { AmbulanceRouteGate } from "@/components/ambulance/ambulance-frame";
import { AmbulanceDashboardView } from "@/components/ambulance/ambulance-views";
import { loadAmbulanceDashboard } from "@/modules/ambulance/loaders";

export async function generateMetadata() {
  return privateMetadata((await getTranslations("ambulance.nav"))("dashboard"));
}

export default function Page() {
  return <AmbulanceRouteGate route="dashboard">{async (ctx) => <AmbulanceDashboardView result={await loadAmbulanceDashboard(ctx)} workspaceName={ctx.workspace.displayName} />}</AmbulanceRouteGate>;
}