"use client";

import { useTranslations } from "next-intl";
import { fieldControlClass } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { usePathname, useRouter } from "@/i18n/navigation";

export type FilterSelect = { name: string; label: string; value: string; options: { value: string; label: string }[] };
export type FilterText = { name: string; label: string; hint?: string; value: string; pattern?: string; inputMode?: "numeric" | "text"; maxLength?: number };

/**
 * URL-driven filters (GET form). Without JavaScript the Apply button submits the form; with it,
 * changing a select updates the URL at once. The server re-parses and ignores invalid values.
 */
export function AdminFilters({ selects, texts = [] }: { selects: FilterSelect[]; texts?: FilterText[] }) {
  const t = useTranslations("onboarding.adminReview");
  const router = useRouter();
  const pathname = usePathname();

  function update(form: HTMLFormElement) {
    const params = new URLSearchParams();
    for (const [k, v] of new FormData(form).entries()) if (typeof v === "string" && v.trim() !== "") params.set(k, v.trim());
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <form
      method="get"
      aria-label={t("filters")}
      className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-paper p-4"
      onSubmit={(e) => {
        e.preventDefault();
        update(e.currentTarget);
      }}
    >
      {selects.map((s) => (
        <div key={s.name} className="grid gap-1">
          <label htmlFor={`filter-${s.name}`} className="text-sm font-semibold text-ink">
            {s.label}
          </label>
          <select
            id={`filter-${s.name}`}
            name={s.name}
            defaultValue={s.value}
            className={fieldControlClass}
            onChange={(e) => e.currentTarget.form && update(e.currentTarget.form)}
          >
            <option value="">{t("any")}</option>
            {s.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      ))}
      {texts.map((x) => (
        <div key={x.name} className="grid gap-1">
          <label htmlFor={`filter-${x.name}`} className="text-sm font-semibold text-ink">
            {x.label}
          </label>
          {x.hint ? <span className="text-sm text-muted">{x.hint}</span> : null}
          <input
            id={`filter-${x.name}`}
            name={x.name}
            defaultValue={x.value}
            inputMode={x.inputMode}
            pattern={x.pattern}
            maxLength={x.maxLength}
            className={fieldControlClass}
          />
        </div>
      ))}
      <div className="flex gap-2">
        <Button type="submit" variant="secondary">
          {t("apply")}
        </Button>
        <Button type="button" variant="quiet" onClick={() => router.replace(pathname)}>
          {t("clear")}
        </Button>
      </div>
    </form>
  );
}
