import { getTranslations } from "next-intl/server";
import { privateMetadata } from "@/components/admin/ops/metadata";
import { LabRouteGate } from "@/components/lab/lab-frame";
import { LabNotConnectedView } from "@/components/lab/lab-views";

export async function generateMetadata() {
  return privateMetadata((await getTranslations("lab.nav"))("support"));
}

export default function LabPage() {
  return <LabRouteGate route="support">{() => <LabNotConnectedView section="support" />}</LabRouteGate>;
}