import { appDataDir, join } from "@tauri-apps/api/path";
import {
  BaseDirectory,
  exists,
  mkdir,
  open,
  readFile,
  remove,
  rename,
} from "@tauri-apps/plugin-fs";
import { Stronghold } from "@tauri-apps/plugin-stronghold";

const VAULT_DIR = "mihenk-vault";
const MATERIALS_DIR = `${VAULT_DIR}/materials`;
const SNAPSHOT_NAME = "secure.hold";
const CLIENT_NAME = "mihenk-main";
const STORE_META_KEY = "mihenk:vault:meta";
const STORE_AUDIO_INDEX_KEY = "mihenk:vault:audio-index";
const CHUNK_SIZE = 1024 * 1024;
const MAX_VAULT_AUDIO_BYTES = 128 * 1024 * 1024;
const HEADER_MAGIC = new TextEncoder().encode("MHKENC01");
const HEADER_SIZE = 13;
const FORMAT_VERSION = 1;
const AUTH_TAG_BYTES = 16;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

interface StoreLike {
  get(key: string): Promise<Uint8Array | null>;
  insert(key: string, value: number[]): Promise<void>;
  remove(key: string): Promise<Uint8Array | null>;
}

type StrongholdInstance = Awaited<ReturnType<typeof Stronghold.load>>;
type StrongholdClient = Awaited<ReturnType<StrongholdInstance["createClient"]>>;

export type VaultState = "not-created" | "locked" | "unlocked";

export interface VaultAudioMetadata {
  fileId: string;
  fileName: string;
  mediaType: string;
  sizeBytes: number;
  lastModified: number;
  chunkSize: number;
  chunkCount: number;
  noncePrefix: number[];
  durationSeconds: number | null;
  sha256Preview: string | null;
  segments: Array<{
    id: string;
    startSeconds: number;
    endSeconds: number | null;
    text: string;
    speaker: string;
    status: "taslak" | "belirsiz" | "uzman-onayli";
  }>;
  formatVersion: 1;
}

let activeStronghold: StrongholdInstance | null = null;
let activeClient: StrongholdClient | null = null;
let activeStore: StoreLike | null = null;

function requireStore(): StoreLike {
  if (!activeStore || !activeStronghold) {
    throw new Error("Yerel kasa kilitli. Önce kasayı açın.");
  }
  return activeStore;
}

async function snapshotPath(): Promise<string> {
  return join(await appDataDir(), VAULT_DIR, SNAPSHOT_NAME);
}

async function encodeJson(value: unknown): Promise<number[]> {
  return Array.from(encoder.encode(JSON.stringify(value)));
}

async function readJson<T>(store: StoreLike, key: string): Promise<T | null> {
  const value = await store.get(key);
  if (!value) return null;
  try {
    return JSON.parse(decoder.decode(value)) as T;
  } catch {
    throw new Error("Şifreli kasa kaydı okunamadı veya biçimi bozuk.");
  }
}

async function writeJson(store: StoreLike, key: string, value: unknown): Promise<void> {
  await store.insert(key, await encodeJson(value));
}

function audioMetaKey(fileId: string): string {
  return `mihenk:audio:meta:${fileId}`;
}

function audioKeyKey(fileId: string): string {
  return `mihenk:audio:key:${fileId}`;
}

function audioRelativePath(fileId: string, suffix: "part" | "mhn"): string {
  return `${MATERIALS_DIR}/${fileId}.${suffix}`;
}

function assertFileId(fileId: string): void {
  if (!/^[a-f0-9]{32}$/i.test(fileId)) {
    throw new Error("Materyal kimliği geçersiz.");
  }
}

function makeNonce(prefix: Uint8Array, index: number): Uint8Array {
  if (prefix.byteLength !== 4 || !Number.isSafeInteger(index) || index < 0) {
    throw new Error("Şifreleme nonce bilgisi geçersiz.");
  }
  const nonce = new Uint8Array(12);
  nonce.set(prefix, 0);
  new DataView(nonce.buffer).setBigUint64(4, BigInt(index), false);
  return nonce;
}

function makeAdditionalData(fileId: string, index: number, plainLength: number): Uint8Array {
  return encoder.encode(`MİHENK-AUDIO-V1|${fileId}|${index}|${plainLength}`);
}

function buildHeader(): Uint8Array {
  const header = new Uint8Array(HEADER_SIZE);
  header.set(HEADER_MAGIC, 0);
  header[8] = FORMAT_VERSION;
  new DataView(header.buffer).setUint32(9, CHUNK_SIZE, true);
  return header;
}

function verifyHeader(bytes: Uint8Array, meta: VaultAudioMetadata): void {
  if (bytes.byteLength < HEADER_SIZE) throw new Error("Şifreli ses dosyası eksik.");
  for (let i = 0; i < HEADER_MAGIC.length; i += 1) {
    if (bytes[i] !== HEADER_MAGIC[i]) throw new Error("Şifreli ses dosyası biçimi tanınmadı.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = bytes[8];
  const chunkSize = view.getUint32(9, true);
  if (version !== FORMAT_VERSION || chunkSize !== meta.chunkSize || chunkSize !== CHUNK_SIZE) {
    throw new Error("Şifreli ses dosyasının sürümü veya blok boyutu desteklenmiyor.");
  }
}

export function vaultChunkNonce(prefix: Uint8Array, index: number): Uint8Array {
  return makeNonce(prefix, index);
}

export function vaultChunkAad(fileId: string, index: number, plainLength: number): Uint8Array {
  assertFileId(fileId);
  return makeAdditionalData(fileId, index, plainLength);
}

export async function encryptVaultChunk(
  key: CryptoKey,
  fileId: string,
  noncePrefix: Uint8Array,
  index: number,
  plaintext: Uint8Array,
): Promise<Uint8Array> {
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: makeNonce(noncePrefix, index),
      additionalData: makeAdditionalData(fileId, index, plaintext.byteLength),
      tagLength: 128,
    },
    key,
    plaintext,
  );
  return new Uint8Array(ciphertext);
}

export async function decryptVaultChunk(
  key: CryptoKey,
  fileId: string,
  noncePrefix: Uint8Array,
  index: number,
  plainLength: number,
  ciphertext: Uint8Array,
): Promise<Uint8Array> {
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: makeNonce(noncePrefix, index),
      additionalData: makeAdditionalData(fileId, index, plainLength),
      tagLength: 128,
    },
    key,
    ciphertext,
  );
  const bytes = new Uint8Array(plaintext);
  if (bytes.byteLength !== plainLength) throw new Error("Şifreli ses bloğunun boyutu doğrulanamadı.");
  return bytes;
}

export async function getVaultState(): Promise<VaultState> {
  const present = await exists(`${VAULT_DIR}/${SNAPSHOT_NAME}`, { baseDir: BaseDirectory.AppData });
  return present ? "locked" : "not-created";
}

export async function createLocalVault(password: string): Promise<void> {
  if (password.length < 12) {
    throw new Error("Kasa parolası en az 12 karakter olmalıdır.");
  }
  if (activeStronghold) throw new Error("Yerel kasa zaten açık.");
  if (await getVaultState() !== "not-created") {
    throw new Error("Bu cihazda kasa zaten var. Yeni kasa oluşturmak yerine kasayı açın.");
  }

  await mkdir(MATERIALS_DIR, { baseDir: BaseDirectory.AppData, recursive: true });
  const stronghold = await Stronghold.load(await snapshotPath(), password);
  try {
    const client = await stronghold.createClient(CLIENT_NAME);
    const store = client.getStore();
    await writeJson(store, STORE_META_KEY, {
      formatVersion: FORMAT_VERSION,
      createdAt: new Date().toISOString(),
      kdf: "Stronghold Argon2",
      storage: "AES-256-GCM chunked audio",
    });
    await writeJson(store, STORE_AUDIO_INDEX_KEY, [] as string[]);
    await stronghold.save();
    activeStronghold = stronghold;
    activeClient = client;
    activeStore = store;
  } catch (error) {
    await stronghold.unload().catch(() => undefined);
    throw error;
  }
}

export async function unlockLocalVault(password: string): Promise<void> {
  if (activeStronghold) return;
  if (await getVaultState() !== "locked") throw new Error("Bu cihazda açılacak bir kasa bulunamadı.");

  const stronghold = await Stronghold.load(await snapshotPath(), password);
  try {
    const client = await stronghold.loadClient(CLIENT_NAME);
    const store = client.getStore();
    const metadata = await readJson<{ formatVersion: number }>(store, STORE_META_KEY);
    if (!metadata || metadata.formatVersion !== FORMAT_VERSION) {
      throw new Error("Kasa sürümü tanınmıyor veya kasa doğrulanamadı.");
    }
    await readJson<string[]>(store, STORE_AUDIO_INDEX_KEY);
    activeStronghold = stronghold;
    activeClient = client;
    activeStore = store;
  } catch {
    await stronghold.unload().catch(() => undefined);
    throw new Error("Kasa açılamadı. Parola yanlış veya kasa dosyası bozuk olabilir.");
  }
}

export async function lockLocalVault(): Promise<void> {
  if (!activeStronghold) return;
  const stronghold = activeStronghold;
  activeStronghold = null;
  activeClient = null;
  activeStore = null;
  await stronghold.unload();
}

export async function listStoredAudio(): Promise<VaultAudioMetadata[]> {
  const store = requireStore();
  const ids = await readJson<string[]>(store, STORE_AUDIO_INDEX_KEY) ?? [];
  const records: VaultAudioMetadata[] = [];
  for (const fileId of ids) {
    assertFileId(fileId);
    const metadata = await readJson<VaultAudioMetadata>(store, audioMetaKey(fileId));
    if (metadata) records.push(metadata);
  }
  return records;
}

export async function saveStoredAudioMetadata(metadata: VaultAudioMetadata): Promise<void> {
  const store = requireStore();
  assertFileId(metadata.fileId);
  await writeJson(store, audioMetaKey(metadata.fileId), metadata);
  await activeStronghold!.save();
}

export async function importAudioToVault(file: File): Promise<VaultAudioMetadata> {
  const store = requireStore();
  if (file.size <= 0) throw new Error("Boş ses dosyası kasaya alınamaz.");
  if (file.size > MAX_VAULT_AUDIO_BYTES) {
    throw new Error("Bu önizlemede tek ses dosyası 128 MiB sınırını aşamaz.");
  }

  await mkdir(MATERIALS_DIR, { baseDir: BaseDirectory.AppData, recursive: true });
  const fileId = crypto.randomUUID().replaceAll("-", "").toLowerCase();
  const noncePrefix = crypto.getRandomValues(new Uint8Array(4));
  const rawKey = crypto.getRandomValues(new Uint8Array(32));
  const key = await crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  const chunkCount = Math.ceil(file.size / CHUNK_SIZE);
  const partPath = audioRelativePath(fileId, "part");
  const finalPath = audioRelativePath(fileId, "mhn");
  let fileHandle: Awaited<ReturnType<typeof open>> | null = null;
  let renamed = false;

  try {
    fileHandle = await open(partPath, {
      write: true,
      create: true,
      truncate: true,
      baseDir: BaseDirectory.AppData,
    });
    await fileHandle.write(buildHeader());

    for (let index = 0; index < chunkCount; index += 1) {
      const start = index * CHUNK_SIZE;
      const end = Math.min(file.size, start + CHUNK_SIZE);
      const plaintext = new Uint8Array(await file.slice(start, end).arrayBuffer());
      const ciphertext = await encryptVaultChunk(key, fileId, noncePrefix, index, plaintext);
      plaintext.fill(0);
      await fileHandle.write(ciphertext);
    }

    await fileHandle.close();
    fileHandle = null;
    await rename(partPath, finalPath, {
      oldPathBaseDir: BaseDirectory.AppData,
      newPathBaseDir: BaseDirectory.AppData,
    });
    renamed = true;

    const metadata: VaultAudioMetadata = {
      fileId,
      fileName: file.name,
      mediaType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      lastModified: file.lastModified,
      chunkSize: CHUNK_SIZE,
      chunkCount,
      noncePrefix: Array.from(noncePrefix),
      durationSeconds: null,
      sha256Preview: null,
      segments: [],
      formatVersion: FORMAT_VERSION,
    };

    await store.insert(audioKeyKey(fileId), Array.from(rawKey));
    await writeJson(store, audioMetaKey(fileId), metadata);
    const ids = await readJson<string[]>(store, STORE_AUDIO_INDEX_KEY) ?? [];
    await writeJson(store, STORE_AUDIO_INDEX_KEY, [...ids, fileId]);
    await activeStronghold!.save();
    return metadata;
  } catch (error) {
    if (fileHandle) await fileHandle.close().catch(() => undefined);
    if (renamed) {
      await remove(finalPath, { baseDir: BaseDirectory.AppData }).catch(() => undefined);
    } else {
      await remove(partPath, { baseDir: BaseDirectory.AppData }).catch(() => undefined);
    }
    rawKey.fill(0);
    throw error;
  } finally {
    rawKey.fill(0);
  }
}

export async function openStoredAudio(metadata: VaultAudioMetadata): Promise<File> {
  const store = requireStore();
  assertFileId(metadata.fileId);
  if (metadata.sizeBytes > MAX_VAULT_AUDIO_BYTES) {
    throw new Error("Ses dosyası bu önizlemenin bellek sınırını aşıyor.");
  }
  const rawKey = await store.get(audioKeyKey(metadata.fileId));
  if (!rawKey || rawKey.byteLength !== 32) {
    throw new Error("Ses dosyasının şifreleme anahtarı bulunamadı.");
  }
  const fileBytes = await readFile(audioRelativePath(metadata.fileId, "mhn"), {
    baseDir: BaseDirectory.AppData,
  });
  verifyHeader(fileBytes, metadata);
  const expectedBytes = HEADER_SIZE + metadata.sizeBytes + metadata.chunkCount * AUTH_TAG_BYTES;
  if (fileBytes.byteLength !== expectedBytes) {
    rawKey.fill(0);
    throw new Error("Şifreli ses dosyasının uzunluğu doğrulanamadı.");
  }

  try {
    const key = await crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["decrypt"]);
    const prefix = new Uint8Array(metadata.noncePrefix);
    if (prefix.byteLength !== 4) throw new Error("Ses dosyasının nonce öneki bozuk.");

    const chunks: Uint8Array[] = [];
    let offset = HEADER_SIZE;
    for (let index = 0; index < metadata.chunkCount; index += 1) {
      const plainLength = Math.min(
        metadata.chunkSize,
        metadata.sizeBytes - index * metadata.chunkSize,
      );
      const cipherLength = plainLength + AUTH_TAG_BYTES;
      const ciphertext = fileBytes.slice(offset, offset + cipherLength);
      const plaintext = await decryptVaultChunk(
        key,
        metadata.fileId,
        prefix,
        index,
        plainLength,
        ciphertext,
      );
      chunks.push(plaintext);
      offset += cipherLength;
    }
    return new File(chunks, metadata.fileName, {
      type: metadata.mediaType,
      lastModified: metadata.lastModified,
    });
  } catch {
    throw new Error("Ses dosyasının şifreli blokları doğrulanamadı.");
  } finally {
    rawKey.fill(0);
    fileBytes.fill(0);
  }
}

export async function deleteStoredAudio(fileId: string): Promise<void> {
  const store = requireStore();
  assertFileId(fileId);
  const ids = await readJson<string[]>(store, STORE_AUDIO_INDEX_KEY) ?? [];
  await store.remove(audioKeyKey(fileId));
  await store.remove(audioMetaKey(fileId));
  await writeJson(store, STORE_AUDIO_INDEX_KEY, ids.filter((id) => id !== fileId));
  await activeStronghold!.save();
  await remove(audioRelativePath(fileId, "mhn"), { baseDir: BaseDirectory.AppData }).catch(() => undefined);
}
