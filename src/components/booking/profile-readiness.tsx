import { CircleCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { Notice } from "@/components/shared/notice";
import { Link } from "@/i18n/navigation";
import { profileItemHref, type BookingReadiness } from "@/modules/patient/readiness";

/** "Ready to book: 13 of 13 complete" or the missing items with jump links. Counts come from the server only. */
export function ProfileReadiness({ readiness, id = "profile-readiness" }: { readiness: BookingReadiness; id?: string }) {
  const t = useTranslations("booking.gate");
  if (readiness.kind === "unknown") return <Notice tone="warning" title={t("unknownTitle")} data-testid="profile-completion" data-state="unknown">{t("unknownBody")}</Notice>;
  if (readiness.kind === "not_permitted") return <Notice tone="warning" title={t("notPermittedTitle")} data-testid="profile-completion" data-state="not_permitted">{t("notPermittedBody")}</Notice>;
  const percent = Math.round((readiness.done / readiness.total) * 100);
  const ready = readiness.kind === "ready";
  return (
    <section id={id} aria-labelledby={`${id}-title`} data-testid="profile-completion" data-state={readiness.kind}
      className={ready ? "grid gap-3 rounded-md border border-success/40 bg-success-surface p-4" : "grid gap-3 rounded-md border border-warning/40 bg-warning-surface p-4"}>
      <h3 id={`${id}-title`} className="flex items-center gap-2 text-lg font-semibold text-ink">
        {ready ? <CircleCheck aria-hidden className="size-5 text-success" /> : null}
        {ready ? <>{t("readyTitle")} <span className="font-normal text-ink/80">· {t("progress", { done: readiness.done, total: readiness.total })}</span></>
          : t("incompleteTitle", { done: readiness.done, total: readiness.total })}
      </h3>
      <div role="progressbar" aria-labelledby={`${id}-title`} aria-valuemin={0} aria-valuemax={readiness.total} aria-valuenow={readiness.done}
        className="h-2 overflow-hidden rounded-full bg-surface">
        <div className={ready ? "h-full bg-success" : "h-full bg-warning"} style={{ width: `${percent}%` }} />
      </div>
      {readiness.kind === "incomplete" ? (
        <div className="grid gap-2">
          <p className="text-base text-ink">{t("incompleteBody")}</p>
          <p className="text-sm font-semibold text-ink">{t("missingList")}</p>
          <ul className="flex flex-wrap gap-2">
            {readiness.missing.map(key => (
              <li key={key}>
                <Link href={profileItemHref(key)} className="inline-flex min-h-target items-center rounded-sm border border-border-strong bg-surface px-3 text-base text-forest underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus">
                  {t(`items.${key}`)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
