import { NextResponse, type NextRequest } from "next/server";
import { doctorSearchHref, finderRedirectPath } from "@/components/public/finder";
import { DEFAULT_LOCALE, isAppLocale } from "@/i18n/routing";

/**
 * No-JavaScript fallback for the landing page forms (GET /{locale}/find):
 * - service finder: ?service=&pin=      -> /{locale}/{service}?pin= (invalid input -> /{locale}?finder=invalid#finder)
 * - doctor search:  ?search=doctors&q=&location= -> /{locale}/doctors?q=&pin=|city=
 * The Location is always a relative path: it never uses the Host header (same rule as /verify/check).
 */
export async function GET(request: NextRequest, { params }: RouteContext<"/[locale]/find">) {
  const { locale: raw } = await params;
  const sp = request.nextUrl.searchParams;
  let location: string;
  if (sp.get("search") === "doctors") {
    const locale = isAppLocale(raw) ? raw : DEFAULT_LOCALE;
    location = `/${locale}${doctorSearchHref({ q: sp.get("q"), location: sp.get("location") })}`;
  } else {
    location = finderRedirectPath(raw, sp.get("pin"), sp.get("service"));
  }
  return new NextResponse(null, { status: 303, headers: { Location: location, "Cache-Control": "no-store" } });
}
