const encoder = new TextEncoder();
const HEADER_MAGIC = encoder.encode("MHKENC01");

export const VAULT_FORMAT_VERSION = 1;
export const VAULT_CHUNK_SIZE = 1024 * 1024;
export const VAULT_HEADER_SIZE = 13;
export const VAULT_AUTH_TAG_BYTES = 16;
export const MAX_VAULT_AUDIO_BYTES = 240 * 1024 * 1024;

function toOwnedArrayBuffer(source: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(source.byteLength);
  copy.set(source);
  return copy;
}

export function createVaultNoncePrefix(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(4));
}

export function createVaultFileKeyBytes(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(32));
}

export function vaultChunkNonce(prefix: Uint8Array, index: number): Uint8Array<ArrayBuffer> {
  if (prefix.byteLength !== 4 || !Number.isSafeInteger(index) || index < 0) {
    throw new Error("Şifreleme nonce bilgisi geçersiz.");
  }
  const nonce = new Uint8Array(12);
  nonce.set(prefix, 0);
  new DataView(nonce.buffer).setBigUint64(4, BigInt(index), false);
  return nonce;
}

export function vaultChunkAad(fileId: string, index: number, plainLength: number): Uint8Array<ArrayBuffer> {
  if (!/^[a-f0-9]{32}$/i.test(fileId)) throw new Error("Materyal kimliği geçersiz.");
  if (
    !Number.isSafeInteger(index) || index < 0 ||
    !Number.isSafeInteger(plainLength) || plainLength <= 0 ||
    plainLength > VAULT_CHUNK_SIZE
  ) {
    throw new Error("Şifreli ses bloğu bilgisi geçersiz.");
  }
  return encoder.encode(`MİHENK-AUDIO-V${VAULT_FORMAT_VERSION}|${fileId}|${index}|${plainLength}`);
}

export function buildVaultHeader(): Uint8Array<ArrayBuffer> {
  const header = new Uint8Array(VAULT_HEADER_SIZE);
  header.set(HEADER_MAGIC, 0);
  header[8] = VAULT_FORMAT_VERSION;
  new DataView(header.buffer).setUint32(9, VAULT_CHUNK_SIZE, true);
  return header;
}

export function verifyVaultHeader(bytes: Uint8Array): void {
  if (bytes.byteLength < VAULT_HEADER_SIZE) throw new Error("Şifreli ses dosyası eksik.");
  for (let index = 0; index < HEADER_MAGIC.length; index += 1) {
    if (bytes[index] !== HEADER_MAGIC[index]) throw new Error("Şifreli ses dosyası biçimi tanınmadı.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    bytes[8] !== VAULT_FORMAT_VERSION ||
    view.getUint32(9, true) !== VAULT_CHUNK_SIZE
  ) {
    throw new Error("Şifreli ses dosyasının sürümü veya blok boyutu desteklenmiyor.");
  }
}

export async function importVaultFileKey(rawKey: Uint8Array): Promise<CryptoKey> {
  if (rawKey.byteLength !== 32) throw new Error("Ses dosyasının anahtar boyutu geçersiz.");
  const keyBytes = toOwnedArrayBuffer(rawKey);
  try {
    return await crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  } finally {
    keyBytes.fill(0);
  }
}

export async function encryptVaultChunk(
  key: CryptoKey,
  fileId: string,
  noncePrefix: Uint8Array,
  index: number,
  plaintext: Uint8Array,
): Promise<Uint8Array<ArrayBuffer>> {
  const iv = toOwnedArrayBuffer(vaultChunkNonce(noncePrefix, index));
  const additionalData = toOwnedArrayBuffer(vaultChunkAad(fileId, index, plaintext.byteLength));
  const plainBytes = toOwnedArrayBuffer(plaintext);
  try {
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData, tagLength: 128 },
      key,
      plainBytes,
    );
    return new Uint8Array(encrypted);
  } finally {
    iv.fill(0);
    additionalData.fill(0);
    plainBytes.fill(0);
  }
}

export async function decryptVaultChunk(
  key: CryptoKey,
  fileId: string,
  noncePrefix: Uint8Array,
  index: number,
  plainLength: number,
  ciphertext: Uint8Array,
): Promise<Uint8Array<ArrayBuffer>> {
  const iv = toOwnedArrayBuffer(vaultChunkNonce(noncePrefix, index));
  const additionalData = toOwnedArrayBuffer(vaultChunkAad(fileId, index, plainLength));
  const cipherBytes = toOwnedArrayBuffer(ciphertext);
  let decrypted: ArrayBuffer;
  try {
    decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData, tagLength: 128 },
      key,
      cipherBytes,
    );
  } finally {
    iv.fill(0);
    additionalData.fill(0);
    cipherBytes.fill(0);
  }
  const plaintext = new Uint8Array(decrypted);
  if (plaintext.byteLength !== plainLength) {
    plaintext.fill(0);
    throw new Error("Şifreli ses bloğunun boyutu doğrulanamadı.");
  }
  return plaintext;
}

export function expectedVaultCiphertextSize(plainSize: number): number {
  if (!Number.isSafeInteger(plainSize) || plainSize <= 0) throw new Error("Ses dosyası boyutu geçersiz.");
  const chunkCount = Math.ceil(plainSize / VAULT_CHUNK_SIZE);
  return VAULT_HEADER_SIZE + plainSize + chunkCount * VAULT_AUTH_TAG_BYTES;
}
