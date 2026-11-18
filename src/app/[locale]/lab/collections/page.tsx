import { getTranslations } from "next-intl/server";
import { privateMetadata } from "@/components/admin/ops/metadata";
import { LabRouteGate } from "@/components/lab/lab-frame";
import { LabCollectionsView } from "@/components/lab/lab-views";
import { loadLabCollections } from "@/modules/lab/loaders";

export async function generateMetadata() {
  return privateMetadata((await getTranslations("lab.nav"))("collections"));
}

export default function LabCollectionsPage() {
  return <LabRouteGate route="collections">{async (ctx) => <LabCollectionsView result={await loadLabCollections(ctx)} />}</LabRouteGate>;
}