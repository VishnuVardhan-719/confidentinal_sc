import type { ReactNode } from "react";
import { GateNotice } from "./gate-notice";
import { InlineError } from "./inline-error";
import { LoadingSkeleton } from "./loading-skeleton";
import { RetryAction } from "./retry-action";
import type { ViewState } from "./view-state";

/**
 * Renders the non-ready states of a ViewState, or calls `children(data)` when ready.
 * Shared by the payment, support and notification components.
 */
export function ViewStateFallback<T>({
  view,
  children,
  loadingVariant = "list",
}: {
  view: ViewState<T>;
  children: (data: T) => ReactNode;
  loadingVariant?: "list" | "detail" | "page";
}) {
  switch (view.kind) {
    case "loading":
      return <LoadingSkeleton variant={loadingVariant} rows={3} />;
    case "error":
      return <InlineError code={view.code} action={<RetryAction />} />;
    case "gated":
      return view.feature ? <GateNotice feature={view.feature} /> : <GateNotice reason="contract_pending" />;
    case "ready":
      return <>{children(view.data)}</>;
  }
}
