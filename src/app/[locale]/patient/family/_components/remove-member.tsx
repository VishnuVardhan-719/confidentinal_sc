"use client";

import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useRouter } from "@/i18n/navigation";
import type { ApiResult } from "@/lib/api/result";

/** Remove with explicit confirmation; the server checks ownership and the expected version. */
export function RemoveMember({
  memberId,
  name,
  version,
  remove,
}: {
  memberId: string;
  name: string;
  version: number;
  remove: (id: string, version: number) => Promise<ApiResult<{ id: string }>>;
}) {
  const t = useTranslations("patientAccount.family.remove");
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button variant="secondary" className="text-danger">
          <Trash2 aria-hidden />
          {t("trigger")}
        </Button>
      }
      title={t("title", { name })}
      description={t("body")}
      confirmLabel={t("confirm")}
      cancelLabel={t("keep")}
      tone="danger"
      onConfirm={async () => {
        const r = await remove(memberId, version);
        if (!r.ok) return { ok: false, code: r.error.code };
        router.push("/patient/family?status=removed");
        router.refresh();
        return { ok: true };
      }}
    />
  );
}
