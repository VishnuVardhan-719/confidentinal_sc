import { LayoutDashboard } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { landingPathFor } from "@/modules/auth/routes";
import { getServerSession } from "@/modules/auth/server";
import { withoutLocale } from "./paths";
import { SignOutButton } from "./sign-out-button";

/**
 * Session-aware header actions for the public header (USER-REQ-1 A). Signed out: Sign in and
 * Create account. Signed in: a link to the right dashboard (or workspace chooser) and Sign out.
 * Reads cookies, so place it inside <Suspense> with <SessionLinksFallback/>.
 */
export async function SessionLinks() {
  const [locale, t, { session }] = await Promise.all([getLocale(), getTranslations("auth.session"), getServerSession()]);
  if (session.ok && session.data.kind === "authenticated") {
    return (
      <div className="flex items-center gap-2">
        <Button asChild variant="secondary" className="hidden sm:inline-flex">
          <Link href={withoutLocale(landingPathFor(session.data.identity, locale))}>
            <LayoutDashboard aria-hidden />
            {t("myWorkspace")}
          </Link>
        </Button>
        <SignOutButton locale={locale} label={t("signOut")} variant="quiet" />
      </div>
    );
  }
  if (session.ok && session.data.kind === "restricted") {
    return <SignOutButton locale={locale} label={t("signOut")} variant="quiet" />;
  }
  return <SessionLinksFallback signIn={t("signIn")} signUp={t("signUp")} />;
}

/** Static signed-out actions; also the Suspense fallback (no flash of private links). */
export function SessionLinksFallback({ signIn, signUp }: { signIn: string; signUp: string }) {
  return (
    <div className="flex items-center gap-2">
      <Button asChild variant="quiet">
        <Link href="/login">{signIn}</Link>
      </Button>
      <Button asChild>
        <Link href="/signup">{signUp}</Link>
      </Button>
    </div>
  );
}
