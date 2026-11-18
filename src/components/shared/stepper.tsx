import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/components/ui/cn";

export type StepState = "complete" | "current" | "upcoming";
export type StepItem = { id: string; label: string; state: StepState };

/**
 * Progress through a multi-step form. Non-interactive, so it is a labelled group, not a <nav>
 * landmark. If steps ever become links, switch to <nav> with real links.
 */
export function Stepper({ steps, className }: { steps: StepItem[]; className?: string }) {
  const t = useTranslations("common.stepper");
  const currentIndex = steps.findIndex((s) => s.state === "current");
  return (
    <div role="group" aria-label={t("label")} className={className}>
      <p className="mb-3 text-sm font-medium text-muted sm:sr-only">
        {t("progress", { current: Math.max(currentIndex, 0) + 1, total: steps.length })}
      </p>
      <ol className="flex gap-2 sm:gap-0">
        {steps.map((step, i) => (
          <li
            key={step.id}
            aria-current={step.state === "current" ? "step" : undefined}
            className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center"
          >
            <span className="flex items-center gap-2 sm:contents">
              <span
                className={cn(
                  "inline-flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold tabular",
                  step.state === "complete" && "border-forest bg-forest text-on-forest",
                  step.state === "current" && "border-forest bg-surface text-forest",
                  step.state === "upcoming" && "border-border-strong bg-surface text-muted",
                )}
              >
                {step.state === "complete" ? <Check aria-hidden className="size-4" strokeWidth={3} /> : i + 1}
              </span>
              <span
                className={cn(
                  "sr-only truncate text-sm sm:not-sr-only sm:ml-2",
                  step.state === "current" ? "font-semibold text-ink" : "text-muted",
                )}
              >
                {step.label}
                <span className="sr-only"> ({t(`state.${step.state}`)})</span>
              </span>
            </span>
            {i < steps.length - 1 ? (
              <span aria-hidden className={cn("h-0.5 flex-1 rounded sm:mx-3", step.state === "complete" ? "bg-forest" : "bg-border")} />
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
