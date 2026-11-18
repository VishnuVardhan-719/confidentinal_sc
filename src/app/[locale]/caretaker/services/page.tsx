import { getTranslations } from "next-intl/server";
import { privateMetadata } from "@/components/admin/ops/metadata";
import { CaretakerRouteGate } from "@/components/caretaker/caretaker-frame";
import { CareServicesView } from "@/components/caretaker/caretaker-views";
import { loadCareServices } from "@/modules/caretaker/loaders";

export async function generateMetadata() {
  return privateMetadata((await getTranslations("caretaker.nav"))("services"));
}

export default function Page() {
  return <CaretakerRouteGate route="services">{async (ctx) => <CareServicesView result={await loadCareServices(ctx)} />}</CaretakerRouteGate>;
}