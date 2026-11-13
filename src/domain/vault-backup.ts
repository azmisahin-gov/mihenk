const MAGIC = new TextEncoder().encode("MHKBAK01");
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export const VAULT_BACKUP_VERSION = 1;
export const VAULT_BACKUP_HEADER_BYTES = 16;
export const VAULT_BACKUP_HASH_BYTES = 32;
export const MAX_VAULT_BACKUP_BYTES = 512 * 1024 * 1024;
export const MAX_VAULT_BACKUP_FILES = 1024;
export const MAX_VAULT_BACKUP_PATH_BYTES = 256;
export const MAX_VAULT_BACKUP_ENTRY_BYTES = 256 * 1024 * 1024;

export interface VaultBackupEntry {
  path: string;
  data: Uint8Array;
}

export type VaultBackupFiles = Map<string, Uint8Array<ArrayBuffer>>;

const SNAPSHOT_PATH = "mihenk-vault/secure.hold";
const SALT_PATH = "mihenk-vault/stronghold.salt";
const MATERIAL_PATH = /^mihenk-vault\/materials\/[a-f0-9]{32}\.mhn$/;

function isAllowedPath(path: string): boolean {
  return path === SNAPSHOT_PATH || path === SALT_PATH || MATERIAL_PATH.test(path);
}

function copyArrayBuffer(source: Uint8Array): Uint8Array<ArrayBuffer> {
  const output = new Uint8Array(source.byteLength);
  output.set(source);
  return output;
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const buffer = copyArrayBuffer(bytes);
  try {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", buffer));
  } finally {
    buffer.fill(0);
  }
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

function validateEntry(entry: VaultBackupEntry): void {
  if (!isAllowedPath(entry.path)) {
    throw new Error("Yedek içinde izin verilmeyen bir dosya yolu var.");
  }
  const pathBytes = encoder.encode(entry.path);
  if (pathBytes.byteLength === 0 || pathBytes.byteLength > MAX_VAULT_BACKUP_PATH_BYTES) {
    throw new Error("Yedek dosya yolu uzunluğu geçersiz.");
  }
  if (!(entry.data instanceof Uint8Array) || entry.data.byteLength === 0) {
    throw new Error("Yedek dosyası boş veya geçersiz.");
  }
  if (entry.data.byteLength > MAX_VAULT_BACKUP_ENTRY_BYTES) {
    throw new Error("Yedek içindeki bir dosya izin verilen boyutu aşıyor.");
  }
}

export async function buildVaultBackup(entries: VaultBackupEntry[]): Promise<Uint8Array<ArrayBuffer>> {
  if (!Array.isArray(entries) || entries.length < 2 || entries.length > MAX_VAULT_BACKUP_FILES) {
    throw new Error("Yedek dosya sayısı geçersiz.");
  }

  const seen = new Set<string>();
  let totalBytes = VAULT_BACKUP_HEADER_BYTES;
  const prepared: Array<{ pathBytes: Uint8Array<ArrayBuffer>; data: Uint8Array; digest: Uint8Array<ArrayBuffer> }> = [];

  for (const entry of entries) {
    validateEntry(entry);
    if (seen.has(entry.path)) throw new Error("Yedekte yinelenen dosya yolu var.");
    seen.add(entry.path);

    const pathBytes = encoder.encode(entry.path);
    const digest = await sha256(entry.data);
    totalBytes += 2 + 8 + VAULT_BACKUP_HASH_BYTES + pathBytes.byteLength + entry.data.byteLength;
    if (totalBytes > MAX_VAULT_BACKUP_BYTES) {
      throw new Error("Şifreli yedek 512 MiB sınırını aşıyor.");
    }
    prepared.push({
      pathBytes,
      data: entry.data,
      digest,
    });
  }

  if (!seen.has(SNAPSHOT_PATH) || !seen.has(SALT_PATH)) {
    throw new Error("Yedekte kasa snapshot'ı veya Argon2 salt dosyası eksik.");
  }

  const output = new Uint8Array(totalBytes);
  output.set(MAGIC, 0);
  const view = new DataView(output.buffer);
  view.setUint32(8, VAULT_BACKUP_VERSION, true);
  view.setUint32(12, prepared.length, true);
  let offset = VAULT_BACKUP_HEADER_BYTES;

  for (const entry of prepared) {
    view.setUint16(offset, entry.pathBytes.byteLength, true);
    offset += 2;
    view.setBigUint64(offset, BigInt(entry.data.byteLength), true);
    offset += 8;
    output.set(entry.digest, offset);
    offset += VAULT_BACKUP_HASH_BYTES;
    output.set(entry.pathBytes, offset);
    offset += entry.pathBytes.byteLength;
    output.set(entry.data, offset);
    offset += entry.data.byteLength;
    entry.digest.fill(0);
    entry.pathBytes.fill(0);
  }

  return output;
}

export async function parseVaultBackup(input: Uint8Array): Promise<VaultBackupFiles> {
  if (!(input instanceof Uint8Array) || input.byteLength < VAULT_BACKUP_HEADER_BYTES) {
    throw new Error("Yedek dosyası eksik veya biçimi tanınmıyor.");
  }
  if (input.byteLength > MAX_VAULT_BACKUP_BYTES) {
    throw new Error("Yedek dosyası 512 MiB sınırını aşıyor.");
  }

  for (let index = 0; index < MAGIC.length; index += 1) {
    if (input[index] !== MAGIC[index]) throw new Error("Bu dosya MİHENK şifreli yedeği değil.");
  }

  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  if (view.getUint32(8, true) !== VAULT_BACKUP_VERSION) {
    throw new Error("Yedek biçimi sürümü desteklenmiyor.");
  }
  const count = view.getUint32(12, true);
  if (count < 2 || count > MAX_VAULT_BACKUP_FILES) {
    throw new Error("Yedek dosya sayısı geçersiz.");
  }

  const files: VaultBackupFiles = new Map();
  let offset = VAULT_BACKUP_HEADER_BYTES;

  for (let index = 0; index < count; index += 1) {
    if (offset + 2 + 8 + VAULT_BACKUP_HASH_BYTES > input.byteLength) {
      throw new Error("Yedek kaydı eksik veya kesilmiş.");
    }

    const pathLength = view.getUint16(offset, true);
    offset += 2;
    const sizeBig = view.getBigUint64(offset, true);
    offset += 8;
    if (
      pathLength === 0 ||
      pathLength > MAX_VAULT_BACKUP_PATH_BYTES ||
      sizeBig <= 0n ||
      sizeBig > BigInt(MAX_VAULT_BACKUP_ENTRY_BYTES)
    ) {
      throw new Error("Yedek kaydının yol veya boyut bilgisi geçersiz.");
    }
    const size = Number(sizeBig);
    const expectedHash = input.slice(offset, offset + VAULT_BACKUP_HASH_BYTES);
    offset += VAULT_BACKUP_HASH_BYTES;

    if (offset + pathLength + size > input.byteLength) {
      expectedHash.fill(0);
      throw new Error("Yedek dosya içeriği eksik veya kesilmiş.");
    }

    let path: string;
    try {
      path = decoder.decode(input.slice(offset, offset + pathLength));
    } catch {
      expectedHash.fill(0);
      throw new Error("Yedek dosya yolu UTF-8 biçiminde değil.");
    }
    offset += pathLength;

    if (!isAllowedPath(path)) {
      expectedHash.fill(0);
      throw new Error("Yedek içinde izin verilmeyen bir dosya yolu var.");
    }
    if (files.has(path)) {
      expectedHash.fill(0);
      throw new Error("Yedekte yinelenen dosya yolu var.");
    }

    const data = copyArrayBuffer(input.slice(offset, offset + size));
    offset += size;
    const actualHash = await sha256(data);
    const valid = equalBytes(expectedHash, actualHash);
    expectedHash.fill(0);
    actualHash.fill(0);
    if (!valid) {
      data.fill(0);
      throw new Error("Yedek bütünlük kontrolü başarısız; dosya değiştirilmiş olabilir.");
    }
    files.set(path, data);
  }

  if (offset !== input.byteLength) {
    for (const data of files.values()) data.fill(0);
    throw new Error("Yedek dosyasının sonunda beklenmeyen veri var.");
  }
  if (!files.has(SNAPSHOT_PATH) || !files.has(SALT_PATH)) {
    for (const data of files.values()) data.fill(0);
    throw new Error("Yedekte kasa snapshot'ı veya Argon2 salt dosyası eksik.");
  }

  return files;
}
