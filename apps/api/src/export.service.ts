import { Injectable } from "@nestjs/common";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import sharp from "sharp";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Candidate, ResultCycle } from "@pathey/types";
import { sanitizeFilename } from "./domain.js";
import { ensureHindi } from "@pathey/hindi-text";

const assetPath = (relativePath: string) => {
  const choices = [
    resolve(process.env.INIT_CWD ?? process.cwd(), relativePath),
    resolve(process.cwd(), "../..", relativePath),
  ];
  const found = choices.find(existsSync);
  if (!found) throw new Error(`ASSET_MISSING:${relativePath}`);
  return found;
};
const devanagariFont = assetPath("assets/fonts/NotoSansDevanagari.ttf");
const boldFont = devanagariFont;
const escapeXml = (s: string) =>
  s.replace(
    /[<>&'"]/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        "'": "&apos;",
        '"': "&quot;",
      })[c]!,
  );
const templatePath = () => {
  const choices = [
    process.env.CERTIFICATE_TEMPLATE_PATH,
    join(process.env.INIT_CWD ?? process.cwd(), "certificate-demo.jpeg"),
    join(process.env.INIT_CWD ?? process.cwd(), "assets", "certificate-demo.jpeg"),
    resolve(process.cwd(), "../../certificate-demo.jpeg"),
    resolve(process.cwd(), "../../assets/certificate-demo.jpeg"),
  ].filter(Boolean) as string[];
  const found = choices.find(existsSync);
  if (!found) throw new Error("CERTIFICATE_TEMPLATE_MISSING");
  return found;
};
const collect = (doc: PDFKit.PDFDocument) =>
  new Promise<Buffer>((ok, fail) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => ok(Buffer.concat(chunks)));
    doc.on("error", fail);
    doc.end();
  });

type FitField = {
  centerX: number;
  centerY: number;
  maxWidth: number;
  maxSize: number;
  minSize?: number;
};
/**
 * Draws text centered on a fixed point measured from the printed template's
 * blank/underline, shrinking the font until it fits maxWidth. Centering the
 * (font-size-dependent) text block on a fixed point — rather than anchoring
 * a fixed y at a fixed font size — keeps short and long values sitting on
 * the same printed line instead of drifting as the font shrinks.
 *
 * Deliberately never passes `width` to the final `.text()` call: PDFKit
 * wraps onto a second line whenever `width` is set, even with
 * `lineBreak: false` (an actual PDFKit quirk, not just an unused option).
 * A wrapped second line would spill into the row below on this fixed-layout
 * template, so pathologically long values are left to overflow gracefully
 * on one line at the minimum size instead.
 */
const drawFitted = (
  doc: PDFKit.PDFDocument,
  text: string,
  { centerX, centerY, maxWidth, maxSize, minSize = 8 }: FitField,
) => {
  let size = maxSize;
  doc.fontSize(size);
  while (size > minSize && doc.widthOfString(text) > maxWidth) {
    size -= 0.5;
    doc.fontSize(size);
  }
  const width = doc.widthOfString(text);
  const height = doc.currentLineHeight();
  // "NotoBold" is registered from the same file as the regular weight (this
  // font has no separate bold instance embedded), so fill-only text renders
  // at regular weight regardless of which name is selected. Filling AND
  // stroking the same glyphs is the standard PDF "faux bold" technique —
  // it thickens the strokes to actually look bold.
  doc.text(text, centerX - width / 2, centerY - height / 2, {
    lineBreak: false,
    fill: true,
    stroke: true,
  });
};
// rank is schema-constrained to 1–10 (candidateInputSchema), so a fixed
// lookup is safe — the source result sheets print rank as Roman numerals
// (I–X), and the certificate matches that instead of Arabic numerals.
const ROMAN_NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
const toRomanRank = (rank: number) => ROMAN_NUMERALS[rank - 1] ?? String(rank);
// Field centers were measured directly from assets/certificate-demo.jpeg's
// printed blanks/underlines (in template pixels, converted to the 841.89x595.28pt
// page PDFKit renders it at) so text sits on the pre-printed lines regardless
// of how long or short the value is.
const CERTIFICATE_FIELDS: Record<string, FitField> = {
  // Re-measured against the actual "क्रमांक-____(अंक____)" gaps in the
  // template (the previous centers/widths were tuned for shorter values —
  // "97-1"-style serial numbers are wider than the "1"/"97" they were set
  // up for, and crowded into the neighbouring printed text as a result):
  // "क्रमांक-" ends at x=942px, "(अंक" starts at x=1043px (gap 101px);
  // "(अंक" ends at x=1114px, the closing ")" starts at x=1401px (gap 287px),
  // in the template's 1600x1133px source, scaled to the 841.89x595.28pt page.
  resultNumber: { centerX: 522, centerY: 300, maxWidth: 48, maxSize: 17, minSize: 9 },
  score: { centerX: 662, centerY: 300, maxWidth: 145, maxSize: 17, minSize: 9 },
  // 21pt matches the printed template's own text: measured the ink-height of
  // "में श्री/सुश्री ... पुत्र/पुत्री श्री" directly from certificate-demo.jpeg
  // (~47px at the template's 1600x1133 resolution, ~24.5pt once scaled to the
  // 841.89x595.28pt page) and solved for the Noto Sans Devanagari size that
  // produces the same ink-height for that text. Long values still shrink
  // down to minSize via drawFitted's fit-to-width loop above.
  nameHindi: { centerX: 314, centerY: 328, maxWidth: 166, maxSize: 21, minSize: 10 },
  guardianName: { centerX: 598, centerY: 328, maxWidth: 188, maxSize: 21, minSize: 10 },
  className: { centerX: 272, centerY: 361, maxWidth: 44, maxSize: 18, minSize: 9 },
  age: { centerX: 364, centerY: 361, maxWidth: 24, maxSize: 18, minSize: 9 },
  rank: { centerX: 436, centerY: 361, maxWidth: 53, maxSize: 18, minSize: 9 },
};

@Injectable()
export class ExportService {
  async certificate(cycle: ResultCycle, candidate: Candidate) {
    const resultDate = new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "Asia/Kolkata",
    }).format(new Date());
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 0,
      info: {
        Title: `Certificate ${candidate.certificateNumber}`,
        Author: "Pathey Kan",
        Subject: `Quiz result ${cycle.resultNumber}`,
        Keywords: "certificate, quiz",
      },
    });
    doc.image(templatePath(), 0, 0, { width: 841.89, height: 595.28 });
    doc.registerFont("Noto", devanagariFont);
    doc.registerFont("NotoBold", boldFont);
    doc.font("NotoBold").fillColor("#08214A").strokeColor("#08214A").lineWidth(0.25);
    // Prints the candidate's own serial number (e.g. "97-1") rather than the
    // bare cycle result number — the participantId already embeds the result
    // number as its prefix in the common case, so this reuses the template's
    // one "क्रमांक-" blank instead of needing a second spot on the artwork.
    drawFitted(doc, candidate.participantId || cycle.resultNumber, CERTIFICATE_FIELDS.resultNumber!);
    drawFitted(doc, String(candidate.score), CERTIFICATE_FIELDS.score!);
    drawFitted(doc, ensureHindi(candidate.nameHindi?.trim() || candidate.nameEnglish), CERTIFICATE_FIELDS.nameHindi!);
    drawFitted(doc, ensureHindi(candidate.guardianName), CERTIFICATE_FIELDS.guardianName!);
    drawFitted(doc, ensureHindi(candidate.className), CERTIFICATE_FIELDS.className!);
    drawFitted(doc, String(candidate.age), CERTIFICATE_FIELDS.age!);
    drawFitted(doc, toRomanRank(candidate.rank), CERTIFICATE_FIELDS.rank!);
    doc
      .fontSize(12)
      .fillColor("#08214A")
      .text(resultDate, 554, 500, { width: 90, align: "center" });
    return collect(doc);
  }
  async qr(url: string, format: "svg" | "png", dark = false) {
    return format === "svg"
      ? Buffer.from(
          await QRCode.toString(url, {
            type: "svg",
            errorCorrectionLevel: "H",
            margin: 4,
            color: {
              dark: dark ? "#fdf3e6" : "#092f4f",
              light: dark ? "#092f4f" : "#fdf3e6",
            },
          }),
        )
      : QRCode.toBuffer(url, {
          type: "png",
          errorCorrectionLevel: "H",
          margin: 4,
          width: 2400,
          color: {
            dark: dark ? "#fdf3e6" : "#092f4f",
            light: dark ? "#092f4f" : "#fdf3e6",
          },
        });
  }
  async qrPdf(url: string, dark = false) {
    const qr = await this.qr(url, "png", dark);
    const doc = new PDFDocument({ size: [360, 430], margin: 30 });
    doc
      .image(qr, 45, 30, { width: 270, height: 270 })
      .font("Helvetica-Bold")
      .fontSize(14)
      .fillColor("#092f4f")
      .text("प्रमाण पत्र के लिए स्कैन करें", 30, 320, {
        width: 300,
        align: "center",
      })
      .font("Helvetica")
      .fontSize(11)
      .text("Scan to securely download your certificate", 30, 350, {
        width: 300,
        align: "center",
      });
    return collect(doc);
  }
  private magazineSvg(
    cycle: ResultCycle,
    candidates: Candidate[],
    qrData: string,
  ) {
    const rows = candidates
      .sort((a, b) => a.rank - b.rank)
      .map(
        (c, i) =>
          `<g transform="translate(90 ${540 + i * 116})"><circle cx="35" cy="35" r="31" fill="#f36a21"/><text x="35" y="46" text-anchor="middle" class="rank">${c.rank}</text><text x="95" y="30" class="name">${escapeXml(ensureHindi(c.nameHindi?.trim() || c.nameEnglish))}</text><text x="95" y="68" class="city">${escapeXml(c.city)}</text></g>`,
      )
      .join("");
    return `<svg width="2480" height="3508" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#fff5e7"/><rect x="55" y="55" width="2370" height="3398" rx="20" fill="none" stroke="#22b8b2" stroke-width="7"/><rect x="55" y="55" width="2370" height="235" fill="#0b3e68"/><text x="1240" y="160" text-anchor="middle" class="brand">पाथेय कण</text><text x="1240" y="410" text-anchor="middle" class="title">बाल प्रश्नोत्तरी ${escapeXml(cycle.resultNumber)} के</text><text x="1240" y="485" text-anchor="middle" class="heading">टॉप 10 परिणाम</text>${rows}<rect x="1530" y="620" width="720" height="1040" rx="30" fill="#ffffff" stroke="#f36a21" stroke-width="6"/><image x="1690" y="730" width="400" height="400" href="${qrData}"/><text x="1890" y="1200" text-anchor="middle" class="scan">प्रमाण पत्र डाउनलोड करें</text><text x="1890" y="1250" text-anchor="middle" class="small">Scan to claim your certificate</text><text x="1890" y="1330" text-anchor="middle" class="small">अंतिम तिथि: ${new Date(cycle.expiresAt).toLocaleDateString("hi-IN", { timeZone: "Asia/Kolkata" })}</text><text x="1890" y="1480" text-anchor="middle" class="issue">अंक ${escapeXml(cycle.issueNumber)}</text><path d="M1530 1800h720" stroke="#22b8b2" stroke-width="5"/><text x="1890" y="1930" text-anchor="middle" class="scan">विजेताओं को हार्दिक बधाई</text><text x="1890" y="2010" text-anchor="middle" class="small">Certificate access is private.</text><text x="1890" y="2060" text-anchor="middle" class="small">Use the reference ID and claim code</text><text x="1890" y="2110" text-anchor="middle" class="small">provided separately by the office.</text><style>@font-face{font-family:Noto;src:url('${devanagariFont}')}text{font-family:Noto,Arial,sans-serif;fill:#0b3e68}.brand{font-size:92px;font-weight:700;fill:#fff}.title{font-size:56px}.heading{font-size:76px;font-weight:700;fill:#f36a21}.rank{font-size:39px;font-weight:700;fill:#fff}.name{font-size:46px;font-weight:700}.city{font-size:32px;fill:#456071}.scan{font-size:38px;font-weight:700}.small{font-size:27px}.issue{font-size:34px;fill:#f36a21}</style></svg>`;
  }
  async magazine(
    cycle: ResultCycle,
    candidates: Candidate[],
    format: "png" | "pdf",
    url: string,
  ) {
    const qr = await this.qr(url, "png");
    const svg = this.magazineSvg(
      cycle,
      candidates,
      `data:image/png;base64,${qr.toString("base64")}`,
    );
    if (format === "png")
      return sharp(Buffer.from(svg))
        .png({ quality: 100, compressionLevel: 9 })
        .withMetadata({ density: 300 })
        .toBuffer();
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    const doc = new PDFDocument({
      size: "A4",
      margin: 0,
      info: {
        Title: `Top 10 Results ${cycle.resultNumber}`,
        Author: "Pathey Kan",
      },
    });
    doc.image(png, 0, 0, { width: 595.28, height: 841.89 });
    return collect(doc);
  }
  filename(candidate: Candidate) {
    return `${sanitizeFilename(candidate.nameEnglish)}-${sanitizeFilename(candidate.certificateNumber ?? candidate.id)}.pdf`;
  }
}
