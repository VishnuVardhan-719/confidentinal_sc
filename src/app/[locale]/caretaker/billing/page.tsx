import { getTranslations } from "next-intl/server";
import { privateMetadata } from "@/components/admin/ops/metadata";
import { CaretakerRouteGate } from "@/components/caretaker/caretaker-frame";
import { CareNotConnectedView } from "@/components/caretaker/caretaker-views";

export async function generateMetadata() {
  return privateMetadata((await getTranslations("caretaker.nav"))("billing"));
}

export default function Page() {
  return <CaretakerRouteGate route="billing">{() => <CareNotConnectedView section="billing" />}</CaretakerRouteGate>;
}