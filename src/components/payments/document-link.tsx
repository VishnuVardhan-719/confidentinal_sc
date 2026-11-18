import { Clock, FileText, FileX } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/components/ui/cn";
import { isSafeDocumentHref } from "./money";

export type BillingDocumentState = "available" | "pending" | "not_issued" | "expired" | "unavailable";

export type BillingDocumentView = {
  state: BillingDocumentState;
  /** Short-lived signed URL or internal route, issued by the server after an access check. */
  href?: string | null;
  /** Who issues the document. Provider-collected (pay-after) payments get provider documents. */
  issuer?: "platform" | "provider" | null;
};

/**
 * Link to an invoice or receipt only when the server says one exists and the URL is safe.
 * Otherwise an honest status line. No document is ever generated client-side. Server component.
 * Signed URLs open in a new tab with no referrer, so they never leak via Referer.
 */
function BillingDocumentLink({ kind, doc, className }: { kind: "invoice" | "receipt"; doc: BillingDocumentView; className?: string }) {
  const t = useTranslations("payment.documents");
  const label = t(`${kind}.label`);
  const issuer = doc.issuer ? t(`issuer.${doc.issuer}`) : null;

  if (doc.state === "available" && isSafeDocumentHref(doc.href)) {
    return (
      <p className={cn("grid gap-0.5", className)}>
        <a
          href={doc.href}
          target="_blank"
          rel="noopener noreferrer"
          referrerPolicy="no-referrer"
          className="inline-flex min-h-target w-fit items-center gap-2 font-semibold text-forest underline underline-offset-4 hover:text-forest-strong"
        >
          <FileText aria-hidden className="size-4.5" />
          {t(`${kind}.open`)}
          <span className="sr-only">{t("newTab")}</span>
        </a>
        {issuer ? <span className="text-sm text-muted">{issuer}</span> : null}
      </p>
    );
  }

  const state: Exclude<BillingDocumentState, "available"> = doc.state === "available" ? "unavailable" : doc.state;
  const Icon = state === "pending" ? Clock : FileX;
  return (
    <p className={cn("flex items-start gap-2 text-base text-muted", className)}>
      <Icon aria-hidden className="mt-0.5 size-4.5 shrink-0" />
      <span>
        <span className="font-medium text-ink">{label}: </span>
        {t(`state.${state}`)}
      </span>
    </p>
  );
}

export function InvoiceLink(props: { doc: BillingDocumentView; className?: string }) {
  return <BillingDocumentLink kind="invoice" {...props} />;
}

export function ReceiptLink(props: { doc: BillingDocumentView; className?: string }) {
  return <BillingDocumentLink kind="receipt" {...props} />;
}
