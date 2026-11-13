import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_VAULT_AUDIO_BYTES,
  VAULT_AUTH_TAG_BYTES,
  VAULT_CHUNK_SIZE,
  VAULT_HEADER_SIZE,
  buildVaultHeader,
  createVaultFileKeyBytes,
  createVaultNoncePrefix,
  decryptVaultChunk,
  encryptVaultChunk,
  expectedVaultCiphertextSize,
  importVaultFileKey,
  verifyVaultHeader,
  vaultChunkAad,
  vaultChunkNonce,
} from "../src/domain/vault-crypto.ts";

test("şifreli ses biçimi başlık ve sürüm içerir", () => {
  const header = buildVaultHeader();
  assert.equal(header.length, VAULT_HEADER_SIZE);
  assert.equal(new TextDecoder().decode(header.slice(0, 8)), "MHKENC01");
  assert.equal(new DataView(header.buffer).getUint32(9, true), VAULT_CHUNK_SIZE);
  assert.doesNotThrow(() => verifyVaultHeader(header));
  assert.throws(() => verifyVaultHeader(header.slice(0, 8)));
  const changed = header.slice();
  changed[8] = 99;
  assert.throws(() => verifyVaultHeader(changed));
});

test("dosya anahtarı ve nonce öneki doğru uzunluklarda rastgele üretilir", () => {
  assert.equal(createVaultFileKeyBytes().length, 32);
  assert.equal(createVaultNoncePrefix().length, 4);
});

test("aynı dosyadaki her blok sayacı farklı AES-GCM nonce üretir", () => {
  const prefix = new Uint8Array([1, 2, 3, 4]);
  const first = vaultChunkNonce(prefix, 0);
  const second = vaultChunkNonce(prefix, 1);
  assert.equal(first.length, 12);
  assert.notDeepEqual(first, second);
  assert.deepEqual(first.slice(0, 4), prefix);
});

test("AES-256-GCM blok şifreleme doğru içeriği geri açar", async () => {
  const rawKey = createVaultFileKeyBytes();
  try {
    const key = await importVaultFileKey(rawKey);
    const fileId = "a".repeat(32);
    const prefix = new Uint8Array([9, 8, 7, 6]);
    const plaintext = new TextEncoder().encode("Sentetik ses bloğu; gerçek dosya değildir.");
    const ciphertext = await encryptVaultChunk(key, fileId, prefix, 0, plaintext);
    assert.equal(ciphertext.length, plaintext.length + VAULT_AUTH_TAG_BYTES);
    const recovered = await decryptVaultChunk(key, fileId, prefix, 0, plaintext.length, ciphertext);
    assert.deepEqual(recovered, plaintext);
    recovered.fill(0);
    ciphertext.fill(0);
    plaintext.fill(0);
  } finally {
    rawKey.fill(0);
  }
});

test("blok başka dosya kimliği veya sıra numarası altında açılamaz", async () => {
  const rawKey = createVaultFileKeyBytes();
  try {
    const key = await importVaultFileKey(rawKey);
    const fileId = "b".repeat(32);
    const prefix = new Uint8Array([4, 3, 2, 1]);
    const plaintext = new Uint8Array([1, 2, 3, 4, 5]);
    const ciphertext = await encryptVaultChunk(key, fileId, prefix, 3, plaintext);
    await assert.rejects(decryptVaultChunk(key, "c".repeat(32), prefix, 3, plaintext.length, ciphertext));
    await assert.rejects(decryptVaultChunk(key, fileId, prefix, 4, plaintext.length, ciphertext));
  } finally {
    rawKey.fill(0);
  }
});

test("bozulmuş şifreli blok doğrulama hatası verir", async () => {
  const rawKey = createVaultFileKeyBytes();
  try {
    const key = await importVaultFileKey(rawKey);
    const fileId = "d".repeat(32);
    const prefix = new Uint8Array([1, 1, 2, 3]);
    const plaintext = new Uint8Array([0, 1, 2, 3, 4, 5]);
    const ciphertext = await encryptVaultChunk(key, fileId, prefix, 0, plaintext);
    ciphertext[0] ^= 0xff;
    await assert.rejects(decryptVaultChunk(key, fileId, prefix, 0, plaintext.length, ciphertext));
  } finally {
    rawKey.fill(0);
  }
});

test("AAD dosya kimliğini, blok sırasını ve açık uzunluğu bağlar", () => {
  const aad = new TextDecoder().decode(vaultChunkAad("e".repeat(32), 7, 123));
  assert.match(aad, /e{32}/);
  assert.match(aad, /\|7\|123$/);
  assert.throws(() => vaultChunkAad("../secret", 0, 1));
  assert.throws(() => vaultChunkAad("a".repeat(32), -1, 1));
  assert.throws(() => vaultChunkAad("a".repeat(32), 0, VAULT_CHUNK_SIZE + 1));
});

test("şifreli kapsayıcı için blok ve doğrulama etiketi boyutu hesaplanır", () => {
  assert.equal(expectedVaultCiphertextSize(1), VAULT_HEADER_SIZE + 1 + VAULT_AUTH_TAG_BYTES);
  assert.equal(expectedVaultCiphertextSize(VAULT_CHUNK_SIZE), VAULT_HEADER_SIZE + VAULT_CHUNK_SIZE + VAULT_AUTH_TAG_BYTES);
  assert.equal(expectedVaultCiphertextSize(VAULT_CHUNK_SIZE + 1), VAULT_HEADER_SIZE + VAULT_CHUNK_SIZE + 1 + 2 * VAULT_AUTH_TAG_BYTES);
  assert.throws(() => expectedVaultCiphertextSize(0));
  assert.ok(MAX_VAULT_AUDIO_BYTES > VAULT_CHUNK_SIZE);
});
