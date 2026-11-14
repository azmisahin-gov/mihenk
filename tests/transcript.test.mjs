import assert from "node:assert/strict";
import test from "node:test";

import {
  mergeAsrTranscriptSegments,
  recordTranscriptEdit,
} from "../src/domain/transcript.ts";

function segment(overrides = {}) {
  return {
    id: "segment-1",
    startSeconds: 1.25,
    endSeconds: 2.5,
    text: "yarın saat üç",
    speaker: "Kanal 1",
    status: "taslak",
    source: "asr",
    ...overrides,
  };
}

test("uzman düzeltmesi ham ASR metnini değiştirmeden önce/sonra kaydı oluşturur", () => {
  const machine = segment();
  const edited = recordTranscriptEdit(
    machine,
    { ...machine, text: "Yarın saat üç." },
    { changedAt: "2026-11-14T19:00:00.000Z" },
  );

  assert.equal(edited.source, "asr");
  assert.equal(edited.rawAsrText, "yarın saat üç");
  assert.equal(edited.text, "Yarın saat üç.");
  assert.equal(edited.revisions.length, 1);
  assert.equal(edited.revisions[0].editorId, null);
  assert.equal(edited.revisions[0].before.text, "yarın saat üç");
  assert.equal(edited.revisions[0].after.text, "Yarın saat üç.");
  assert.equal(edited.revisions[0].reason, "Metin düzeltmesi");
});

test("aynı yazma oturumundaki ardışık tuşlar tek revizyon olayı altında birleştirilir", () => {
  const machine = segment();
  const first = recordTranscriptEdit(
    machine,
    { ...machine, text: "Y" },
    { changedAt: "2026-11-14T19:00:00.000Z", editorId: "local-expert-1" },
  );
  const second = recordTranscriptEdit(
    first,
    { ...first, text: "Yarın" },
    { changedAt: "2026-11-14T19:00:00.500Z", editorId: "local-expert-1" },
  );

  assert.equal(second.revisions.length, 1);
  assert.equal(second.revisions[0].before.text, "yarın saat üç");
  assert.equal(second.revisions[0].after.text, "Yarın");
  assert.equal(second.revisions[0].editorId, "local-expert-1");
});

test("konuşmacı, zaman aralığı ve inceleme durumu değişiklikleri geçmişe kaydedilir", () => {
  const machine = segment();
  const edited = recordTranscriptEdit(
    machine,
    {
      ...machine,
      speaker: "Kanal 2",
      endSeconds: 3.25,
      status: "uzman-onayli",
    },
    { changedAt: "2026-11-14T19:00:00.000Z" },
  );

  assert.equal(edited.revisions.length, 1);
  assert.match(edited.revisions[0].reason, /konuşmacı/);
  assert.match(edited.revisions[0].reason, /Zaman aralığı/);
  assert.match(edited.revisions[0].reason, /Kontrol durumu/);
  assert.deepEqual(edited.revisions[0].before, {
    startSeconds: 1.25,
    endSeconds: 2.5,
    text: "yarın saat üç",
    speaker: "Kanal 1",
    status: "taslak",
  });
  assert.equal(edited.revisions[0].after.endSeconds, 3.25);
});

test("ASR tekrar koşusu uzman tarafından düzenlenen makine bölümlerini ve elle yazılanları korur", () => {
  const untouchedMachine = segment({ id: "machine-old", startSeconds: 1, text: "ham" });
  const manuallyCreated = segment({ id: "expert-manual", source: "uzman", startSeconds: 2, text: "elle" });
  const editedMachine = recordTranscriptEdit(
    segment({ id: "machine-reviewed", startSeconds: 3 }),
    segment({ id: "machine-reviewed", startSeconds: 3, text: "uzmanın düzelttiği" }),
    { changedAt: "2026-11-14T19:00:00.000Z" },
  );
  const replacement = segment({ id: "machine-new", startSeconds: 4, text: "yeni ham çıktı" });

  const merged = mergeAsrTranscriptSegments(
    [untouchedMachine, manuallyCreated, editedMachine],
    [replacement],
  );

  assert.deepEqual(merged.map((item) => item.id), ["expert-manual", "machine-reviewed", "machine-new"]);
  assert.equal(merged.find((item) => item.id === "machine-reviewed").rawAsrText, "yarın saat üç");
  assert.equal(merged.find((item) => item.id === "machine-reviewed").text, "uzmanın düzelttiği");
  assert.equal(merged.find((item) => item.id === "machine-new").rawAsrText, "yeni ham çıktı");
});

test("değişmeyen segment için gereksiz revizyon oluşturulmaz", () => {
  const machine = segment();
  const unchanged = recordTranscriptEdit(
    machine,
    { ...machine },
    { changedAt: "2026-11-14T19:00:00.000Z" },
  );

  assert.equal(unchanged.revisions.length, 0);
  assert.equal(unchanged.rawAsrText, "yarın saat üç");
});
