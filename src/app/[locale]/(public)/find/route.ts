import { NextResponse, type NextRequest } from "next/server";
import { validateFinder } from "@/components/public/finder";
import { DEFAULT_LOCALE, isAppLocale } from "@/i18n/routing";

/**
 * No-JavaScript fallback for the landing page finder form (GET /{locale}/find?service=&pin=).
 * Validates the shape and redirects to the service directory with ?pin=. Invalid input returns to
 * the finder (browsers already block it client-side via required/pattern).
 */
export async function GET(request: NextRequest, { params }: RouteContext<"/[locale]/find">) {
  const { locale: raw } = await params;
  const locale = isAppLocale(raw) ? raw : DEFAULT_LOCALE;
  const result = validateFinder({
    pin: request.nextUrl.searchParams.get("pin"),
    service: request.nextUrl.searchParams.get("service"),
  });
  const target = result.ok ? `/${locale}${result.href}` : `/${locale}#finder`;
  return NextResponse.redirect(new URL(target, request.nextUrl.origin), 303);
}
