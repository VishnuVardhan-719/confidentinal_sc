import { getTranslations } from "next-intl/server";
import { privateMetadata } from "@/components/admin/ops/metadata";
import { LabRouteGate } from "@/components/lab/lab-frame";
import { LabReportsView } from "@/components/lab/lab-views";
import { loadLabReports } from "@/modules/lab/loaders";

export async function generateMetadata() {
  return privateMetadata((await getTranslations("lab.nav"))("reports"));
}

export default function LabReportsPage() {
  return <LabRouteGate route="reports">{async (ctx) => <LabReportsView result={await loadLabReports(ctx)} />}</LabRouteGate>;
}