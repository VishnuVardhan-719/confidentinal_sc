"use client";

import { Bookmark, BookmarkMinus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/shared/inline-error";
import { useRouter } from "@/i18n/navigation";
import type { ApiResult } from "@/lib/api/result";

/**
 * Save or remove one doctor. Shows progress on the button; after the server confirms, the page is
 * refreshed with ?status=saved|removed and announces the result in a status message.
 */
export function SaveToggle({
  providerId,
  name,
  saved,
  save,
  unsave,
}: {
  providerId: string;
  name: string;
  saved: boolean;
  save: (providerId: string, key: string) => Promise<ApiResult<{ saved: true }>>;
  unsave: (providerId: string) => Promise<ApiResult<{ saved: false }>>;
}) {
  const t = useTranslations("patientAccount.saved");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef<string | null>(null);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      let r: ApiResult<unknown>;
      if (saved) {
        r = await unsave(providerId);
      } else {
        key.current ??= globalThis.crypto.randomUUID();
        r = await save(providerId, key.current);
      }
      if (!r.ok) {
        setError(r.error.code);
        return;
      }
      key.current = null;
      // The page renders the result as a status message (the card moves lists, so this button unmounts).
      router.replace(`/patient/saved?status=${saved ? "removed" : "saved"}`, { scroll: false });
      router.refresh();
    } catch {
      setError("unavailable");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid justify-items-start gap-2">
      <Button variant={saved ? "quiet" : "secondary"} onClick={toggle} disabled={busy} aria-busy={busy} aria-label={saved ? t("unsaveLabel", { name }) : t("saveLabel", { name })}>
        {saved ? <BookmarkMinus aria-hidden /> : <Bookmark aria-hidden />}
        {busy ? t("working") : saved ? t("unsave") : t("save")}
      </Button>
      {error ? <InlineError code={error} /> : null}
    </div>
  );
}
