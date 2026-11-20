import { IdentityError } from "@/lib/auth/identity";
import { endpoint, session } from "@/lib/auth/http";
import { requestKey, routeId } from "@/lib/catalog/http";
import { dcxCommand } from "@/lib/doctor-extras/service";
import { RENDERER_VERSION, recordDocumentSchema, renderVisitReport } from "@/lib/doctor-extras/visit-report";

// DC14: renders the PDF of one signed record version for its patient or signer, records the
// render (record version and PDF SHA-256) and streams the bytes. No bucket, no stored file and
// no URL: every download is authorized per request. Fails closed: if the render cannot be
// recorded, no PDF is returned.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    const { db } = await session(request);
    const id = await routeId(context);
    const key = requestKey(request);
    const source = recordDocumentSchema.safeParse(await dcxCommand(db, "get_clinical_report_source", { p_record_id: id }));
    if (!source.success || source.data.record_id !== id) throw new IdentityError(503, "report_unavailable");
    const report = renderVisitReport(source.data);
    await dcxCommand(db, "record_clinical_report", { p_record_id: id, p_renderer_version: RENDERER_VERSION, p_pdf_sha256: report.sha256, p_request_key: key });
    const body = new ArrayBuffer(report.bytes.byteLength);
    new Uint8Array(body).set(report.bytes);
    return new Response(body, { status: 200, headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${report.filename}"`,
      "Cache-Control": "private, no-store",
      Vary: "Authorization",
      "X-Content-Type-Options": "nosniff",
      "X-Report-SHA256": report.sha256,
    } });
  });
}
