import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { cn } from "@/components/ui/cn";

/** Local tabs between the two account pages; aria-current marks the open one. */
export async function AccountNav({ current }: { current: "security" | "privacy" }) {
  const t = await getTranslations("auth.account");
  const items = [
    { key: "security", href: "/account/security", label: t("navSecurity") },
    { key: "privacy", href: "/account/privacy", label: t("navPrivacy") },
  ] as const;
  return (
    <nav aria-label={t("securityTitle")} className="border-b border-border">
      <ul className="flex gap-1">
        {items.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              aria-current={item.key === current ? "page" : undefined}
              className={cn(
                "-mb-px inline-flex min-h-target items-center border-b-2 border-transparent px-4 text-base font-medium text-muted hover:text-ink",
                "aria-[current=page]:border-forest aria-[current=page]:text-forest",
              )}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
