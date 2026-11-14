import { formatBytes, formatTime, type TranscriptSegment } from "./audio";
import type { AssignmentRecord } from "./assignment";

export interface TranscriptReportSource {
  fileName: string;
  mediaType: string;
  sizeBytes: number;
  durationSeconds: number | null;
  sha256Preview: string | null;
}

export interface TranscriptReportInput {
  assignment: AssignmentRecord;
  source: TranscriptReportSource;
  segments: TranscriptSegment[];
}

interface ReportLine {
  text: string;
  style?: "Title" | "Subtitle" | "Heading1" | "Heading2";
}

const encoder = new TextEncoder();
const ZIP_LOCAL_HEADER = 0x04034b50;
const ZIP_CENTRAL_HEADER = 0x02014b50;
const ZIP_END = 0x06054b50;

function xmlEscape(value: string): string {
  if (/[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f]/u.test(value)) {
    throw new Error("Belgeye aktarılamayan XML kontrol karakteri bulundu; kaynak metni düzeltin.");
  }
  return value.replace(/[&<>"']/gu, (character) => {
    switch (character) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "\"": return "&quot;";
      case "'": return "&apos;";
      default: return character;
    }
  });
}

function linesForReport(input: TranscriptReportInput): ReportLine[] {
  const { assignment, source } = input;
  const lines: ReportLine[] = [
    { text: "MİHENK 56.12 — SES İNCELEME ÇALIŞMA TASLAĞI", style: "Title" },
    { text: "TASLAK · İMZASIZ · RESMÎ TESLİM DEĞİLDİR", style: "Subtitle" },
    { text: "Bu belge çalışma amaçlı ara çıktıdır. Bilirkişi görüşü, onaylı rapor, delil özgünlüğü tespiti, elektronik imza veya resmî teslim işlemi değildir." },
    { text: "Görev / atama bilgileri", style: "Heading1" },
    { text: "Görev alanı: " + assignment.name },
    { text: "Yerel dosya referansı: " + (assignment.localReference || "Belirtilmedi") },
    { text: "Atama mercii: " + (assignment.authority || "Belirtilmedi") },
    { text: "Görevlendirme tarihi: " + (assignment.appointedAt || "Belirtilmedi") },
    { text: "Rapor için son tarih: " + (assignment.dueAt || "Belirtilmedi") },
    { text: "İnceleme kapsamı", style: "Heading2" },
    { text: assignment.scope || "Henüz girilmedi." },
    { text: "Yanıtlanacak sorular", style: "Heading2" },
  ];

  if (assignment.questions.length === 0) {
    lines.push({ text: "Henüz soru girilmedi." });
  } else {
    assignment.questions.forEach((question, index) => {
      lines.push({ text: (index + 1) + ". " + question });
    });
  }

  lines.push(
    { text: "Kaynak ses bilgileri", style: "Heading1" },
    { text: "Dosya adı: " + source.fileName },
    { text: "Medya türü: " + (source.mediaType || "Bilinmiyor") },
    { text: "Dosya boyutu: " + formatBytes(source.sizeBytes) },
    { text: "Ses süresi: " + formatTime(source.durationSeconds) },
    { text: "SHA-256 ön kontrolü: " + (source.sha256Preview || "Hesaplanmadı") },
    { text: "Hash açıklaması: Bu değer MİHENK ön kontrolüdür; tek başına delil zinciri, köken veya özgünlük kanıtı değildir." },
    { text: "Zaman kodlu transkript bölümleri", style: "Heading1" },
  );

  const segments = [...input.segments].sort((left, right) =>
    left.startSeconds - right.startSeconds || left.id.localeCompare(right.id)
  );
  if (segments.length === 0) {
    lines.push({ text: "Henüz transkript bölümü bulunmuyor." });
  } else {
    segments.forEach((segment, index) => {
      const end = segment.endSeconds === null ? "bitiş belirtilmedi" : formatTime(segment.endSeconds);
      const status = segment.status === "belirsiz"
        ? "BELİRSİZ — uzman dinlemesi gerekli"
        : segment.status === "uzman-onayli"
          ? "KULLANICI TARAFINDAN UZMAN KONTROLÜ İŞARETLENDİ"
          : "TASLAK — kontrol edilmedi";
      lines.push({
        text: (index + 1) + ". [" + formatTime(segment.startSeconds) + " – " + end + "] " + segment.speaker + " · " + status,
        style: "Heading2",
      });
      lines.push({ text: segment.text.trim() || "[Metin girilmedi]" });
    });
  }

  lines.push(
    { text: "Uzman kontrolü ve teslim", style: "Heading1" },
    { text: "Makine tarafından üretilmiş bir metin varsa taslak niteliğindedir. Bu prototipte ses tanıma motoru bağlı değildir; bölümler kullanıcı tarafından elle girilir." },
    { text: "Her bölüm, kaynak ses dinlenerek ve görev soruları gözetilerek uzman tarafından değerlendirilmelidir. Belirsizlikler gizlenmemeli veya otomatik olarak tamamlanmamalıdır." },
    { text: "Bu ara çıktı elektronik olarak imzalanmamıştır. Resmî rapor, UDF/UYAP dosyası veya teslim kaydı olarak kullanılamaz." },
    { text: "Oluşturulma zamanı (UTC): " + new Date().toISOString() },
  );
  return lines;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const totalLength = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeU16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true);
}

function writeU32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true);
}

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

function createStoredZip(entries: ZipEntry[]): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const data = entry.data;
    const checksum = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(local.buffer);
    writeU32(localView, 0, ZIP_LOCAL_HEADER);
    writeU16(localView, 4, 20);
    writeU16(localView, 6, 0x0800);
    writeU16(localView, 8, 0);
    writeU16(localView, 10, 0);
    writeU16(localView, 12, 0x21);
    writeU32(localView, 14, checksum);
    writeU32(localView, 18, data.byteLength);
    writeU32(localView, 22, data.byteLength);
    writeU16(localView, 26, nameBytes.length);
    writeU16(localView, 28, 0);
    local.set(nameBytes, 30);
    localParts.push(local, data);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    writeU32(centralView, 0, ZIP_CENTRAL_HEADER);
    writeU16(centralView, 4, 20);
    writeU16(centralView, 6, 20);
    writeU16(centralView, 8, 0x0800);
    writeU16(centralView, 10, 0);
    writeU16(centralView, 12, 0);
    writeU16(centralView, 14, 0x21);
    writeU32(centralView, 16, checksum);
    writeU32(centralView, 20, data.byteLength);
    writeU32(centralView, 24, data.byteLength);
    writeU16(centralView, 28, nameBytes.length);
    writeU16(centralView, 30, 0);
    writeU16(centralView, 32, 0);
    writeU16(centralView, 34, 0);
    writeU16(centralView, 36, 0);
    writeU32(centralView, 38, 0);
    writeU32(centralView, 42, localOffset);
    central.set(nameBytes, 46);
    centralParts.push(central);

    localOffset += local.byteLength + data.byteLength;
  }

  const centralDirectory = concatBytes(centralParts);
  const localData = concatBytes(localParts);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  writeU32(endView, 0, ZIP_END);
  writeU16(endView, 4, 0);
  writeU16(endView, 6, 0);
  writeU16(endView, 8, entries.length);
  writeU16(endView, 10, entries.length);
  writeU32(endView, 12, centralDirectory.byteLength);
  writeU32(endView, 16, localData.byteLength);
  writeU16(endView, 20, 0);
  return concatBytes([localData, centralDirectory, end]);
}

function xmlParagraph(line: ReportLine): string {
  const style = line.style ? "<w:pPr><w:pStyle w:val=\"" + line.style + "\"/></w:pPr>" : "";
  return "<w:p>" + style + "<w:r><w:t xml:space=\"preserve\">" + xmlEscape(line.text) + "</w:t></w:r></w:p>";
}

function odtParagraph(line: ReportLine): string {
  const style = line.style || "TextBody";
  return "<text:p text:style-name=\"" + style + "\">" + xmlEscape(line.text) + "</text:p>";
}

export function buildDocxReport(input: TranscriptReportInput): Uint8Array {
  const documentXml =
    "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
    "<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\">" +
    "<w:body>" + linesForReport(input).map(xmlParagraph).join("") +
    "<w:sectPr><w:pgSz w:w=\"11906\" w:h=\"16838\"/><w:pgMar w:top=\"1134\" w:right=\"1134\" w:bottom=\"1134\" w:left=\"1134\"/></w:sectPr>" +
    "</w:body></w:document>";
  const stylesXml =
    "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
    "<w:styles xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\">" +
    "<w:style w:type=\"paragraph\" w:default=\"1\" w:styleId=\"Normal\"><w:name w:val=\"Normal\"/></w:style>" +
    "<w:style w:type=\"paragraph\" w:styleId=\"Title\"><w:name w:val=\"Title\"/><w:rPr><w:b/><w:sz w:val=\"32\"/></w:rPr></w:style>" +
    "<w:style w:type=\"paragraph\" w:styleId=\"Subtitle\"><w:name w:val=\"Subtitle\"/><w:rPr><w:b/><w:color w:val=\"A00000\"/></w:rPr></w:style>" +
    "<w:style w:type=\"paragraph\" w:styleId=\"Heading1\"><w:name w:val=\"heading 1\"/><w:rPr><w:b/><w:sz w:val=\"26\"/></w:rPr></w:style>" +
    "<w:style w:type=\"paragraph\" w:styleId=\"Heading2\"><w:name w:val=\"heading 2\"/><w:rPr><w:b/></w:rPr></w:style>" +
    "</w:styles>";
  const entries: ZipEntry[] = [
    { name: "[Content_Types].xml", data: encoder.encode(
      "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
      "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">" +
      "<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>" +
      "<Default Extension=\"xml\" ContentType=\"application/xml\"/>" +
      "<Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/>" +
      "<Override PartName=\"/word/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml\"/>" +
      "</Types>"
    ) },
    { name: "_rels/.rels", data: encoder.encode(
      "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
      "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">" +
      "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/>" +
      "</Relationships>"
    ) },
    { name: "word/document.xml", data: encoder.encode(documentXml) },
    { name: "word/styles.xml", data: encoder.encode(stylesXml) },
    { name: "word/_rels/document.xml.rels", data: encoder.encode(
      "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
      "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">" +
      "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/>" +
      "</Relationships>"
    ) },
  ];
  return createStoredZip(entries);
}

export function buildOdtReport(input: TranscriptReportInput): Uint8Array {
  const body = linesForReport(input).map(odtParagraph).join("");
  const contentXml =
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>" +
    "<office:document-content xmlns:office=\"urn:oasis:names:tc:opendocument:xmlns:office:1.0\" " +
    "xmlns:text=\"urn:oasis:names:tc:opendocument:xmlns:text:1.0\" " +
    "xmlns:style=\"urn:oasis:names:tc:opendocument:xmlns:style:1.0\" " +
    "office:version=\"1.3\"><office:body><office:text>" + body +
    "</office:text></office:body></office:document-content>";
  const stylesXml =
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>" +
    "<office:document-styles xmlns:office=\"urn:oasis:names:tc:opendocument:xmlns:office:1.0\" " +
    "xmlns:style=\"urn:oasis:names:tc:opendocument:xmlns:style:1.0\" " +
    "xmlns:text=\"urn:oasis:names:tc:opendocument:xmlns:text:1.0\" " +
    "xmlns:fo=\"urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0\" office:version=\"1.3\">" +
    "<office:styles>" +
    "<style:default-style style:family=\"paragraph\"><style:paragraph-properties fo:margin-bottom=\"0.12in\"/><style:text-properties fo:font-family=\"Liberation Sans\" fo:font-size=\"10pt\"/></style:default-style>" +
    "<style:style style:name=\"Title\" style:family=\"paragraph\"><style:text-properties fo:font-size=\"18pt\" fo:font-weight=\"bold\"/></style:style>" +
    "<style:style style:name=\"Subtitle\" style:family=\"paragraph\"><style:text-properties fo:font-weight=\"bold\" fo:color=\"#A00000\"/></style:style>" +
    "<style:style style:name=\"Heading1\" style:family=\"paragraph\"><style:text-properties fo:font-size=\"14pt\" fo:font-weight=\"bold\"/></style:style>" +
    "<style:style style:name=\"Heading2\" style:family=\"paragraph\"><style:text-properties fo:font-size=\"11pt\" fo:font-weight=\"bold\"/></style:style>" +
    "<style:style style:name=\"TextBody\" style:family=\"paragraph\"/>" +
    "</office:styles></office:document-styles>";
  const manifestXml =
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>" +
    "<manifest:manifest xmlns:manifest=\"urn:oasis:names:tc:opendocument:xmlns:manifest:1.0\" manifest:version=\"1.3\">" +
    "<manifest:file-entry manifest:full-path=\"/\" manifest:media-type=\"application/vnd.oasis.opendocument.text\"/>" +
    "<manifest:file-entry manifest:full-path=\"content.xml\" manifest:media-type=\"text/xml\"/>" +
    "<manifest:file-entry manifest:full-path=\"styles.xml\" manifest:media-type=\"text/xml\"/>" +
    "</manifest:manifest>";
  return createStoredZip([
    { name: "mimetype", data: encoder.encode("application/vnd.oasis.opendocument.text") },
    { name: "content.xml", data: encoder.encode(contentXml) },
    { name: "styles.xml", data: encoder.encode(stylesXml) },
    { name: "META-INF/manifest.xml", data: encoder.encode(manifestXml) },
  ]);
}
