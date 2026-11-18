import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export type BreadcrumbItem = { label: string; href?: string };

/** Last item is the current page (aria-current); earlier items must have an href. */
export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  const t = useTranslations("accessibility");
  return (
    <nav aria-label={t("breadcrumb")}>
      <ol className="flex flex-wrap items-center gap-1 text-sm text-muted">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className="inline-flex items-center gap-1">
              {last || !item.href ? (
                <span aria-current={last ? "page" : undefined} className={last ? "font-medium text-ink" : undefined}>
                  {item.label}
                </span>
              ) : (
                <Link href={item.href} className="inline-flex min-h-target items-center underline-offset-4 hover:text-forest hover:underline">
                  {item.label}
                </Link>
              )}
              {last ? null : <ChevronRight aria-hidden className="size-3.5" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
