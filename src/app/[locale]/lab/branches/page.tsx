import { getTranslations } from "next-intl/server";
import { privateMetadata } from "@/components/admin/ops/metadata";
import { LabRouteGate } from "@/components/lab/lab-frame";
import { LabBranchesView } from "@/components/lab/lab-views";
import { loadLabBranches } from "@/modules/lab/loaders";

export async function generateMetadata() {
  return privateMetadata((await getTranslations("lab.nav"))("branches"));
}

export default function LabBranchesPage() {
  return <LabRouteGate route="branches">{async (ctx) => <LabBranchesView result={await loadLabBranches(ctx)} />}</LabRouteGate>;
}