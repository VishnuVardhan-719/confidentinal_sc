import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";

/** Route/section loading placeholder with an announced, localized label. */
export function LoadingSkeleton({ variant = "page", rows = 3 }: { variant?: "page" | "list" | "detail"; rows?: number }) {
  const t = useTranslations("accessibility");
  return (
    <div role="status" aria-live="polite" className="grid gap-6">
      <span className="sr-only">{t("loading")}</span>
      {variant !== "list" ? (
        <div className="grid gap-3">
          <Skeleton className="h-10 w-2/3 max-w-md" />
          <Skeleton className="h-5 w-full max-w-xl" />
        </div>
      ) : null}
      <div className="grid gap-3">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className={variant === "detail" ? "h-6 w-full" : "h-20 w-full"} />
        ))}
      </div>
    </div>
  );
}
