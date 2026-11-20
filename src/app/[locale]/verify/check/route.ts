import { NextResponse, type NextRequest } from "next/server";
import { proofCheckLocation } from "@/modules/proof-of-visit";

/**
 * Target of the proof-code form. A real HTTP 303 redirect (not a streamed client redirect), so the
 * check works with JavaScript disabled or still loading. Valid -> /verify/<code>; otherwise back to
 * the entry page with an error code. Nothing is looked up here and nothing is logged.
 * The Location is a relative path (ADVERSARIAL_REVIEW D3): it never uses the Host header, so a proxy
 * forwarding another Host cannot turn this into a redirect to that host.
 */
export async function GET(req: NextRequest, { params }: RouteContext<"/[locale]/verify/check">) {
  const { locale } = await params;
  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: proofCheckLocation(locale, req.nextUrl.searchParams.get("code") ?? ""),
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "no-store",
    },
  });
}
