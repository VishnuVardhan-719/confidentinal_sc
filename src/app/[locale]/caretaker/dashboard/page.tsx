import { getTranslations } from "next-intl/server";
import { privateMetadata } from "@/components/admin/ops/metadata";
import { CaretakerRouteGate } from "@/components/caretaker/caretaker-frame";
import { CareDashboardView } from "@/components/caretaker/caretaker-views";
import { loadCaretakerDashboard } from "@/modules/caretaker/loaders";

export async function generateMetadata() {
  return privateMetadata((await getTranslations("caretaker.nav"))("dashboard"));
}

export default function Page() {
  return <CaretakerRouteGate route="dashboard">{async (ctx) => <CareDashboardView result={await loadCaretakerDashboard(ctx)} workspaceName={ctx.workspace.displayName} />}</CaretakerRouteGate>;
}