import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { File } from "node:buffer";
import test from "node:test";

import {
  calculatePreviewHash,
  createSegment,
  formatBytes,
  formatTime,
  repeatStartIfReached,
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

test("tam SHA-256 sınırı eski 128 MiB sınırının üzerindedir", () => {
  assert.equal(MAX_PREVIEW_HASH_BYTES, 240 * 1024 * 1024);
  assert.ok(MAX_PREVIEW_HASH_BYTES > 128 * 1024 * 1024);
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

test("3 MiB dosyanın SHA-256 özeti 1 MiB parçalarla hesaplanır", async () => {
  const contents = Buffer.alloc(3 * 1024 * 1024 + 123, 0x61);
  const file = new File([contents], "buyuk-ornek.wav", { type: "audio/wav" });
  const originalSlice = file.slice.bind(file);
  let largestSlice = 0;

  Object.defineProperty(file, "arrayBuffer", {
    value: () => { throw new Error("Dosyanın tamamı okunmamalı."); },
  });
  Object.defineProperty(file, "slice", {
    value: (start, end, contentType) => {
      largestSlice = Math.max(largestSlice, end - start);
      return originalSlice(start, end, contentType);
    },
  });

  const result = await calculatePreviewHash(file);
  assert.equal(result.state, "hesaplandi");
  assert.equal(result.hash, createHash("sha256").update(contents).digest("hex"));
  assert.equal(largestSlice, 1024 * 1024);
});

test("işaretli ses aralığı bitince yalnızca geçerli başlangıca döner", () => {
  assert.equal(repeatStartIfReached(4.9, 1.25, 5), null);
  assert.equal(repeatStartIfReached(5, 1.25, 5), 1.25);
  assert.equal(repeatStartIfReached(5.2, 1.25, 5), 1.25);
});

test("geçersiz veya ters ses aralığı tekrar döngüsüne alınmaz", () => {
  assert.equal(repeatStartIfReached(6, 5, 5), null);
  assert.equal(repeatStartIfReached(6, 6, 5), null);
  assert.equal(repeatStartIfReached(6, -1, 5), null);
  assert.equal(repeatStartIfReached(Number.NaN, 1, 5), null);
});
