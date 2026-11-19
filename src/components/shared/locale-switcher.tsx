"use client";

import { Check, ChevronDown, Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { MouseEvent } from "react";
import { cn } from "@/components/ui/cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { LOCALES, type AppLocale } from "@/i18n/routing";

/**
 * Switches language while staying on the same route. Plain links work without JS (path only);
 * with JS the current query string is kept too. The locale cookie stores only the locale code.
 */
export function LocaleSwitcher({ variant = "menu", className }: { variant?: "menu" | "inline"; className?: string }) {
  const t = useTranslations("common");
  const ta = useTranslations("accessibility");
  const current = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  function keepQuery(e: MouseEvent, locale: AppLocale) {
    const search = window.location.search;
    if (!search || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    router.replace(`${pathname}${search}`, { locale });
  }

  if (variant === "inline") {
    return (
      <nav aria-label={ta("language")} className={className}>
        <ul className="flex flex-wrap gap-x-1 gap-y-1">
          {LOCALES.map((locale) => (
            <li key={locale}>
              <Link
                href={pathname}
                locale={locale}
                lang={locale}
                hrefLang={locale}
                aria-current={locale === current ? "true" : undefined}
                onClick={(e) => keepQuery(e, locale)}
                className={cn(
                  "inline-flex min-h-target items-center rounded-md px-3 text-base underline-offset-4 hover:underline",
                  locale === current ? "font-semibold text-forest" : "text-ink",
                )}
              >
                {t(`locales.${locale}`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "inline-flex min-h-target items-center gap-2 rounded-md px-3 text-base font-medium text-ink hover:bg-mist data-[state=open]:bg-mist",
          className,
        )}
        aria-label={`${ta("language")}: ${t(`locales.${current}`)}`}
      >
        <Languages aria-hidden className="size-4.5 text-forest" />
        {/* Compact at xl (long Telugu/Hindi nav labels); full name from 2xl. aria-label names it. */}
        <span lang={current} className="max-2xl:sr-only">
          {t(`locales.${current}`)}
        </span>
        <ChevronDown aria-hidden className="size-4 text-muted" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{ta("language")}</DropdownMenuLabel>
        {LOCALES.map((locale) => (
          <DropdownMenuItem key={locale} asChild>
            <Link
              href={pathname}
              locale={locale}
              lang={locale}
              hrefLang={locale}
              aria-current={locale === current ? "true" : undefined}
              onClick={(e) => keepQuery(e, locale)}
            >
              <span className="flex-1">{t(`locales.${locale}`)}</span>
              {locale === current ? <Check aria-hidden className="size-4 text-forest" /> : null}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
