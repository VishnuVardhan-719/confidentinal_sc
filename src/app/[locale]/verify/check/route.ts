import { NextResponse, type NextRequest } from "next/server";
import { normalizeProofCode } from "@/modules/proof-of-visit";

const LOCALES = new Set(["en", "te", "hi"]);

/**
 * Target of the proof-code form. A real HTTP 303 redirect (not a streamed client redirect), so the
 * check works with JavaScript disabled or still loading. Valid -> /verify/<code>; otherwise back to
 * the entry page with an error code. Nothing is looked up here and nothing is logged.
 */
export async function GET(req: NextRequest, { params }: RouteContext<"/[locale]/verify/check">) {
  const { locale: raw } = await params;
  const locale = LOCALES.has(raw) ? raw : "en";
  const typed = req.nextUrl.searchParams.get("code") ?? "";
  const code = normalizeProofCode(typed);
  const to = new URL(code ? `/${locale}/verify/${code}` : `/${locale}/verify`, req.nextUrl.origin);
  if (!code) {
    to.searchParams.set("error", typed.trim() === "" ? "required" : "invalid");
    if (typed.trim() !== "") to.searchParams.set("code", typed.slice(0, 80));
  }
  return NextResponse.redirect(to, { status: 303, headers: { "Referrer-Policy": "no-referrer", "Cache-Control": "no-store" } });
}
