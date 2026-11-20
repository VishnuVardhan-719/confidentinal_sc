import { BadgeCheck, CalendarClock, CircleSlash, SearchX, type LucideIcon } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/components/ui/cn";
import { Field } from "@/components/shared/field";
import { formatProofCode, PROOF_CODE_LENGTH, type ProofCheckResult } from "@/modules/proof-of-visit";

/**
 * Code entry. A plain GET form to /verify/check (works without JavaScript); a route handler
 * normalizes the code and answers with an HTTP redirect to /verify/<code>. Nothing typed here is stored in the browser.
 */
export async function ProofCodeForm({ locale, defaultValue, error }: { locale: string; defaultValue?: string; error?: string }) {
  const t = await getTranslations("verify.form");
  const id = "proof-code";
  return (
    <form action={`/${locale}/verify/check`} method="get" noValidate className="grid max-w-form gap-4" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="text-lg font-semibold text-ink">
        {t("title")}
      </h2>
      <Field id={id} label={t("label")} hint={t("hint", { length: PROOF_CODE_LENGTH })} required error={error}>
        {(control) => (
          <Input
            {...control}
            name="code"
            defaultValue={defaultValue}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            inputMode="text"
            maxLength={80}
            className="font-mono tabular"
          />
        )}
      </Field>
      <div>
        <Button type="submit">{t("submit")}</Button>
      </div>
    </form>
  );
}

const LOOK: Record<ProofCheckResult["status"], { icon: LucideIcon; box: string; iconClass: string }> = {
  valid: { icon: BadgeCheck, box: "border-success/40 bg-success-surface", iconClass: "text-success" },
  expired: { icon: CalendarClock, box: "border-warning/40 bg-warning-surface", iconClass: "text-warning-text" },
  revoked: { icon: CircleSlash, box: "border-warning/40 bg-warning-surface", iconClass: "text-warning-text" },
  unknown: { icon: SearchX, box: "border-border bg-paper-deep", iconClass: "text-muted" },
};

/** Result panel. Minimum attendance facts only; never patient, address, code or health detail. */
export async function ProofCheckResultView({ result, code }: { result: ProofCheckResult; code: string | null }) {
  const [t, f] = await Promise.all([getTranslations("verify.result"), getFormatter()]);
  const look = LOOK[result.status];
  const Icon = look.icon;
  return (
    <section aria-labelledby="proof-result-title" className={cn("grid gap-4 rounded-lg border p-5 sm:p-6", look.box)}>
      <div className="flex items-start gap-3">
        <Icon aria-hidden className={cn("mt-0.5 size-6 shrink-0", look.iconClass)} />
        <div className="grid gap-1">
          <h2 id="proof-result-title" className="text-xl font-semibold text-ink">
            {t(`${result.status}.title`)}
          </h2>
          <p className="text-ink">{t(`${result.status}.body`)}</p>
        </div>
      </div>
      {result.status === "valid" ? (
        <dl className="grid gap-3 sm:grid-cols-3">
          <div className="grid gap-0.5">
            <dt className="text-sm text-muted">{t("date")}</dt>
            {/* serviceDate is an IST calendar date; format it as a date, never shift it. */}
            <dd className="font-medium text-ink tabular">{f.dateTime(new Date(`${result.serviceDate}T12:00:00+05:30`), { dateStyle: "long", timeZone: "Asia/Kolkata" })}</dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="text-sm text-muted">{t("service")}</dt>
            <dd className="font-medium text-ink">{t("category.doctor_visit")}</dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="text-sm text-muted">{t("provider")}</dt>
            <dd className="font-medium text-ink">{result.providerDisplayName}</dd>
          </div>
        </dl>
      ) : null}
      {code ? (
        <p className="text-sm text-muted">
          {t("checkedCode")} <span className="font-mono tabular break-all">{formatProofCode(code)}</span>
        </p>
      ) : null}
      <p className="text-sm text-muted">{t("limits")}</p>
    </section>
  );
}
