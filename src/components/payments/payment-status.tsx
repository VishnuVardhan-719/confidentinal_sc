import { KeyedStatusBadge } from "@/components/shared/status-badge";
import type { StatusPresentation } from "@/components/shared/status";

/**
 * Payment status badge. Pass the canonical presentation from the payments module
 * (`paymentStatusPresentation(summary.status)`); this component never decides what "paid" means.
 * Always shown separately from the booking status badge. Server component.
 */
export function PaymentStatus({ presentation, className }: { presentation: StatusPresentation | null | undefined; className?: string }) {
  return <KeyedStatusBadge presentation={presentation} className={className} />;
}
