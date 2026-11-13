import assert from "node:assert/strict";
import { File } from "node:buffer";
import test from "node:test";

import { buildTranscriptExport, buildTranscriptText } from "../src/domain/export.ts";

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
  assert.equal(payload.schemaVersion, "0.1");
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
  assert.match(text, /\[00:07\] Konuşmacı 2: \[Metin girilmedi\]/);
  assert.match(text, /Nihai bilirkişi transkripti/);
});
