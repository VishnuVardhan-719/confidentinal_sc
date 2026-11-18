import { getTranslations } from "next-intl/server";
import { privateMetadata } from "@/components/admin/ops/metadata";
import { CaretakerRouteGate } from "@/components/caretaker/caretaker-frame";
import { CareRequestsView } from "@/components/caretaker/caretaker-views";
import { loadCareRequests } from "@/modules/caretaker/loaders";

export async function generateMetadata() {
  return privateMetadata((await getTranslations("caretaker.nav"))("requests"));
}

export default function Page() {
  return <CaretakerRouteGate route="requests">{async (ctx) => <CareRequestsView result={await loadCareRequests(ctx)} />}</CaretakerRouteGate>;
}