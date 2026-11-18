import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

/**
 * Continuation control for cursor-paginated lists. Plain links (no JS needed): "Show more" carries the
 * server-issued nextCursor plus the current filters; "Back to the first page" drops the cursor.
 */
export function CursorPager({
  pathname,
  query = {},
  nextCursor,
  cursor,
}: {
  pathname: string;
  query?: Record<string, string | undefined>;
  nextCursor: string | null;
  cursor?: string;
}) {
  const t = useTranslations("common.pagination");
  if (!nextCursor && !cursor) return null;
  const base = Object.fromEntries(Object.entries(query).filter((e): e is [string, string] => typeof e[1] === "string" && e[1] !== ""));
  const linkClass = "inline-flex min-h-target items-center rounded-md border border-forest bg-surface px-5 text-base text-forest hover:bg-mist";
  return (
    <nav aria-label={t("label")} className="flex flex-wrap gap-3">
      {cursor ? (
        <Link href={{ pathname, query: base }} className={linkClass}>
          {t("first")}
        </Link>
      ) : null}
      {nextCursor ? (
        <Link href={{ pathname, query: { ...base, cursor: nextCursor } }} className={linkClass}>
          {t("next")}
        </Link>
      ) : null}
    </nav>
  );
}
