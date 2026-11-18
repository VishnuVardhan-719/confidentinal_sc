import { NextResponse, type NextRequest } from "next/server";
import { doctorSearchHref, validateFinder } from "@/components/public/finder";
import { DEFAULT_LOCALE, isAppLocale } from "@/i18n/routing";

/**
 * No-JavaScript fallback for the landing page forms (GET /{locale}/find):
 * - service finder: ?service=&pin=      -> /{locale}/{service}?pin=
 * - doctor search:  ?search=doctors&q=&location= -> /{locale}/doctors?q=&pin=|city=
 * Invalid finder input returns to the finder (browsers already block it via required/pattern).
 */
export async function GET(request: NextRequest, { params }: RouteContext<"/[locale]/find">) {
  const { locale: raw } = await params;
  const locale = isAppLocale(raw) ? raw : DEFAULT_LOCALE;
  const sp = request.nextUrl.searchParams;
  let target: string;
  if (sp.get("search") === "doctors") {
    target = `/${locale}${doctorSearchHref({ q: sp.get("q"), location: sp.get("location") })}`;
  } else {
    const result = validateFinder({ pin: sp.get("pin"), service: sp.get("service") });
    target = result.ok ? `/${locale}${result.href}` : `/${locale}#finder`;
  }
  return NextResponse.redirect(new URL(target, request.nextUrl.origin), 303);
}
