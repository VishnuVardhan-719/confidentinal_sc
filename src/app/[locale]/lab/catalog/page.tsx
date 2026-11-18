import { getTranslations } from "next-intl/server";
import { privateMetadata } from "@/components/admin/ops/metadata";
import { LabRouteGate } from "@/components/lab/lab-frame";
import { LabCatalogView } from "@/components/lab/lab-views";
import { loadLabCatalog } from "@/modules/lab/loaders";

export async function generateMetadata() {
  return privateMetadata((await getTranslations("lab.nav"))("catalog"));
}

export default function LabCatalogPage() {
  return <LabRouteGate route="catalog">{async (ctx) => <LabCatalogView result={await loadLabCatalog(ctx)} />}</LabRouteGate>;
}