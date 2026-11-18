import { getTranslations } from "next-intl/server";
import { privateMetadata } from "@/components/admin/ops/metadata";
import { CaretakerRouteGate } from "@/components/caretaker/caretaker-frame";
import { CareAssignmentsView } from "@/components/caretaker/caretaker-views";
import { loadAssignments } from "@/modules/caretaker/loaders";

export async function generateMetadata() {
  return privateMetadata((await getTranslations("caretaker.nav"))("assignments"));
}

export default function Page() {
  return <CaretakerRouteGate route="assignments">{async (ctx) => <CareAssignmentsView result={await loadAssignments(ctx)} />}</CaretakerRouteGate>;
}