import assert from "node:assert/strict";
import test from "node:test";

import { Sha256 } from "../src/domain/sha256.ts";

test("SHA-256 boş girdiyi doğru hesaplar", () => {
  assert.equal(
    new Sha256().digestHex(),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
});

test("SHA-256 bilinen kısa girdiyi doğru hesaplar", () => {
  const digest = new Sha256().update(new TextEncoder().encode("abc")).digestHex();
  assert.equal(digest, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("SHA-256 blok sınırını aşan girdiyi doğru hesaplar", () => {
  const input = new TextEncoder().encode("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq");
  const digest = new Sha256().update(input).digestHex();
  assert.equal(digest, "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
});

test("SHA-256 bir milyon bayt girdiyi farklı parça boyutlarında doğru birleştirir", () => {
  const chunk = new Uint8Array(997).fill(0x61);
  const hasher = new Sha256();
  let remaining = 1_000_000;
  while (remaining > 0) {
    const length = Math.min(chunk.byteLength, remaining);
    hasher.update(chunk.subarray(0, length));
    remaining -= length;
  }
  assert.equal(
    hasher.digestHex(),
    "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0",
  );
});

test("SHA-256 tamamlandıktan sonra yeniden güncellenemez veya özetlenemez", () => {
  const hasher = new Sha256().update(new TextEncoder().encode("abc"));
  hasher.digest();
  assert.throws(() => hasher.update(new Uint8Array([1])), /zaten tamamlandı/);
  assert.throws(() => hasher.digest(), /yalnızca bir kez/);
});
