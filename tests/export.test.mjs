import assert from "node:assert/strict";
import { File } from "node:buffer";
import test from "node:test";

import { buildTranscriptExport, buildTranscriptText } from "../src/domain/export.ts";
import { createAssignmentRecord } from "../src/domain/assignment.ts";

function sampleRecord() {
  return {
    id: "synthetic-record",
    file: new File(["synthetic audio"], "ornek-kayit.wav", { type: "audio/wav" }),
    objectUrl: "blob:synthetic",
    durationSeconds: 12.5,
    sha256: "abc123",
    hashState: "hesaplandi",
    segments: [
      {
        id: "segment-1",
        startSeconds: 1.25,
        endSeconds: 4.5,
        text: "Örnek ifade",
        speaker: "Konuşmacı 1",
        status: "belirsiz",
      },
      {
        id: "segment-2",
        startSeconds: 7,
        endSeconds: null,
        text: "",
        speaker: "Konuşmacı 2",
        status: "taslak",
      },
    ],
  };
}

test("JSON dışa aktarma kaynak metaverisini ve segmentleri taslak olarak işaretler", () => {
  const payload = buildTranscriptExport(sampleRecord());
  assert.equal(payload.schemaVersion, "0.2");
  assert.equal(payload.prototype, true);
  assert.equal(payload.source.fileName, "ornek-kayit.wav");
  assert.equal(payload.source.mediaType, "audio/wav");
  assert.equal(payload.source.durationSeconds, 12.5);
  assert.equal(payload.source.sha256Preview, "abc123");
  assert.equal(payload.segments.length, 2);
  assert.match(payload.notice, /taslağıdır/);
  assert.ok(Number.isFinite(Date.parse(payload.exportedAt)));
});

test("TXT çıktısı zaman kodlarını, nötr konuşmacı etiketlerini ve belirsizliği gösterir", () => {
  const text = buildTranscriptText(sampleRecord());
  assert.match(text, /MİHENK 56\.12/);
  assert.match(text, /ornek-kayit\.wav/);
  assert.match(text, /\[00:01 – 00:04\] Konuşmacı 1 \[BELİRSİZ\]: Örnek ifade/);
  assert.match(text, /\[00:07\] Konuşmacı 2 \[TASLAK\]: \[Metin girilmedi\]/);
  assert.match(text, /Nihai bilirkişi transkripti/);
});

test("TXT ve JSON çıktıları şifreli görev profilini ve kayıtlı kaynak metaverisini taşır", () => {
  const record = sampleRecord();
  record.file = new File([], "restored-placeholder.wav", { type: "audio/wav" });
  record.vaultMetadata = {
    fileId: "a".repeat(32),
    assignmentId: "b".repeat(32),
    fileName: "asıl-kayit.wav",
    mediaType: "audio/wav",
    sizeBytes: 900000,
    lastModified: 0,
    chunkSize: 1048576,
    chunkCount: 1,
    noncePrefix: Array(8).fill(0),
    durationSeconds: 12.5,
    sha256Preview: "persisted-hash",
    segments: record.segments,
    formatVersion: 1,
  };
  const assignment = {
    ...createAssignmentRecord("Görev 56.12", "2026-11-14T00:00:00.000Z", "c".repeat(32)),
    localReference: "Yerel-01",
    authority: "Örnek Mahkemesi",
    appointedAt: "2026-11-01",
    dueAt: "2026-12-01",
    scope: "Kayıt içeriği incelenecek.",
    questions: ["Tarih nedir?"],
  };

  const payload = buildTranscriptExport(record, assignment);
  assert.equal(payload.source.fileName, "asıl-kayit.wav");
  assert.equal(payload.source.sizeBytes, 900000);
  assert.equal(payload.source.sha256Preview, "persisted-hash");
  assert.equal(payload.assignment?.authority, "Örnek Mahkemesi");
  assert.deepEqual(payload.assignment?.questions, ["Tarih nedir?"]);

  const text = buildTranscriptText(record, assignment);
  assert.match(text, /Görev 56\.12/);
  assert.match(text, /Yerel-01/);
  assert.match(text, /Örnek Mahkemesi/);
  assert.match(text, /Tarih nedir/);
  assert.match(text, /asıl-kayit\.wav/);
  assert.match(text, /879 KB/);
  assert.match(text, /Hash notu/);
});
