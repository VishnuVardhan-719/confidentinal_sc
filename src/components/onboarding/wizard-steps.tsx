import { Check, Circle, CircleDot } from "lucide-react";
import { useTranslations } from "next-intl";
import { withoutLocale } from "@/components/auth/paths";
import { cn } from "@/components/ui/cn";
import { Link } from "@/i18n/navigation";
import type { WizardView } from "@/modules/onboarding/wizard";

/** Adds `provider=<id>` to a step link when the provider is not in the session yet (R-FE03-03). */
export const withProviderParam = (href: string, providerId: string | null): string =>
  providerId ? `${href}${href.includes("?") ? "&" : "?"}provider=${encodeURIComponent(providerId)}` : href;

/** Step navigation for a wizard. Step IDs in the URL carry no personal data. */
export function WizardSteps({ wizard, providerId = null }: { wizard: WizardView<string>; providerId?: string | null }) {
  const t = useTranslations() as unknown as (key: string) => string;
  return (
    <nav aria-label={t("onboarding.wizard.stepsLabel")}>
      <ol className="grid gap-1">
        {wizard.steps.map((step) => {
          const Icon = step.state === "complete" ? Check : step.current ? CircleDot : Circle;
          return (
            <li key={step.id}>
              <Link
                href={withoutLocale(withProviderParam(step.href, providerId))}
                aria-current={step.current ? "step" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-base text-ink hover:bg-mist focus-visible:outline-3 focus-visible:outline-focus",
                  step.current && "bg-mist font-semibold",
                )}
              >
                <Icon aria-hidden="true" className={cn("size-5 shrink-0", step.state === "complete" ? "text-forest" : "text-muted")} />
                <span className="grid">
                  <span>{t(step.labelKey as never)}</span>
                  <span className="text-sm font-normal text-muted">
                    {t(`onboarding.wizard.state.${step.state}` as never)}
                    {step.requiredForActivation ? null : ` · ${t("onboarding.wizard.optionalStep")}`}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** "Still needed" list of required steps, linking to each one. Never a percentage. */
export function StillNeeded({
  wizard,
  missing,
  providerId = null,
}: {
  wizard: WizardView<string>;
  missing: readonly string[];
  providerId?: string | null;
}) {
  const t = useTranslations() as unknown as (key: string) => string;
  const steps = wizard.steps.filter((s) => missing.includes(s.id));
  if (steps.length === 0) return <p className="text-base text-ink">{t("onboarding.wizard.allDone")}</p>;
  return (
    <div className="grid gap-2">
      <h2 id="still-needed-title" className="text-lg font-semibold text-ink">
        {t("onboarding.wizard.stillNeeded")}
      </h2>
      <ul aria-labelledby="still-needed-title" className="grid gap-1 ps-5 [list-style:disc]">
        {steps.map((s) => (
          <li key={s.id}>
            <Link href={withoutLocale(withProviderParam(s.href, providerId))} className="text-forest underline underline-offset-4">
              {t(s.labelKey as never)}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
