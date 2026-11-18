import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/components/ui/cn";

/**
 * Proposed wordmark (DESIGN.md: not an approved logo). The mark is a visit route arriving at a home
 * point. Replace with client-approved assets when supplied.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-8", className)} fill="none">
      <rect width="32" height="32" rx="9" className="fill-forest" />
      <path d="M8 22.5c0-6 3.6-11 8-11s8 5 8 11" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="text-paper" />
      <circle cx="16" cy="22.5" r="2.6" className="fill-paper" />
    </svg>
  );
}

export function BrandLogo({ className, tone = "ink" }: { className?: string; tone?: "ink" | "paper" }) {
  const t = useTranslations("common");
  return (
    <Link
      href="/"
      className={cn(
        "inline-flex min-h-target shrink-0 items-center gap-2.5 rounded-md whitespace-nowrap",
        tone === "paper" ? "text-paper" : "text-ink",
        className,
      )}
    >
      <BrandMark />
      <span className="font-display text-xl leading-none font-semibold tracking-[-0.02em]" lang="en">
        {t("brand")}
      </span>
      <span className="sr-only">{t("homeLink")}</span>
    </Link>
  );
}
