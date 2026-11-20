import { NextResponse, type NextRequest } from "next/server";
import { finderRedirectPath } from "@/components/public/finder";

/**
 * No-JavaScript fallback for the landing page finder form (GET /{locale}/find?service=&pin=).
 * Validates the shape and redirects (303) to the service directory with ?pin=. Input it cannot use
 * goes back to the finder with ?finder=invalid, which the finder explains once hydrated.
 * The Location is a relative path: it never uses the Host header (same rule as /verify/check).
 */
export async function GET(request: NextRequest, { params }: RouteContext<"/[locale]/find">) {
  const { locale } = await params;
  const location = finderRedirectPath(locale, request.nextUrl.searchParams.get("pin"), request.nextUrl.searchParams.get("service"));
  return new NextResponse(null, { status: 303, headers: { Location: location, "Cache-Control": "no-store" } });
}
