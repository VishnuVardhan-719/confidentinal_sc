import { getTranslations } from "next-intl/server";
import { privateMetadata } from "@/components/admin/ops/metadata";
import { CaretakerRouteGate } from "@/components/caretaker/caretaker-frame";
import { CareStaffView } from "@/components/caretaker/caretaker-views";
import { loadCareStaff } from "@/modules/caretaker/loaders";

export async function generateMetadata() {
  return privateMetadata((await getTranslations("caretaker.nav"))("staff"));
}

export default function Page() {
  return <CaretakerRouteGate route="staff">{async (ctx) => <CareStaffView result={await loadCareStaff(ctx)} />}</CaretakerRouteGate>;
}