import { createHash } from "node:crypto";
import { z } from "zod";
import { renderPdf, type PdfLine } from "@/lib/pdf/writer";

// DC14: PDF of one signed clinical record version. Input is the document returned by
// clinical_private.record_document / get_clinical_report_source (DC-clinical-core design §1,
// "Interface for DC-extras"). The envelope is typed strictly; the clinician-authored sections
// are rendered as written (keys and values), never summarised or translated.
// Bump RENDERER_VERSION whenever the output bytes for the same record can change.
export const RENDERER_VERSION = "dcx-report-1";

const section = z.record(z.string(), z.unknown());
export const recordDocumentSchema = z.object({
  record_id: z.uuid(),
  booking_id: z.uuid(),
  booking_ref: z.string().min(1).max(64),
  record_version: z.number().int().positive(),
  kind: z.enum(["original", "amendment"]),
  supersedes_record_id: z.uuid().nullable(),
  amendment_reason: z.string().nullable(),
  is_latest: z.boolean(),
  signed_at: z.string().min(1),
  signer: z.object({ name: z.string().nullable() }),
  provider: z.object({ reference: z.string().nullable(), name: z.string().nullable() }),
  patient: z.object({ name: z.string().nullable() }),
  visit: z.object({ start_at: z.string(), end_at: z.string() }),
  content: z.object({
    vitals: section.optional(), examination: section.optional(), assessment: section.optional(),
    allergies: section.optional(), prescription: section.optional(), plan: section.optional(),
  }),
  vital_warnings: z.array(z.string()).default([]),
  content_sha256: z.string().regex(/^[0-9a-f]{64}$/),
});
export type RecordDocument = z.infer<typeof recordDocumentSchema>;

const SECTIONS: [keyof RecordDocument["content"], string][] = [
  ["vitals", "Vital signs"], ["examination", "Examination"], ["assessment", "Assessment"],
  ["allergies", "Allergies"], ["prescription", "Prescription"], ["plan", "Plan and advice"],
];

/** "2026-11-20 15:30 IST" without locale data, so every server renders the same bytes. */
export function formatIst(iso: string) {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  const d = new Date(ms + 330 * 60_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} IST`;
}

const label = (key: string) => key.replace(/_/g, " ").replace(/^./, c => c.toUpperCase());

function scalar(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.length ? value.map(scalar).join(", ") : "none";
  return Object.entries(value as Record<string, unknown>).map(([k, v]) => `${label(k)}: ${scalar(v)}`).join("; ");
}

/** One section's lines: scalars as "Key: value", arrays of objects as one bullet per item. */
export function sectionLines(body: Record<string, unknown>): PdfLine[] {
  const lines: PdfLine[] = [];
  for (const [key, value] of Object.entries(body)) {
    if (Array.isArray(value) && value.some(v => v !== null && typeof v === "object")) {
      lines.push({ text: `${label(key)}:` });
      for (const item of value) lines.push({ text: `  - ${scalar(item)}` });
    } else {
      lines.push({ text: `${label(key)}: ${scalar(value)}` });
    }
  }
  return lines.length ? lines : [{ text: "Not recorded" }];
}

export function reportLines(doc: RecordDocument): PdfLine[] {
  const lines: PdfLine[] = [
    { text: "SureCure Visit - Doctor home visit report", size: 16, bold: true },
    { text: "Not for emergencies. In an emergency call 112.", size: 9, gapBefore: 2 },
    { text: `Visit reference: ${doc.booking_ref}`, gapBefore: 10 },
    { text: `Visit: ${formatIst(doc.visit.start_at)} to ${formatIst(doc.visit.end_at)}` },
    { text: `Patient: ${doc.patient.name ?? "-"}` },
    { text: `Provider: ${doc.provider.name ?? "-"} (${doc.provider.reference ?? "-"})` },
    { text: `Clinician: ${doc.signer.name ?? "-"}` },
    { text: `Record version ${doc.record_version} (${doc.kind}), signed ${formatIst(doc.signed_at)}` },
  ];
  if (doc.kind === "amendment") lines.push({ text: `Amendment reason: ${doc.amendment_reason ?? "-"}` });
  if (!doc.is_latest) lines.push({ text: "A later version of this record exists.", bold: true });
  for (const [key, title] of SECTIONS) {
    const body = doc.content[key];
    if (!body) continue;
    lines.push({ text: title, size: 12, bold: true, gapBefore: 10 });
    lines.push(...sectionLines(body));
  }
  if (doc.vital_warnings.length) {
    lines.push({ text: "Acknowledged vital sign warnings", size: 12, bold: true, gapBefore: 10 });
    lines.push({ text: doc.vital_warnings.join(", ") });
  }
  lines.push({ text: `Record content SHA-256: ${doc.content_sha256}`, size: 8, gapBefore: 14 });
  lines.push({ text: `Renderer ${RENDERER_VERSION}. This report reproduces a signed clinical record held by SureCure Visit.`, size: 8 });
  return lines;
}

export function renderVisitReport(doc: RecordDocument) {
  const bytes = renderPdf({
    title: `Visit report ${doc.booking_ref} v${doc.record_version}`,
    lines: reportLines(doc),
    creationDate: new Date(Date.parse(doc.signed_at) || 0),
    footer: `Visit ${doc.booking_ref} - record v${doc.record_version}`,
  });
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const safeRef = doc.booking_ref.replace(/[^A-Za-z0-9-]/g, "").slice(0, 40) || "visit";
  return { bytes, sha256, filename: `visit-report-${safeRef}-v${doc.record_version}.pdf` };
}
