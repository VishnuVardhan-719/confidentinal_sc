import { getTranslations } from "next-intl/server";
import { privateMetadata } from "@/components/admin/ops/metadata";
import { CaretakerRouteGate } from "@/components/caretaker/caretaker-frame";
import { CareShiftsView } from "@/components/caretaker/caretaker-views";
import { loadShifts } from "@/modules/caretaker/loaders";

export async function generateMetadata() {
  return privateMetadata((await getTranslations("caretaker.nav"))("shifts"));
}

export default function Page() {
  return <CaretakerRouteGate route="shifts">{async (ctx) => <CareShiftsView result={await loadShifts(ctx)} />}</CaretakerRouteGate>;
}