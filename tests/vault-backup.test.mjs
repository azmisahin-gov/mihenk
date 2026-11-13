import assert from "node:assert/strict";
import test from "node:test";

import {
  buildVaultBackup,
  parseVaultBackup,
  VAULT_BACKUP_HEADER_BYTES,
  isVaultMaterialFileName,
} from "../src/domain/vault-backup.ts";

test("kasa materyali yedeklemesinde yalnız doğru kimlikli mhn uzantısı kabul edilir", () => {
  assert.equal(isVaultMaterialFileName("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.mhn"), true);
  assert.equal(isVaultMaterialFileName("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.mhn"), false);
  assert.equal(isVaultMaterialFileName("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.part"), false);
  assert.equal(isVaultMaterialFileName("../secret.mhn"), false);
});

function sampleEntries() {
  return [
    { path: "mihenk-vault/secure.hold", data: new TextEncoder().encode("encrypted snapshot bytes") },
    { path: "mihenk-vault/stronghold.salt", data: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]) },
    { path: `mihenk-vault/materials/${"a".repeat(32)}.mhn`, data: new Uint8Array([9, 8, 7, 6]) },
  ];
}

test("şifreli yedek oluşturulur ve dosyalar kayıpsız geri ayrıştırılır", async () => {
  const backup = await buildVaultBackup(sampleEntries());
  assert.ok(backup.byteLength > VAULT_BACKUP_HEADER_BYTES);
  const restored = await parseVaultBackup(backup);
  assert.equal(restored.size, 3);
  assert.equal(new TextDecoder().decode(restored.get("mihenk-vault/secure.hold")), "encrypted snapshot bytes");
  assert.deepEqual(
    restored.get(`mihenk-vault/materials/${"a".repeat(32)}.mhn`),
    new Uint8Array([9, 8, 7, 6]),
  );
});

test("kasa snapshot ve Argon2 salt olmadan yedek oluşturulamaz", async () => {
  await assert.rejects(buildVaultBackup([
    { path: "mihenk-vault/secure.hold", data: new Uint8Array([1]) },
  ]));
});

test("yedek içinde dizin dışına çıkan veya izin verilmeyen yol kabul edilmez", async () => {
  await assert.rejects(buildVaultBackup([
    { path: "mihenk-vault/secure.hold", data: new Uint8Array([1]) },
    { path: "mihenk-vault/stronghold.salt", data: new Uint8Array([2]) },
    { path: "mihenk-vault/../secret", data: new Uint8Array([3]) },
  ]));
});

test("yinelenen materyal yolu kabul edilmez", async () => {
  const entries = sampleEntries();
  entries.push({ ...entries[2], data: new Uint8Array([5]) });
  await assert.rejects(buildVaultBackup(entries), /yinelenen/);
});

test("yedek içeriği değiştirilmişse checksum doğrulaması başarısız olur", async () => {
  const backup = await buildVaultBackup(sampleEntries());
  backup[backup.length - 1] ^= 0xff;
  await assert.rejects(parseVaultBackup(backup), /bütünlük/);
});

test("kesilmiş ve bozuk başlıklı yedekler reddedilir", async () => {
  const backup = await buildVaultBackup(sampleEntries());
  await assert.rejects(parseVaultBackup(backup.slice(0, 9)));
  const corrupt = backup.slice();
  corrupt[0] ^= 0xff;
  await assert.rejects(parseVaultBackup(corrupt), /değil/);
});

test("beklenmeyen ek veri ve zorunlu dosyası eksik yedek reddedilir", async () => {
  const backup = await buildVaultBackup(sampleEntries());
  const trailing = new Uint8Array(backup.length + 1);
  trailing.set(backup);
  await assert.rejects(parseVaultBackup(trailing), /beklenmeyen/);

  const invalid = await buildVaultBackup(sampleEntries());
  invalid[invalid.length - 1] = 0;
  await assert.rejects(parseVaultBackup(invalid), /bütünlük/);
});
