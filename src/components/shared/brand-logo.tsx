import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/components/ui/cn";

/**
 * The owner-supplied SureCureVisit wordmark (navy and teal, transparent background), cut from the
 * approved logo artwork. The full lockup with the rider lives at /brand/logo-full.webp.
 * On the dark footer the wordmark sits on a paper chip so the navy letters keep their contrast.
 */
export function BrandLogo({ className, tone = "ink" }: { className?: string; tone?: "ink" | "paper" }) {
  const t = useTranslations("common");
  return (
    <Link
      href="/"
      className={cn(
        "inline-flex min-h-target shrink-0 items-center rounded-md",
        tone === "paper" && "bg-paper px-3 py-2",
        className,
      )}
    >
      <Image
        src="/brand/wordmark.png"
        alt={t("brand")}
        width={440}
        height={71}
        priority
        unoptimized
        className="h-7 w-auto sm:h-8"
      />
      <span className="sr-only">{t("homeLink")}</span>
    </Link>
  );
}

/** Full logo lockup (rider, home mark, wordmark and tagline) for large, light surfaces. */
export function BrandLockup({ className, priority = false }: { className?: string; priority?: boolean }) {
  const t = useTranslations("common");
  return (
    <Image
      src="/brand/logo-full.webp"
      alt={t("brand")}
      width={640}
      height={641}
      priority={priority}
      unoptimized
      className={cn("h-auto w-full", className)}
    />
  );
}
