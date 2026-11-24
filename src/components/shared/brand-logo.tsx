import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/components/ui/cn";

/**
 * The owner-supplied SureCureVisit logo (rider, home mark and wordmark, navy and teal). The header version
 * pairs the rider emblem with the wordmark, both cut from the approved artwork; the full lockup with the
 * tagline lives at /brand/logo-full.webp. On the dark footer the logo sits on a paper chip so the navy
 * letters keep their contrast.
 */
export function BrandLogo({
  className,
  tone = "ink",
  href = "/",
}: {
  className?: string;
  tone?: "ink" | "paper";
  /** Locale-less target. Signed-in visitors pass their dashboard so the logo returns them there, not to the landing page. */
  href?: string;
}) {
  const t = useTranslations("common");
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex min-h-target shrink-0 items-center gap-2 rounded-md",
        tone === "paper" && "bg-paper px-3 py-2",
        className,
      )}
    >
      <Image
        src="/brand/emblem.webp"
        alt=""
        aria-hidden="true"
        width={420}
        height={308}
        priority
        unoptimized
        className="h-9 w-auto sm:h-11 xl:h-10"
      />
      <Image
        src="/brand/wordmark.png"
        alt={t("brand")}
        width={640}
        height={101}
        priority
        unoptimized
        className="h-5 w-auto sm:h-7 xl:h-6"
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
      width={800}
      height={800}
      priority={priority}
      unoptimized
      className={cn("h-auto w-full", className)}
    />
  );
}
