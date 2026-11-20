// Minimal PDF 1.4 writer: A4 pages of left-aligned text in the standard Helvetica fonts
// (WinAnsiEncoding), word wrapping, pagination with a page footer, and a byte-exact xref
// table. No dependency, no images, no compression. Output is deterministic: the same input
// gives the same bytes, so a stored SHA-256 can be checked by rendering again.
// Limitation: only WinAnsi (Latin-1) characters are drawn; anything else becomes "?". Hindi
// and Telugu need an embedded font, which this writer does not do.

export type PdfLine = { text: string; size?: number; bold?: boolean; gapBefore?: number };
export type PdfInput = {
  title: string;
  lines: PdfLine[];
  /** Fixed metadata date (for determinism use the record's signed time). */
  creationDate: Date;
  producer?: string;
  /** Printed at the bottom of every page with "Page i of n". */
  footer?: string;
};

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 50;
const FOOTER_Y = 30;
// Conservative average glyph width for Helvetica (em fraction); keeps wide text inside the margin.
const GLYPH_WIDTH = 0.56;

/** Latin-1 byte string; characters outside WinAnsi's printable range become "?". */
export function toWinAnsi(text: string) {
  let out = "";
  for (const ch of text.normalize("NFC")) {
    const code = ch.codePointAt(0) ?? 63;
    if (code === 9) out += " ";
    else if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)) out += String.fromCharCode(code);
    else out += "?";
  }
  return out;
}

/** PDF literal string body: backslash, parentheses escaped. */
export function escapePdfString(latin1: string) {
  return latin1.replace(/[\\()]/g, m => "\\" + m);
}

/** Splits one line into pieces that fit the text width at the given font size. */
export function wrap(text: string, size: number, width = PAGE_WIDTH - 2 * MARGIN) {
  const max = Math.max(8, Math.floor(width / (size * GLYPH_WIDTH)));
  const words = toWinAnsi(text).split(" ");
  const lines: string[] = [];
  let current = "";
  for (let word of words) {
    while (word.length > max) {
      if (current) { lines.push(current); current = ""; }
      lines.push(word.slice(0, max));
      word = word.slice(max);
    }
    const next = current ? current + " " + word : word;
    if (next.length > max) { lines.push(current); current = word; } else current = next;
  }
  lines.push(current);
  return lines;
}

type Placed = { text: string; size: number; bold: boolean; y: number };

function paginate(lines: PdfLine[]) {
  const pages: Placed[][] = [[]];
  let y = PAGE_HEIGHT - MARGIN;
  for (const line of lines) {
    const size = line.size ?? 10;
    const leading = Math.round(size * 1.35);
    y -= line.gapBefore ?? 0;
    for (const piece of wrap(line.text, size)) {
      if (y - leading < FOOTER_Y + 20) { pages.push([]); y = PAGE_HEIGHT - MARGIN; }
      y -= leading;
      pages[pages.length - 1].push({ text: piece, size, bold: line.bold ?? false, y });
    }
  }
  return pages;
}

function pdfDate(date: Date) {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `D:${p(date.getUTCFullYear(), 4)}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}Z`;
}

function text(x: number, y: number, size: number, bold: boolean, body: string) {
  return `BT /${bold ? "F2" : "F1"} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${escapePdfString(body)}) Tj ET\n`;
}

export function renderPdf(input: PdfInput): Uint8Array {
  const pages = paginate(input.lines);
  const objects: string[] = [];
  // 1 catalog, 2 pages, 3 Helvetica, 4 Helvetica-Bold, 5 info, then (page, content) pairs.
  const pageIds = pages.map((_, i) => 6 + i * 2);
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(`<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`);
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  objects.push(`<< /Title (${escapePdfString(toWinAnsi(input.title))}) /Producer (${escapePdfString(toWinAnsi(input.producer ?? "SureCure Visit"))}) /CreationDate (${pdfDate(input.creationDate)}) >>`);
  pages.forEach((placed, i) => {
    let stream = placed.map(l => text(MARGIN, l.y, l.size, l.bold, l.text)).join("");
    const footer = `${input.footer ? toWinAnsi(input.footer) + "  |  " : ""}Page ${i + 1} of ${pages.length}`;
    stream += text(MARGIN, FOOTER_Y, 8, false, footer.slice(0, 120));
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageIds[i] + 1} 0 R >>`);
    // Length counts the data only; the EOL before endstream is not part of it.
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });

  let out = "%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) out += `${String(offset).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  // Every character is below 256 by construction, so string index equals byte offset.
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i);
  return bytes;
}
