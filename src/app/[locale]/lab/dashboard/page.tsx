import { getTranslations } from "next-intl/server";
import { privateMetadata } from "@/components/admin/ops/metadata";
import { LabRouteGate } from "@/components/lab/lab-frame";
import { LabDashboardView } from "@/components/lab/lab-views";
import { loadLabDashboard } from "@/modules/lab/loaders";

export async function generateMetadata() {
  return privateMetadata((await getTranslations("lab.nav"))("dashboard"));
}

export default function LabDashboardPage() {
  return (
    <LabRouteGate route="dashboard">
      {async (ctx) => <LabDashboardView result={await loadLabDashboard(ctx)} workspaceName={ctx.workspace.displayName} />}
    </LabRouteGate>
  );
}