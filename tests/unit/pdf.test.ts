import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { escapePdfString, renderPdf, toWinAnsi, wrap } from "@/lib/pdf/writer";
import { RENDERER_VERSION, formatIst, recordDocumentSchema, renderVisitReport, reportLines } from "@/lib/doctor-extras/visit-report";

const latin1 = (bytes: Uint8Array) => Array.from(bytes, b => String.fromCharCode(b)).join("");
const date = new Date("2026-11-20T10:00:00Z");

/** Parses the trailer, the xref table and every object it points to; throws on any mismatch. */
function parse(bytes: Uint8Array) {
  const s = latin1(bytes);
  expect(s.startsWith("%PDF-1.4\n")).toBe(true);
  expect(s.endsWith("%%EOF\n")).toBe(true);
  const startxref = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(s)?.[1]);
  expect(s.slice(startxref, startxref + 5)).toBe("xref\n");
  const head = /^xref\n0 (\d+)\n/.exec(s.slice(startxref));
  const size = Number(head?.[1]);
  const table = s.slice(startxref + head![0].length).split("\n").slice(0, size);
  expect(table[0]).toBe("0000000000 65535 f ");
  const offsets = table.slice(1).map((row, i) => {
    expect(row).toMatch(/^\d{10} 00000 n $/);
    const offset = Number(row.slice(0, 10));
    expect(s.slice(offset, offset + `${i + 1} 0 obj\n`.length)).toBe(`${i + 1} 0 obj\n`);
    return offset;
  });
  const trailer = s.slice(s.lastIndexOf("trailer\n"));
  expect(trailer).toContain(`/Size ${size}`);
  expect(trailer).toContain("/Root 1 0 R");
  // Every stream's /Length is its exact byte count.
  for (const m of s.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) {
    const start = m.index! + m[0].length;
    expect(s.slice(start + Number(m[1]), start + Number(m[1]) + 10)).toBe("\nendstream");
  }
  const pages = Number(/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/.exec(s)?.[1]);
  return { s, size, offsets, pages };
}

describe("PDF 1.4 writer", () => {
  it("writes a header, a byte-exact xref, a trailer and startxref", () => {
    const { s, size, pages } = parse(renderPdf({ title: "T", lines: [{ text: "Hello" }], creationDate: date }));
    expect(size).toBe(8); // free entry + catalog, pages, 2 fonts, info, page, content
    expect(pages).toBe(1);
    expect(s).toContain("(Hello) Tj");
    expect(s).toContain("/CreationDate (D:20261120100000Z)");
    expect(s).toContain("/BaseFont /Helvetica /Encoding /WinAnsiEncoding");
  });
  it("is deterministic", () => {
    const input = { title: "T", lines: [{ text: "Same" }], creationDate: date };
    expect(Buffer.from(renderPdf(input)).equals(Buffer.from(renderPdf(input)))).toBe(true);
  });
  it("escapes parentheses and backslashes, and replaces non-WinAnsi characters", () => {
    const { s } = parse(renderPdf({ title: "a(b)", lines: [{ text: "x (y) \\ z నమస్తే ₹" }], creationDate: date }));
    expect(s).toContain("(x \\(y\\) \\\\ z ?????? ?) Tj");
    expect(s).toContain("/Title (a\\(b\\))");
    expect(escapePdfString("()\\")).toBe("\\(\\)\\\\");
    expect(toWinAnsi("é\tü")).toBe("\u00e9 \u00fc");
  });
  it("wraps long lines inside the margin and splits overlong words", () => {
    const lines = wrap("word ".repeat(100).trim(), 10);
    expect(lines.length).toBeGreaterThan(1);
    expect(Math.max(...lines.map(l => l.length))).toBeLessThanOrEqual(Math.floor(495 / 5.6));
    expect(wrap("x".repeat(200), 10).every(l => l.length <= 88)).toBe(true);
  });
  it("paginates and numbers every page", () => {
    const { s, pages, offsets } = parse(renderPdf({ title: "T", lines: Array.from({ length: 150 }, (_, i) => ({ text: `Line ${i}` })), creationDate: date, footer: "F" }));
    expect(pages).toBeGreaterThan(2);
    expect(offsets.length).toBe(5 + pages * 2);
    expect(s).toContain(`(F  |  Page ${pages} of ${pages}) Tj`);
  });
});

const doc = recordDocumentSchema.parse({
  record_id: "10000000-0000-4000-8000-000000000001", booking_id: "20000000-0000-4000-8000-000000000002", booking_ref: "SCV/TEST 0001",
  record_version: 1, kind: "original", supersedes_record_id: null, amendment_reason: null, is_latest: false,
  signed_at: "2026-11-20T10:00:00Z", signer: { name: "Synthetic Doctor" }, provider: { reference: "PRV-1", name: "Synthetic Clinic" },
  patient: { name: "Synthetic Patient" }, visit: { start_at: "2026-11-20T09:00:00Z", end_at: "2026-11-20T09:30:00Z" },
  content: {
    vitals: { pulse_bpm: 88, temperature: { value: 38.4, unit: "C" } },
    assessment: { summary: "Fever, cause undetermined", certainty: "undetermined", diagnoses: [] },
    prescription: { status: "prescribed", items: [{ medication_name: "Paracetamol", dose: "500 mg", frequency: "TDS" }] },
  },
  vital_warnings: ["temperature_high"], content_sha256: "b".repeat(64),
});

describe("DC14 visit report", () => {
  it("prints the identity block, every given section as written and the record hash", () => {
    const text = reportLines(doc).map(l => l.text).join("\n");
    expect(text).toContain("Visit reference: SCV/TEST 0001");
    expect(text).toContain("Visit: 2026-11-20 14:30 IST to 2026-11-20 15:00 IST");
    expect(text).toContain("Record version 1 (original), signed 2026-11-20 15:30 IST");
    expect(text).toContain("A later version of this record exists.");
    expect(text).toContain("Temperature: Value: 38.4; Unit: C");
    expect(text).toContain("  - Medication name: Paracetamol; Dose: 500 mg; Frequency: TDS");
    expect(text).toContain("Diagnoses: none");
    expect(text).not.toContain("Examination");
    expect(text).toContain(`Record content SHA-256: ${"b".repeat(64)}`);
    expect(text).toContain(RENDERER_VERSION);
    expect(text).toContain("In an emergency call 112");
  });
  it("renders a parseable, deterministic PDF and returns its SHA-256 and a safe file name", () => {
    const a = renderVisitReport(doc);
    const b = renderVisitReport(doc);
    parse(a.bytes);
    expect(a.sha256).toBe(createHash("sha256").update(a.bytes).digest("hex"));
    expect(a.sha256).toBe(b.sha256);
    expect(a.filename).toBe("visit-report-SCVTEST0001-v1.pdf");
    expect(latin1(a.bytes)).toContain("/CreationDate (D:20261120100000Z)");
  });
  it("an amendment renders different bytes, so it never overwrites the original's hash", () => {
    const amended = renderVisitReport({ ...doc, record_version: 2, kind: "amendment", amendment_reason: "Corrected dose", is_latest: true });
    expect(amended.sha256).not.toBe(renderVisitReport(doc).sha256);
    expect(amended.filename).toBe("visit-report-SCVTEST0001-v2.pdf");
  });
  it("formats IST without locale data", () => {
    expect(formatIst("2026-11-20T18:45:00Z")).toBe("2026-11-21 00:15 IST");
    expect(formatIst("not a date")).toBe("not a date");
  });
  it("rejects a document that is not a signed record", () => {
    expect(recordDocumentSchema.safeParse({ ...doc, content_sha256: "x" }).success).toBe(false);
    expect(recordDocumentSchema.safeParse({ ...doc, kind: "draft" }).success).toBe(false);
  });
});
