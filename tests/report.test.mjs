import assert from "node:assert/strict";
import test from "node:test";

import { createAssignmentRecord } from "../src/domain/assignment.ts";
import { buildDocxReport, buildOdtReport, buildReportQualityChecklist, crc32 } from "../src/domain/report.ts";

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
    segments: [{ ...input.segments[0], text: "geçersiz" + String.fromCharCode(1) + "metin" }],
  };
  assert.throws(() => buildDocxReport(invalid), /XML kontrol karakteri/);
  assert.throws(() => buildOdtReport(invalid), /XML kontrol karakteri/);
});


test("DOCX raporu her sorunun uzman yanıtını ve bağlı kaynak segmentini içerir", () => {
  const answered = {
    ...input,
    questionAnswers: [
      {
        question: "Konuşmada geçen tarih nedir?",
        answer: "Transkript taslağındaki ifade 14 Mayıs olarak duyulmaktadır; uzman dinlemesiyle kontrol edilmelidir.",
        supportingSegmentRefs: ["record-1:1"],
        updatedAt: "2026-11-14T19:00:00.000Z",
      },
      {
        question: "İfade anlaşılır mı?",
        answer: "İlgili bölüm kısmen anlaşılmaktadır.",
        supportingSegmentRefs: ["record-1:2"],
        updatedAt: "2026-11-14T19:00:00.000Z",
      },
    ],
    supportingSegments: [
      {
        ref: "record-1:1",
        fileName: "kayit-01.wav",
        startSeconds: 4,
        endSeconds: 8,
        text: "14 Mayıs günü",
        speaker: "Konuşmacı 1",
        status: "uzman-onayli",
      },
      {
        ref: "record-1:2",
        fileName: "kayit-01.wav",
        startSeconds: 14,
        endSeconds: 18,
        text: "anlaşılmaz bölüm",
        speaker: "Konuşmacı 2",
        status: "belirsiz",
      },
    ],
  };
  const entries = readLocalZipEntries(buildDocxReport(answered));
  const document = new TextDecoder().decode(entries.find((entry) => entry.name === "word/document.xml").data);
  assert.match(document, /Uzman yanıtı: Transkript taslağındaki ifade 14 Mayıs/);
  assert.match(document, /Dayanak: kayit-01\.wav \[00:04 – 00:08\]/);
  assert.match(document, /14 Mayıs günü/);
  assert.match(document, /Yanıt-dayanak bağlantıları/);
  assert.match(document, /Teslim öncesi insan onayı/);
});

test("rapor kalite kontrolü yanıtsız soru, eksik dayanak ve taslak segmenti görünür kılar", () => {
  const checks = buildReportQualityChecklist({
    ...input,
    questionAnswers: [{
      question: "Konuşmada geçen tarih nedir?",
      answer: "",
      supportingSegmentRefs: ["missing-record:missing-segment"],
      updatedAt: "",
    }],
    supportingSegments: [],
  });
  const byId = new Map(checks.map((item) => [item.id, item]));
  assert.equal(byId.get("question-answers").passed, false);
  assert.match(byId.get("question-answers").detail, /Konuşmada geçen tarih/);
  assert.equal(byId.get("evidence-links").passed, false);
  assert.equal(byId.get("expert-review").passed, false);
  assert.equal(byId.get("final-review").passed, false);
});

test("rapor kalite kontrolünde dayanak bağlantıları yalnızca verilen görev malzemelerinde çözülür", () => {
  const checklist = buildReportQualityChecklist({
    ...input,
    questionAnswers: [{
      question: "Konuşmada geçen tarih nedir?",
      answer: "Yanıt",
      supportingSegmentRefs: ["other-assignment:segment-1"],
      updatedAt: "",
    }],
    supportingSegments: [{
      ref: "current-assignment:segment-1",
      fileName: "kayit-01.wav",
      startSeconds: 0,
      endSeconds: 1,
      text: "başka görev segmenti",
      speaker: "",
      status: "uzman-onayli",
    }],
  });
  assert.equal(checklist.find((item) => item.id === "evidence-links").passed, false);
});
