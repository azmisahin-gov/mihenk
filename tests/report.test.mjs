import assert from "node:assert/strict";
import test from "node:test";

import { createAssignmentRecord } from "../src/domain/assignment.ts";
import { buildDocxReport, buildOdtReport, crc32 } from "../src/domain/report.ts";

function readLocalZipEntries(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const entries = [];
  let offset = 0;
  while (offset + 30 <= bytes.byteLength && view.getUint32(offset, true) === 0x04034b50) {
    const method = view.getUint16(offset + 8, true);
    const checksum = view.getUint32(offset + 14, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const uncompressedSize = view.getUint32(offset + 22, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = decoder.decode(bytes.slice(nameStart, nameStart + nameLength));
    const data = bytes.slice(dataStart, dataStart + compressedSize);
    entries.push({ name, method, checksum, uncompressedSize, data });
    offset = dataStart + compressedSize;
  }
  return entries;
}

const assignment = {
  ...createAssignmentRecord("Ses İncelemesi", "2026-11-14T00:00:00.000Z", "a".repeat(32)),
  localReference: "Yerel-56-12",
  authority: "Örnek Mahkemesi",
  appointedAt: "2026-11-01",
  dueAt: "2026-12-01",
  scope: "Bir ses kaydının konuşma içeriğinin incelenmesi.",
  questions: ["Konuşmada geçen tarih nedir?", "İfade anlaşılır mı?"],
};
const input = {
  assignment,
  source: {
    fileName: "kayit-01.wav",
    mediaType: "audio/wav",
    sizeBytes: 2048,
    durationSeconds: 125,
    sha256Preview: "a".repeat(64),
  },
  segments: [
    { id: "2", startSeconds: 14, endSeconds: 18, speaker: "Konuşmacı 2", text: "İkinci & bölüm", status: "belirsiz" },
    { id: "1", startSeconds: 4, endSeconds: null, speaker: "Konuşmacı 1", text: "İlk <bölüm> metni", status: "taslak" },
  ],
};

test("DOCX dosyası geçerli ZIP yerel kayıtlarını ve zorunlu Office parçalarını içerir", () => {
  const bytes = buildDocxReport(input);
  const entries = readLocalZipEntries(bytes);
  const names = entries.map((entry) => entry.name);
  assert.ok(bytes.length > 1000);
  assert.ok(names.includes("[Content_Types].xml"));
  assert.ok(names.includes("_rels/.rels"));
  assert.ok(names.includes("word/document.xml"));
  assert.ok(names.includes("word/styles.xml"));
  for (const entry of entries) {
    assert.equal(entry.method, 0);
    assert.equal(entry.uncompressedSize, entry.data.length);
    assert.equal(entry.checksum, crc32(entry.data));
  }
});

test("DOCX çalışma taslağı görev, kaynak, zaman kodu ve belirsizlik bilgilerini kaçırmaz", () => {
  const entries = readLocalZipEntries(buildDocxReport(input));
  const document = new TextDecoder().decode(entries.find((entry) => entry.name === "word/document.xml").data);
  assert.match(document, /Ses İncelemesi/);
  assert.match(document, /Örnek Mahkemesi/);
  assert.match(document, /Konuşmada geçen tarih nedir/);
  assert.match(document, /kayit-01\.wav/);
  assert.match(document, /00:04/);
  assert.match(document, /00:14/);
  assert.match(document, /BELİRSİZ/);
  assert.match(document, /İMZASIZ/);
  assert.match(document, /resmî teslim işlemi değildir/);
  assert.match(document, /İlk &lt;bölüm&gt; metni/);
  assert.match(document, /İkinci &amp; bölüm/);
});

test("ODT mimetype ZIP içinde ilk ve sıkıştırılmamış girdidir", () => {
  const entries = readLocalZipEntries(buildOdtReport(input));
  assert.equal(entries[0].name, "mimetype");
  assert.equal(entries[0].method, 0);
  assert.equal(new TextDecoder().decode(entries[0].data), "application/vnd.oasis.opendocument.text");
  assert.ok(entries.some((entry) => entry.name === "content.xml"));
  assert.ok(entries.some((entry) => entry.name === "styles.xml"));
  assert.ok(entries.some((entry) => entry.name === "META-INF/manifest.xml"));
});

test("ODT XML'i metni kaçışlar ve taslak uyarısını içerir", () => {
  const entries = readLocalZipEntries(buildOdtReport(input));
  const content = new TextDecoder().decode(entries.find((entry) => entry.name === "content.xml").data);
  assert.match(content, /Ses İncelemesi/);
  assert.match(content, /İlk &lt;bölüm&gt; metni/);
  assert.match(content, /İkinci &amp; bölüm/);
  assert.match(content, /İMZASIZ/);
  assert.match(content, /resmî teslim işlemi değildir/);
  assert.ok(content.indexOf("00:04") < content.indexOf("00:14"), "Bölümler başlangıç zamanına göre sıralanmalıdır.");
});

test("DOCX ve ODT XML için geçersiz kontrol karakteri sessizce bozulmak yerine reddedilir", () => {
  const invalid = {
    ...input,
    segments: [{ ...input.segments[0], text: "geçersiz\\u0001metin" }],
  };
  assert.throws(() => buildDocxReport(invalid), /XML kontrol karakteri/);
  assert.throws(() => buildOdtReport(invalid), /XML kontrol karakteri/);
});
