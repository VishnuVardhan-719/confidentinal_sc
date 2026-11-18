import { getTranslations } from "next-intl/server";
import { privateMetadata } from "@/components/admin/ops/metadata";
import { LabRouteGate } from "@/components/lab/lab-frame";
import { LabStaffView } from "@/components/lab/lab-views";
import { loadLabStaff } from "@/modules/lab/loaders";

export async function generateMetadata() {
  return privateMetadata((await getTranslations("lab.nav"))("staff"));
}

export default function LabStaffPage() {
  return <LabRouteGate route="staff">{async (ctx) => <LabStaffView result={await loadLabStaff(ctx)} />}</LabRouteGate>;
}