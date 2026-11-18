import { getTranslations } from "next-intl/server";
import { privateMetadata } from "@/components/admin/ops/metadata";
import { CaretakerRouteGate } from "@/components/caretaker/caretaker-frame";
import { CareAssignmentDetailView } from "@/components/caretaker/caretaker-views";
import { loadAssignmentDetail } from "@/modules/caretaker/loaders";

export async function generateMetadata() {
  return privateMetadata((await getTranslations("caretaker.nav"))("assignments"));
}

export default async function Page({ params }: PageProps<"/[locale]/caretaker/assignments/[assignmentId]">) {
  const { assignmentId } = await params;
  return (
    <CaretakerRouteGate route="assignments">
      {async (ctx) => <CareAssignmentDetailView result={await loadAssignmentDetail(ctx, decodeURIComponent(assignmentId))} />}
    </CaretakerRouteGate>
  );
}