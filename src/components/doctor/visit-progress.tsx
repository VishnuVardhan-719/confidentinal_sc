import { Check } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { cn } from "@/components/ui/cn";
import { VISIT_PHASES, type AssignedVisitView } from "@/modules/doctor/types";

/**
 * Slim status timeline (DC03). Derived from the authoritative server phase; an unknown phase
 * marks nothing as done rather than guessing.
 */
export async function VisitProgress({ phase }: { phase: AssignedVisitView["phase"] }) {
  const t = await getTranslations("doctor.visit");
  const current = (VISIT_PHASES as readonly string[]).indexOf(phase);
  return (
    <ol aria-label={t("progress")} className="flex flex-wrap gap-x-1 gap-y-2">
      {VISIT_PHASES.map((p, i) => {
        const state = current < 0 ? "upcoming" : i < current ? "done" : i === current ? "current" : "upcoming";
        return (
          <li
            key={p}
            aria-current={state === "current" ? "step" : undefined}
            className={cn(
              "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm",
              state === "done" && "bg-mist text-forest",
              state === "current" && "bg-forest font-semibold text-on-forest",
              state === "upcoming" && "border border-border text-muted",
            )}
          >
            {state === "done" ? <Check aria-hidden className="size-3.5" strokeWidth={3} /> : null}
            {t(`steps.${p}`)}
            <span className="sr-only"> ({t(`stepState.${state}`)})</span>
          </li>
        );
      })}
    </ol>
  );
}
