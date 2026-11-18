import { getTranslations } from "next-intl/server";
import { privateMetadata } from "@/components/admin/ops/metadata";
import { CaretakerRouteGate } from "@/components/caretaker/caretaker-frame";
import { CarePlansView } from "@/components/caretaker/caretaker-views";

export async function generateMetadata() {
  return privateMetadata((await getTranslations("caretaker.nav"))("plans"));
}

/** Recurring plans are hard-gated (RECURRING_CARE_GATE); no purchase or schedule controls exist. */
export default function Page() {
  return <CaretakerRouteGate route="plans">{() => <CarePlansView />}</CaretakerRouteGate>;
}