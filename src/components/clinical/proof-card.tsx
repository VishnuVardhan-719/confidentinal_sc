"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/shared/inline-error";
import { Notice } from "@/components/shared/notice";
import { StatusBadge } from "@/components/shared/status-badge";
import { Link } from "@/i18n/navigation";
import type { ApiResult } from "@/lib/api/result";
import { newIntentKey } from "@/modules/clinical/finalize-flow";
import { msUntilProofExpiry, proofState } from "@/modules/records/logic";
import { describeProofState } from "@/modules/records/status";
import type { ProofOfVisit } from "@/modules/records/types";
import { badgeFor } from "./kit";
import { useClinicalFormat } from "./use-format";

/**
 * DC12 proof of visit. The token is opaque (no patient ID, OTP or health data). No QR is drawn:
 * there is no approved QR dependency or public check page yet (REQUESTS.md), and a fake QR would
 * be worse than none.
 */
export function ProofCard({
  bookingId,
  available,
  issue,
  revoke,
}: {
  bookingId: string;
  available: boolean;
  issue: (bookingId: string, key: string) => Promise<ApiResult<ProofOfVisit>>;
  revoke: (bookingId: string, token: string) => Promise<ApiResult<ProofOfVisit>>;
}) {
  const t = useTranslations("clinical.proof");
  const tc = useTranslations("common.actions");
  const { tk, dateTime } = useClinicalFormat();
  const titleId = useId();
  const [proof, setProof] = useState<ProofOfVisit | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Re-evaluate the badge when the proof expires instead of showing "active" until a re-render.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!proof) return;
    const ms = msUntilProofExpiry(proof, new Date());
    if (ms === null) return;
    const timer = setTimeout(() => setNow(new Date()), ms + 50);
    return () => clearTimeout(timer);
  }, [proof, now]);
  const key = useRef<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    key.current ??= newIntentKey();
    try {
      const r = await issue(bookingId, key.current);
      if (!r.ok) return setError(r.error.code);
      if (proof && !proof.revokedAt) setNote(t("revokedNote"));
      key.current = null;
      setProof(r.data);
    } finally {
      setBusy(false);
    }
  }

  async function revokeCurrent() {
    if (!proof) return;
    setBusy(true);
    setError(null);
    try {
      const r = await revoke(bookingId, proof.token);
      if (!r.ok) return setError(r.error.code);
      setProof(r.data);
    } finally {
      setBusy(false);
    }
  }

  const state = proof ? proofState(proof, now) : null;
  return (
    <section aria-labelledby={titleId} className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={titleId} className="text-lg font-semibold text-ink">
          {t("title")}
        </h2>
        {state ? <StatusBadge {...badgeFor(describeProofState(state), tk)} /> : null}
      </div>
      <p className="text-sm text-muted">{t("intro")}</p>
      {!available ? (
        <p className="text-muted">{t("notYet")}</p>
      ) : (
        <>
          {proof ? (
            <dl className="grid gap-1">
              <dt className="text-sm text-muted">{t("code")}</dt>
              <dd className="font-mono text-base break-all text-ink tabular">{proof.token}</dd>
              <dd className="text-sm text-muted tabular">{t("expires", { time: dateTime(proof.expiresAt) })}</dd>
              <dd>
                {/* Public check page (DC12): shows only date, service type and doctor name. */}
                <Link href={`/verify/${proof.token}`} target="_blank" rel="noreferrer" className="inline-flex min-h-target items-center text-sm text-forest underline underline-offset-4">
                  {t("checkLink")}
                </Link>
              </dd>
            </dl>
          ) : null}
          <div aria-live="polite">{note ? <Notice tone="info">{note}</Notice> : null}</div>
          {error ? <InlineError code={error} /> : null}
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={create} disabled={busy} aria-busy={busy}>
              {busy ? tc("working") : proof ? t("regenerate") : t("create")}
            </Button>
            {proof && state === "active" ? (
              <Button variant="quiet" onClick={revokeCurrent} disabled={busy}>
                {t("revoke")}
              </Button>
            ) : null}
          </div>
          <p className="text-sm text-muted">{t("qrPending")}</p>
        </>
      )}
    </section>
  );
}
