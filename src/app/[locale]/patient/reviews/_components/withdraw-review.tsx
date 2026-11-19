"use client";

import { Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useRouter } from "@/i18n/navigation";
import type { ApiResult } from "@/lib/api/result";
import type { Review } from "@/modules/reviews/types";

/** Withdraw with explicit confirmation. Final: the server hides the review and blocks a new one for this visit. */
export function WithdrawReview({
  bookingId,
  provider,
  version,
  withdraw,
}: {
  bookingId: string;
  provider: string;
  version: number;
  withdraw: (bookingId: string, version: number) => Promise<ApiResult<Review>>;
}) {
  const t = useTranslations("patientAccount.reviews.withdraw");
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button variant="quiet" aria-label={t("triggerLabel", { provider })}>
          <Undo2 aria-hidden />
          {t("trigger")}
        </Button>
      }
      title={t("title")}
      description={t("body")}
      confirmLabel={t("confirm")}
      cancelLabel={t("keep")}
      tone="danger"
      onConfirm={async () => {
        const r = await withdraw(bookingId, version);
        if (!r.ok) return { ok: false, code: r.error.code };
        router.push("/patient/reviews?status=withdrawn");
        router.refresh();
        return { ok: true };
      }}
    />
  );
}
