import assert from "node:assert/strict";
import { File } from "node:buffer";
import test from "node:test";

import {
  calculatePreviewHash,
  createSegment,
  formatBytes,
  formatTime,
  MAX_PREVIEW_HASH_BYTES,
  safeFileStem,
} from "../src/domain/audio.ts";

test("formatTime dakika ve saat sınırlarını doğru biçimlendirir", () => {
  assert.equal(formatTime(0), "00:00");
  assert.equal(formatTime(65), "01:05");
  assert.equal(formatTime(3661), "01:01:01");
});

test("formatTime geçersiz ve negatif değerleri güvenli biçimde ele alır", () => {
  assert.equal(formatTime(-1), "00:00");
  assert.equal(formatTime(Number.NaN), "00:00");
  assert.equal(formatTime(Number.POSITIVE_INFINITY), "00:00");
});

test("formatBytes ikili birimleri ve geçersiz değerleri biçimlendirir", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(1024), "1.0 KB");
  assert.equal(formatBytes(1024 * 1024), "1.0 MB");
  assert.equal(formatBytes(-1), "—");
});

test("safeFileStem Türkçe harfleri korur ve dosya adını güvenli hale getirir", () => {
  assert.equal(safeFileStem("Kayıt No 3.wav"), "Kayıt_No_3");
  assert.equal(safeFileStem("...wav"), "ses_kaydi");
});

test("createSegment başlangıç zamanını sınırlar ve nötr varsayılanlar atar", () => {
  const segment = createSegment(-5);
  assert.equal(segment.startSeconds, 0);
  assert.equal(segment.endSeconds, null);
  assert.equal(segment.text, "");
  assert.equal(segment.speaker, "Konuşmacı 1");
  assert.equal(segment.status, "taslak");
  assert.ok(segment.id.length > 0);
});

test("büyük ses dosyalarında önizleme hash işlemini belleğe almadan atlar", async () => {
  const result = await calculatePreviewHash({
    size: MAX_PREVIEW_HASH_BYTES + 1,
  });
  assert.deepEqual(result, { state: "buyuk-dosya", hash: null });
});

test("küçük dosyanın SHA-256 özeti bilinen değerle eşleşir", async () => {
  const file = new File(["abc"], "ornek.wav", { type: "audio/wav" });
  const result = await calculatePreviewHash(file);
  assert.equal(result.state, "hesaplandi");
  assert.equal(
    result.hash,
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});
