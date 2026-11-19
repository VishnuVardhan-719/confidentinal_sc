import { getTranslations } from "next-intl/server";
import { StatusBadge } from "@/components/shared/status-badge";
import type { StatusDescriptor } from "@/components/shared/status";
import { badgeFor } from "@/components/clinical/kit";
import { getClinicalFormat } from "@/components/clinical/server-format";
import { describeBookingState } from "@/modules/doctor/status";
import type { AssignedVisitView } from "@/modules/doctor/types";

/**
 * Compact visit context for post-visit documents (notes, prescription drafts). Booking, document
 * (clinical) and payment states are three separate badges, each with a visible label; none is
 * derived from another. No patient contact or address here.
 */
export async function ConsultationContext({ visit, documentLabel, documentBadge }: { visit: AssignedVisitView; documentLabel: string; documentBadge: StatusDescriptor }) {
  const [t, f] = await Promise.all([getTranslations("doctor.common"), getClinicalFormat()]);
  const payment: StatusDescriptor = {
    tone: visit.paymentState === "PAID" ? "success" : "neutral",
    icon: visit.paymentState === "PAID" ? undefined : "clock",
    label: t(`paymentState.${visit.paymentState}`),
  };
  const rows: { label: string; badge: StatusDescriptor }[] = [
    { label: t("bookingStatus"), badge: badgeFor(describeBookingState(visit.state), f.tk) },
    { label: documentLabel, badge: documentBadge },
    { label: t("paymentStatus"), badge: payment },
  ];
  return (
    <section aria-label={t("visitContext")} className="grid gap-3 rounded-lg border border-border bg-surface p-4">
      <p className="text-sm text-muted tabular">
        {visit.publicReference ? `${visit.publicReference} · ` : ""}
        {visit.serviceName} · {f.dateTime(visit.scheduledStartAt)}
      </p>
      <dl className="flex flex-wrap gap-x-6 gap-y-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-2">
            <dt className="text-sm text-muted">{r.label}</dt>
            <dd>
              <StatusBadge {...r.badge} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
