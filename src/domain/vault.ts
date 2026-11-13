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
import {
  MAX_VAULT_AUDIO_BYTES,
  VAULT_AUTH_TAG_BYTES,
  VAULT_CHUNK_SIZE,
  VAULT_FORMAT_VERSION,
  buildVaultHeader,
  createVaultFileKeyBytes,
  createVaultNoncePrefix,
  decryptVaultChunk,
  encryptVaultChunk,
  expectedVaultCiphertextSize,
  importVaultFileKey,
  verifyVaultHeader,
} from "./vault-crypto";

const VAULT_DIR = "mihenk-vault";
const MATERIALS_DIR = `${VAULT_DIR}/materials`;
const SNAPSHOT_NAME = "secure.hold";
const CLIENT_NAME = "mihenk-main";
const STORE_META_KEY = "mihenk:vault:meta";
const STORE_AUDIO_INDEX_KEY = "mihenk:vault:audio-index";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

interface StoreLike {
  get(key: string): Promise<Uint8Array | null>;
  insert(key: string, value: number[]): Promise<void>;
  remove(key: string): Promise<Uint8Array | null>;
}

type StrongholdInstance = Awaited<ReturnType<typeof Stronghold.load>>;

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
let activeStore: StoreLike | null = null;

function requireStore(): StoreLike {
  if (!activeStore || !activeStronghold) {
    throw new Error("Yerel kasa kilitli. Önce kasayı açın.");
  }
  return activeStore;
}

function requireStronghold(): StrongholdInstance {
  if (!activeStronghold) throw new Error("Yerel kasa kilitli. Önce kasayı açın.");
  return activeStronghold;
}

async function snapshotPath(): Promise<string> {
  return join(await appDataDir(), VAULT_DIR, SNAPSHOT_NAME);
}

function snapshotRelativePath(): string {
  return `${VAULT_DIR}/${SNAPSHOT_NAME}`;
}

function encodeJson(value: unknown): number[] {
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
  await store.insert(key, encodeJson(value));
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

export function assertVaultFileId(fileId: string): void {
  if (!/^[a-f0-9]{32}$/.test(fileId)) {
    throw new Error("Materyal kimliği geçersiz.");
  }
}

function validateMetadata(meta: VaultAudioMetadata): void {
  assertVaultFileId(meta.fileId);
  if (
    meta.formatVersion !== VAULT_FORMAT_VERSION ||
    !Number.isSafeInteger(meta.sizeBytes) ||
    meta.sizeBytes <= 0 ||
    meta.sizeBytes > MAX_VAULT_AUDIO_BYTES ||
    meta.chunkSize !== VAULT_CHUNK_SIZE ||
    meta.chunkCount !== Math.ceil(meta.sizeBytes / VAULT_CHUNK_SIZE) ||
    meta.noncePrefix.length !== 4 ||
    meta.noncePrefix.some((part) => !Number.isInteger(part) || part < 0 || part > 255) ||
    typeof meta.fileName !== "string" ||
    typeof meta.mediaType !== "string" ||
    !Array.isArray(meta.segments)
  ) {
    throw new Error("Şifreli ses kaydının üst verisi geçersiz veya desteklenmiyor.");
  }
}

export async function getVaultState(): Promise<VaultState> {
  if (activeStronghold) return "unlocked";
  const present = await exists(snapshotRelativePath(), { baseDir: BaseDirectory.AppData });
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
  let initialized = false;
  try {
    const client = await stronghold.createClient(CLIENT_NAME);
    const store = client.getStore() as StoreLike;
    await writeJson(store, STORE_META_KEY, {
      formatVersion: VAULT_FORMAT_VERSION,
      createdAt: new Date().toISOString(),
      kdf: "Stronghold Argon2",
      audioCipher: "AES-256-GCM",
      audioChunkBytes: VAULT_CHUNK_SIZE,
    });
    await writeJson(store, STORE_AUDIO_INDEX_KEY, [] as string[]);
    await stronghold.save();
    activeStronghold = stronghold;
    activeStore = store;
    initialized = true;
  } finally {
    if (!initialized) {
      await stronghold.unload().catch(() => undefined);
      await remove(snapshotRelativePath(), { baseDir: BaseDirectory.AppData }).catch(() => undefined);
    }
  }
}

export async function unlockLocalVault(password: string): Promise<void> {
  if (activeStronghold) return;
  if (await getVaultState() !== "locked") {
    throw new Error("Bu cihazda açılacak bir kasa bulunamadı.");
  }

  const stronghold = await Stronghold.load(await snapshotPath(), password);
  try {
    const client = await stronghold.loadClient(CLIENT_NAME);
    const store = client.getStore() as StoreLike;
    const metadata = await readJson<{ formatVersion: number }>(store, STORE_META_KEY);
    if (!metadata || metadata.formatVersion !== VAULT_FORMAT_VERSION) {
      throw new Error("Kasa sürümü tanınmıyor veya kasa doğrulanamadı.");
    }
    const ids = await readJson<string[]>(store, STORE_AUDIO_INDEX_KEY);
    if (!Array.isArray(ids)) throw new Error("Kasa materyal listesi bozuk.");
    for (const fileId of ids) assertVaultFileId(fileId);

    activeStronghold = stronghold;
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
  activeStore = null;
  await stronghold.unload();
}

export async function listStoredAudio(): Promise<VaultAudioMetadata[]> {
  const store = requireStore();
  const ids = await readJson<string[]>(store, STORE_AUDIO_INDEX_KEY);
  if (!Array.isArray(ids)) throw new Error("Kasa materyal listesi bozuk.");

  const records: VaultAudioMetadata[] = [];
  for (const fileId of ids) {
    assertVaultFileId(fileId);
    const metadata = await readJson<VaultAudioMetadata>(store, audioMetaKey(fileId));
    if (!metadata) throw new Error("Kasa materyal listesinde kaydı bulunmayan dosya var.");
    validateMetadata(metadata);
    records.push(metadata);
  }
  return records;
}

export async function saveStoredAudioMetadata(metadata: VaultAudioMetadata): Promise<void> {
  const store = requireStore();
  validateMetadata(metadata);
  if (!(await store.get(audioKeyKey(metadata.fileId)))) {
    throw new Error("Ses dosyasının kasa anahtarı bulunamadı.");
  }
  await writeJson(store, audioMetaKey(metadata.fileId), metadata);
  await requireStronghold().save();
}

export async function importAudioToVault(file: File): Promise<VaultAudioMetadata> {
  const store = requireStore();
  const stronghold = requireStronghold();
  if (file.size <= 0) throw new Error("Boş ses dosyası kasaya alınamaz.");
  if (file.size > MAX_VAULT_AUDIO_BYTES) {
    throw new Error("Bu önizlemede tek ses dosyası 128 MiB sınırını aşamaz.");
  }

  await mkdir(MATERIALS_DIR, { baseDir: BaseDirectory.AppData, recursive: true });
  const fileId = crypto.randomUUID().replaceAll("-", "").toLowerCase();
  const noncePrefix = createVaultNoncePrefix();
  const rawKey = createVaultFileKeyBytes();
  const chunkCount = Math.ceil(file.size / VAULT_CHUNK_SIZE);
  const partPath = audioRelativePath(fileId, "part");
  const finalPath = audioRelativePath(fileId, "mhn");
  let fileHandle: Awaited<ReturnType<typeof open>> | null = null;
  let renamed = false;
  let metadataSaved = false;

  try {
    const key = await importVaultFileKey(rawKey);
    fileHandle = await open(partPath, {
      write: true,
      create: true,
      truncate: true,
      baseDir: BaseDirectory.AppData,
    });
    await fileHandle.write(buildVaultHeader());

    for (let index = 0; index < chunkCount; index += 1) {
      const start = index * VAULT_CHUNK_SIZE;
      const end = Math.min(file.size, start + VAULT_CHUNK_SIZE);
      const plaintext = new Uint8Array(await file.slice(start, end).arrayBuffer());
      try {
        const ciphertext = await encryptVaultChunk(key, fileId, noncePrefix, index, plaintext);
        await fileHandle.write(ciphertext);
        ciphertext.fill(0);
      } finally {
        plaintext.fill(0);
      }
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
      chunkSize: VAULT_CHUNK_SIZE,
      chunkCount,
      noncePrefix: Array.from(noncePrefix),
      durationSeconds: null,
      sha256Preview: null,
      segments: [],
      formatVersion: VAULT_FORMAT_VERSION,
    };

    await store.insert(audioKeyKey(fileId), Array.from(rawKey));
    await writeJson(store, audioMetaKey(fileId), metadata);
    const ids = await readJson<string[]>(store, STORE_AUDIO_INDEX_KEY);
    if (!Array.isArray(ids)) throw new Error("Kasa materyal listesi bozuk.");
    await writeJson(store, STORE_AUDIO_INDEX_KEY, [...ids, fileId]);
    await stronghold.save();
    metadataSaved = true;
    return metadata;
  } catch (error) {
    if (fileHandle) await fileHandle.close().catch(() => undefined);
    await store.remove(audioKeyKey(fileId)).catch(() => undefined);
    await store.remove(audioMetaKey(fileId)).catch(() => undefined);
    const ids = await readJson<string[]>(store, STORE_AUDIO_INDEX_KEY).catch(() => null);
    if (Array.isArray(ids)) {
      await writeJson(store, STORE_AUDIO_INDEX_KEY, ids.filter((id) => id !== fileId)).catch(() => undefined);
      await stronghold.save().catch(() => undefined);
    }
    if (renamed) {
      await remove(finalPath, { baseDir: BaseDirectory.AppData }).catch(() => undefined);
    } else {
      await remove(partPath, { baseDir: BaseDirectory.AppData }).catch(() => undefined);
    }
    throw error;
  } finally {
    rawKey.fill(0);
    noncePrefix.fill(0);
    void metadataSaved;
  }
}

export async function openStoredAudio(metadata: VaultAudioMetadata): Promise<File> {
  const store = requireStore();
  validateMetadata(metadata);
  const rawKey = await store.get(audioKeyKey(metadata.fileId));
  if (!rawKey || rawKey.byteLength !== 32) {
    rawKey?.fill(0);
    throw new Error("Ses dosyasının şifreleme anahtarı bulunamadı.");
  }

  let fileBytes: Uint8Array | null = null;
  const plaintextChunks: Uint8Array<ArrayBuffer>[] = [];
  try {
    fileBytes = await readFile(audioRelativePath(metadata.fileId, "mhn"), {
      baseDir: BaseDirectory.AppData,
    });
    verifyVaultHeader(fileBytes);
    const expectedBytes = expectedVaultCiphertextSize(metadata.sizeBytes);
    if (fileBytes.byteLength !== expectedBytes) {
      throw new Error("Şifreli ses dosyasının uzunluğu doğrulanamadı.");
    }

    const key = await importVaultFileKey(rawKey);
    const prefix = new Uint8Array(metadata.noncePrefix);
    let offset = 13;
    for (let index = 0; index < metadata.chunkCount; index += 1) {
      const plainLength = Math.min(
        VAULT_CHUNK_SIZE,
        metadata.sizeBytes - index * VAULT_CHUNK_SIZE,
      );
      const cipherLength = plainLength + VAULT_AUTH_TAG_BYTES;
      const ciphertext = fileBytes.slice(offset, offset + cipherLength);
      const plaintext = await decryptVaultChunk(
        key,
        metadata.fileId,
        prefix,
        index,
        plainLength,
        ciphertext,
      );
      plaintextChunks.push(plaintext);
      ciphertext.fill(0);
      offset += cipherLength;
    }

    return new File(plaintextChunks, metadata.fileName, {
      type: metadata.mediaType,
      lastModified: metadata.lastModified,
    });
  } catch {
    throw new Error("Ses dosyasının şifreli blokları doğrulanamadı veya dosya bozuk.");
  } finally {
    rawKey.fill(0);
    fileBytes?.fill(0);
    for (const chunk of plaintextChunks) chunk.fill(0);
  }
}

export async function deleteStoredAudio(fileId: string): Promise<void> {
  const store = requireStore();
  const stronghold = requireStronghold();
  assertVaultFileId(fileId);
  const ids = await readJson<string[]>(store, STORE_AUDIO_INDEX_KEY);
  if (!Array.isArray(ids)) throw new Error("Kasa materyal listesi bozuk.");
  if (!ids.includes(fileId)) return;

  await store.remove(audioKeyKey(fileId));
  await store.remove(audioMetaKey(fileId));
  await writeJson(store, STORE_AUDIO_INDEX_KEY, ids.filter((id) => id !== fileId));
  await stronghold.save();
  // Anahtar ve katalog kaydı kalıcı biçimde kaldırıldıktan sonra şifreli dosya temizlenir.
  await remove(audioRelativePath(fileId, "mhn"), { baseDir: BaseDirectory.AppData }).catch(() => undefined);
}
