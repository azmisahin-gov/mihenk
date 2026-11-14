import assert from "node:assert/strict";
import test from "node:test";

import {
  FILE_STREAM_CHUNK_BYTES,
  readFileChunks,
} from "../src/domain/file-chunks.ts";

test("128 MiB üzerindeki sanal dosya da sabit 1 MiB parçalarla okunur", async () => {
  const size = 128 * 1024 * 1024 + 123;
  let largestSlice = 0;
  let processed = 0;
  let chunkCount = 0;

  const file = {
    size,
    slice(start, end) {
      const length = end - start;
      largestSlice = Math.max(largestSlice, length);
      return {
        size: length,
        arrayBuffer: async () => new ArrayBuffer(length),
      };
    },
  };

  for await (const chunk of readFileChunks(file)) {
    processed += chunk.byteLength;
    chunkCount += 1;
    assert.ok(chunk.byteLength <= FILE_STREAM_CHUNK_BYTES);
  }

  assert.equal(processed, size);
  assert.equal(largestSlice, FILE_STREAM_CHUNK_BYTES);
  assert.equal(chunkCount, 129);
});

test("eksik dosya parçası hash veya import öncesinde reddedilir", async () => {
  const file = {
    size: 10,
    slice() {
      return {
        size: 10,
        arrayBuffer: async () => new ArrayBuffer(9),
      };
    },
  };

  await assert.rejects(async () => {
    for await (const _chunk of readFileChunks(file)) {
      // The source must fail before a truncated chunk reaches a consumer.
    }
  }, /eksik okundu/u);
});

test("geçersiz dosya boyutu güvenli biçimde reddedilir", async () => {
  await assert.rejects(async () => {
    for await (const _chunk of readFileChunks({ size: Number.POSITIVE_INFINITY, slice() {} })) {
      // unreachable
    }
  }, /boyutu geçersiz/u);
});
