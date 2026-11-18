import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { FixtureNotice } from "@/components/shared/fixture-notice";
import { Notice } from "@/components/shared/notice";
import { Link } from "@/i18n/navigation";
import { LOGIN_REASONS, resolvePostAuthRedirect, type LoginReason } from "@/modules/auth/routes";
import { normalizeInternalPath } from "@/modules/auth/redirect";
import { signupRoleSchema } from "@/modules/auth/roles";
import { TERMS_DRAFT_VERSION } from "@/modules/auth/policy";
import { getServerSession, isFixtureAdapter } from "@/modules/auth/server";
import { AuthFlow } from "./auth-flow";
import { AuthFrame, AuthHeading } from "./auth-frame";

type SearchParams = Record<string, string | string[] | undefined>;

const single = (v: string | string[] | undefined): string | undefined => (typeof v === "string" ? v : undefined);

/**
 * Server part of /login and /signup. Reads the request (cookies, search params), so it must be
 * rendered inside <Suspense>. A signed-in visitor is sent on to a safe internal destination.
 */
export async function AuthPageContent({ mode, searchParams }: { mode: "login" | "signup"; searchParams: Promise<SearchParams> }) {
  const [sp, locale, t] = await Promise.all([searchParams, getLocale(), getTranslations("auth")]);
  // Only an internal path survives; anything else is dropped before it reaches a form field.
  const next = normalizeInternalPath(single(sp.next));
  const rawReason = single(sp.reason);
  const reason = (LOGIN_REASONS as readonly string[]).includes(rawReason ?? "") ? (rawReason as LoginReason) : null;
  const role = signupRoleSchema.safeParse(single(sp.role));

  const { session } = await getServerSession();
  if (session.ok && session.data.kind === "authenticated") {
    redirect(resolvePostAuthRedirect(session.data.identity, next, locale));
  }

  const fixture = isFixtureAdapter();
  const title = mode === "login" ? t("login.title") : t("signup.title");
  const lead = mode === "login" ? t("login.lead") : t("signup.lead");

  return (
    <AuthFrame
      aside={
        <>
          {fixture ? <FixtureNotice /> : null}
          {mode === "signup" ? (
            <Notice tone="info" title={t("signup.privacyTitle")}>
              {t("signup.privacyBody")}
            </Notice>
          ) : null}
        </>
      }
    >
      <AuthHeading title={title} lead={lead} />
      {reason === "signed_out" ? (
        <Notice tone="info" role="status" title={t("notices.signedOut")} />
      ) : reason === "session_expired" ? (
        <Notice tone="warning" role="status" title={t("notices.sessionExpired")} />
      ) : null}
      <AuthFlow
        mode={mode}
        locale={locale}
        next={next}
        initialRole={role.success ? role.data : null}
        termsVersion={TERMS_DRAFT_VERSION}
        termsHref="/terms"
        privacyHref="/privacy"
      />
      <p className="text-base text-muted">
        {mode === "login" ? t("login.noAccount") : t("signup.haveAccount")}{" "}
        <Link
          href={mode === "login" ? { pathname: "/signup", query: next ? { next } : {} } : { pathname: "/login", query: next ? { next } : {} }}
          className="font-semibold text-forest underline underline-offset-4"
        >
          {mode === "login" ? t("login.createAccount") : t("signup.signIn")}
        </Link>
      </p>
    </AuthFrame>
  );
}
