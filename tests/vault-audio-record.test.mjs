import assert from "node:assert/strict";
import test from "node:test";

import { createVaultAudioRecord } from "../src/domain/vault-audio-record.ts";

function metadataFixture() {
  return {
    fileId: "a".repeat(32),
    assignmentId: "b".repeat(32),
    fileName: "sentetik-kayit.wav",
    mediaType: "audio/wav",
    sizeBytes: 12 * 1024 * 1024,
    lastModified: 123456789,
    chunkSize: 1024 * 1024,
    chunkCount: 12,
    noncePrefix: [1, 2, 3, 4],
    durationSeconds: 65,
    sha256Preview: "c".repeat(64),
    segments: [],
    formatVersion: 1,
  };
}

test("vault-backed audio row keeps metadata but never retains the plaintext source bytes", () => {
  const metadata = metadataFixture();
  const record = createVaultAudioRecord(metadata, "hesaplandi");

  assert.equal(record.id, metadata.fileId);
  assert.equal(record.file.name, metadata.fileName);
  assert.equal(record.file.type, metadata.mediaType);
  assert.equal(record.file.size, 0);
  assert.equal(record.file.lastModified, metadata.lastModified);
  assert.equal(record.objectUrl, "");
  assert.equal(record.durationSeconds, metadata.durationSeconds);
  assert.equal(record.sha256, metadata.sha256Preview);
  assert.equal(record.hashState, "hesaplandi");
  assert.equal(record.vaultMetadata, metadata);
});

test("records restored without a hash remain marked as pending and have no playback URL", () => {
  const metadata = metadataFixture();
  metadata.sha256Preview = null;
  const record = createVaultAudioRecord(metadata, "bekliyor");

  assert.equal(record.hashState, "bekliyor");
  assert.equal(record.sha256, null);
  assert.equal(record.objectUrl, "");
  assert.equal(record.file.size, 0);
});
