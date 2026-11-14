import { appDataDir, join } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";
import {
  BaseDirectory,
  exists,
  mkdir,
  open,
  remove,
  rename,
} from "@tauri-apps/plugin-fs";
import { Stronghold } from "@tauri-apps/plugin-stronghold";
import {
  assertUniqueAssignmentName,
  createAssignmentRecord,
  isValidAssignmentId,
  normalizeAssignmentName,
  normalizeAssignmentProfile,
  resolveStoredAssignmentId,
  DEFAULT_ASSIGNMENT_NAME,
  type AssignmentRecord,
  type AssignmentProfileInput,
} from "./assignment";
import {
  MAX_VAULT_AUDIO_BYTES,
  VAULT_CHUNK_SIZE,
  VAULT_FORMAT_VERSION,
  buildVaultHeader,
  createVaultFileKeyBytes,
  createVaultNoncePrefix,
  encryptVaultChunk,
  importVaultFileKey,
 } from "./vault-crypto";
import { readFileChunks } from "./file-chunks.ts";
import { Sha256 } from "./sha256.ts";
import type { TranscriptAnnotationType, TranscriptRevisionEvent } from "./transcript";

const VAULT_DIR = "mihenk-vault";
const MATERIALS_DIR = `${VAULT_DIR}/materials`;
const SNAPSHOT_NAME = "secure.hold";
const CLIENT_NAME = "mihenk-main";
const STORE_META_KEY = "mihenk:vault:meta";
const STORE_AUDIO_INDEX_KEY = "mihenk:vault:audio-index";
const STORE_ASSIGNMENT_INDEX_KEY = "mihenk:vault:assignment-index";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

interface StoreLike {
  get(key: string): Promise<Uint8Array | null>;
  insert(key: string, value: number[]): Promise<void>;
  remove(key: string): Promise<Uint8Array | null>;
}

type StrongholdInstance = Awaited<ReturnType<typeof Stronghold.load>>;

export type VaultState = "not-created" | "locked" | "unlocked";

export type VaultAssignment = AssignmentRecord;

export interface VaultAudioMetadata {
  fileId: string;
  assignmentId: string;
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
    channel?: string | null;
    speaker: string;
    annotationType?: TranscriptAnnotationType;
    status: "taslak" | "belirsiz" | "uzman-onayli";
    source?: "asr" | "uzman";
    rawAsrText?: string;
    revisions?: TranscriptRevisionEvent[];
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

async function readAssignments(
  store: StoreLike,
  stronghold?: StrongholdInstance,
): Promise<AssignmentRecord[]> {
  const ids = await readJson<string[]>(store, STORE_ASSIGNMENT_INDEX_KEY);
  if (!Array.isArray(ids) || new Set(ids).size !== ids.length) {
    throw new Error("Kasa görev alanı listesi bozuk.");
  }

  const assignments: AssignmentRecord[] = [];
  let migrated = false;
  for (const id of ids) {
    assertVaultAssignmentId(id);
    const stored = await readJson<Partial<AssignmentRecord>>(store, assignmentMetaKey(id));
    if (!stored || stored.id !== id || typeof stored.name !== "string") {
      throw new Error("Kasa görev alanı kaydı eksik veya bozuk.");
    }
    const base: AssignmentRecord = {
      id,
      name: normalizeAssignmentName(stored.name),
      localReference: typeof stored.localReference === "string" ? stored.localReference : "",
      authority: typeof stored.authority === "string" ? stored.authority : "",
      appointedAt: typeof stored.appointedAt === "string" ? stored.appointedAt : "",
      dueAt: typeof stored.dueAt === "string" ? stored.dueAt : "",
      scope: typeof stored.scope === "string" ? stored.scope : "",
      questions: Array.isArray(stored.questions) && stored.questions.every((item) => typeof item === "string")
        ? stored.questions
        : [],
      createdAt: typeof stored.createdAt === "string" ? stored.createdAt : new Date(0).toISOString(),
      updatedAt: typeof stored.updatedAt === "string" ? stored.updatedAt : new Date(0).toISOString(),
    };
    if (
      !Number.isFinite(Date.parse(base.createdAt)) ||
      !Number.isFinite(Date.parse(base.updatedAt))
    ) {
      throw new Error("Kasa görev alanı tarih bilgileri geçersiz.");
    }

    const normalizedProfile = normalizeAssignmentProfile(base, base);
    const assignment: AssignmentRecord = {
      ...normalizedProfile,
      updatedAt: base.updatedAt,
    };
    if (JSON.stringify(assignment) !== JSON.stringify(stored)) {
      await writeJson(store, assignmentMetaKey(id), assignment);
      migrated = true;
    }

    assertUniqueAssignmentName(assignment.name, assignments);
    assignments.push(assignment);
  }
  if (migrated && stronghold) await stronghold.save();
  return assignments;
}
/**
 * Eski düz kayıt kasalarını varsayılan bir görev alanına taşır.
 * Görev kimliği bulunmayan eski ses kayıtları bu alana bağlanır; içerikleri
 * veya şifreleme anahtarları değiştirilmez.
 */
async function ensureAssignmentRecords(
  stronghold: StrongholdInstance,
  store: StoreLike,
): Promise<AssignmentRecord[]> {
  let changed = false;
  let ids = await readJson<string[]>(store, STORE_ASSIGNMENT_INDEX_KEY);
  if (!Array.isArray(ids)) ids = [];

  let assignments: AssignmentRecord[] = [];
  if (ids.length > 0) {
    assignments = await readAssignments(store, stronghold);
  }
  if (assignments.length === 0) {
    const defaultAssignment = createAssignmentRecord(DEFAULT_ASSIGNMENT_NAME);
    await writeJson(store, assignmentMetaKey(defaultAssignment.id), defaultAssignment);
    ids = [defaultAssignment.id];
    await writeJson(store, STORE_ASSIGNMENT_INDEX_KEY, ids);
    assignments = [defaultAssignment];
    changed = true;
  }

  const defaultAssignment = assignments[0];
  const audioIds = await readJson<string[]>(store, STORE_AUDIO_INDEX_KEY);
  if (!Array.isArray(audioIds)) throw new Error("Kasa materyal listesi bozuk.");
  const assignmentIds = new Set(assignments.map((assignment) => assignment.id));

  for (const fileId of audioIds) {
    assertVaultFileId(fileId);
    const metadata = await readJson<(Omit<VaultAudioMetadata, "assignmentId"> & { assignmentId?: string })>(
      store,
      audioMetaKey(fileId),
    );
    if (!metadata) throw new Error("Kasa materyal listesinde kaydı bulunmayan dosya var.");

    const resolvedAssignmentId = resolveStoredAssignmentId(
      metadata.assignmentId,
      [...assignmentIds],
      defaultAssignment.id,
    );
    if (metadata.assignmentId !== resolvedAssignmentId) {
      const migrated = { ...metadata, assignmentId: resolvedAssignmentId } as VaultAudioMetadata;
      validateMetadata(migrated);
      await writeJson(store, audioMetaKey(fileId), migrated);
      changed = true;
    } else {
      validateMetadata(metadata as VaultAudioMetadata);
    }
  }

  if (changed) await stronghold.save();
  return assignments;
}

function audioMetaKey(fileId: string): string {
  return `mihenk:audio:meta:${fileId}`;
}

function assignmentMetaKey(assignmentId: string): string {
  return `mihenk:assignment:meta:${assignmentId}`;
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

export function assertVaultAssignmentId(assignmentId: string): void {
  if (!isValidAssignmentId(assignmentId)) {
    throw new Error("Görev alanı kimliği geçersiz.");
  }
}

function validateMetadata(meta: VaultAudioMetadata): void {
  if (
    !meta ||
    typeof meta !== "object" ||
    !Array.isArray(meta.noncePrefix) ||
    !Array.isArray(meta.segments)
  ) {
    throw new Error("Şifreli ses kaydının üst verisi geçersiz veya desteklenmiyor.");
  }
  assertVaultFileId(meta.fileId);
  assertVaultAssignmentId(meta.assignmentId);
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
    typeof meta.mediaType !== "string"
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
    const defaultAssignment = createAssignmentRecord(DEFAULT_ASSIGNMENT_NAME);
    await writeJson(store, assignmentMetaKey(defaultAssignment.id), defaultAssignment);
    await writeJson(store, STORE_ASSIGNMENT_INDEX_KEY, [defaultAssignment.id]);
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

    await ensureAssignmentRecords(stronghold, store);
    activeStronghold = stronghold;
    activeStore = store;
  } catch {
    await stronghold.unload().catch(() => undefined);
    throw new Error("Kasa açılamadı. Parola yanlış veya kasa dosyası bozuk olabilir.");
  }
}

export async function lockLocalVault(): Promise<void> {
  await clearStoredAudioPlaybackSessions();
  if (!activeStronghold) return;
  const stronghold = activeStronghold;
  await stronghold.unload();
  activeStronghold = null;
  activeStore = null;
}

export async function listAssignments(): Promise<VaultAssignment[]> {
  return readAssignments(requireStore(), requireStronghold());
}

export async function createVaultAssignment(name: string): Promise<VaultAssignment> {
  const store = requireStore();
  const stronghold = requireStronghold();
  const assignments = await readAssignments(store, stronghold);
  const normalizedName = normalizeAssignmentName(name);
  assertUniqueAssignmentName(normalizedName, assignments);
  const assignment = createAssignmentRecord(normalizedName);
  await writeJson(store, assignmentMetaKey(assignment.id), assignment);
  try {
    await writeJson(store, STORE_ASSIGNMENT_INDEX_KEY, [...assignments.map((item) => item.id), assignment.id]);
    await stronghold.save();
    return assignment;
  } catch (error) {
    await writeJson(store, STORE_ASSIGNMENT_INDEX_KEY, assignments.map((item) => item.id)).catch(() => undefined);
    await store.remove(assignmentMetaKey(assignment.id)).catch(() => undefined);
    await stronghold.save().catch(() => undefined);
    throw error;
  }
}

export async function renameVaultAssignment(assignmentId: string, name: string): Promise<VaultAssignment> {
  const currentAssignments = await listAssignments();
  const current = currentAssignments.find((item) => item.id === assignmentId);
  if (!current) throw new Error("Görev alanı bulunamadı.");
  return updateVaultAssignment(assignmentId, { ...current, name });
}

export async function updateVaultAssignment(
  assignmentId: string,
  input: AssignmentProfileInput,
): Promise<VaultAssignment> {
  const store = requireStore();
  const stronghold = requireStronghold();
  assertVaultAssignmentId(assignmentId);
  const assignments = await readAssignments(store, stronghold);
  const current = assignments.find((item) => item.id === assignmentId);
  if (!current) throw new Error("Görev alanı bulunamadı.");
  const updated = normalizeAssignmentProfile(current, input);
  assertUniqueAssignmentName(updated.name, assignments, assignmentId);
  await writeJson(store, assignmentMetaKey(assignmentId), updated);
  try {
    await stronghold.save();
    return updated;
  } catch (error) {
    await writeJson(store, assignmentMetaKey(assignmentId), current).catch(() => undefined);
    await stronghold.save().catch(() => undefined);
    throw error;
  }
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
    const segments = metadata.segments.map((segment) => {
      const legacyAsrChannel = segment.source === "asr"
        && !segment.channel
        && /^Kanal \\d+$/.test(segment.speaker);
      return {
        ...segment,
        ...(legacyAsrChannel ? { channel: segment.speaker, speaker: "" } : {}),
        ...(segment.source === "asr" && segment.rawAsrText === undefined
          ? { rawAsrText: segment.text }
          : {}),
        annotationType: segment.annotationType ?? "speech",
      };
    });
    records.push({ ...metadata, segments });
  }
  return records;
}

export async function saveStoredAudioMetadata(metadata: VaultAudioMetadata): Promise<void> {
  const store = requireStore();
  validateMetadata(metadata);
  const assignments = await readAssignments(store, requireStronghold());
  if (!assignments.some((assignment) => assignment.id === metadata.assignmentId)) {
    throw new Error("Ses kaydının bağlı olduğu görev alanı bulunamadı.");
  }
  if (!(await store.get(audioKeyKey(metadata.fileId)))) {
    throw new Error("Ses dosyasının kasa anahtarı bulunamadı.");
  }
  await writeJson(store, audioMetaKey(metadata.fileId), metadata);
  await requireStronghold().save();
}

export async function importAudioToVault(file: File, assignmentId: string): Promise<VaultAudioMetadata> {
  const store = requireStore();
  const stronghold = requireStronghold();
  assertVaultAssignmentId(assignmentId);
  const assignments = await readAssignments(store, stronghold);
  if (!assignments.some((assignment) => assignment.id === assignmentId)) {
    throw new Error("Ses dosyasının ekleneceği görev alanı bulunamadı.");
  }
  if (file.size <= 0) throw new Error("Boş ses dosyası kasaya alınamaz.");
  if (file.size > MAX_VAULT_AUDIO_BYTES) {
    throw new Error("Tek ses dosyası 240 MiB sınırını aşamaz.");
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

  try {
    const key = await importVaultFileKey(rawKey);
    fileHandle = await open(partPath, {
      write: true,
      create: true,
      truncate: true,
      baseDir: BaseDirectory.AppData,
    });
    await fileHandle.write(buildVaultHeader());

    const sourceHasher = new Sha256();
    let writtenChunks = 0;
    for await (const plaintext of readFileChunks(file)) {
      const ciphertext = await encryptVaultChunk(key, fileId, noncePrefix, writtenChunks, plaintext);
      try {
        sourceHasher.update(plaintext);
        await fileHandle.write(ciphertext);
      } finally {
        ciphertext.fill(0);
      }
      writtenChunks += 1;
    }
    if (writtenChunks !== chunkCount) {
      throw new Error("Ses dosyasının tüm parçaları kasaya alınamadı.");
    }
    const sourceSha256 = sourceHasher.digestHex();

    await fileHandle.close();
    fileHandle = null;
    await rename(partPath, finalPath, {
      oldPathBaseDir: BaseDirectory.AppData,
      newPathBaseDir: BaseDirectory.AppData,
    });
    renamed = true;

    const readbackKey = Array.from(rawKey);
    const readbackNonce = Array.from(noncePrefix);
    try {
      const verifiedSha256 = await invoke<string>("verify_stored_audio_copy_command", {
        fileId,
        sizeBytes: file.size,
        noncePrefix: readbackNonce,
        rawKey: readbackKey,
        expectedSha256: sourceSha256,
      });
      if (verifiedSha256 !== sourceSha256) {
        throw new Error("Şifreli ses kopyasının SHA-256 doğrulaması başarısız.");
      }
    } finally {
      readbackKey.fill(0);
      readbackNonce.fill(0);
    }

    const metadata: VaultAudioMetadata = {
      fileId,
      assignmentId,
      fileName: file.name,
      mediaType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      lastModified: file.lastModified,
      chunkSize: VAULT_CHUNK_SIZE,
      chunkCount,
      noncePrefix: Array.from(noncePrefix),
      durationSeconds: null,
      sha256Preview: sourceSha256,
      segments: [],
      formatVersion: VAULT_FORMAT_VERSION,
    };

    await store.insert(audioKeyKey(fileId), Array.from(rawKey));
    await writeJson(store, audioMetaKey(fileId), metadata);
    const ids = await readJson<string[]>(store, STORE_AUDIO_INDEX_KEY);
    if (!Array.isArray(ids)) throw new Error("Kasa materyal listesi bozuk.");
    await writeJson(store, STORE_AUDIO_INDEX_KEY, [...ids, fileId]);
    await stronghold.save();
    return metadata;
  } catch (error) {
    if (fileHandle) await fileHandle.close().catch(() => undefined);
    await store.remove(audioKeyKey(fileId)).catch(() => undefined);
    await store.remove(audioMetaKey(fileId)).catch(() => undefined);
    const ids = await readJson<string[]>(store, STORE_AUDIO_INDEX_KEY).catch(() => null);
    if (Array.isArray(ids)) {
      await writeJson(store, STORE_AUDIO_INDEX_KEY, ids.filter((id) => id !== fileId)).catch(() => undefined);
    }
    await stronghold.save().catch(() => undefined);
    if (renamed) {
      await remove(finalPath, { baseDir: BaseDirectory.AppData }).catch(() => undefined);
    } else {
      await remove(partPath, { baseDir: BaseDirectory.AppData }).catch(() => undefined);
    }
    throw error;
  } finally {
    rawKey.fill(0);
    noncePrefix.fill(0);
  }
}

export interface VaultAudioPlayback {
  url: string;
  sessionId: string;
}

export interface SedaModelStatus {
  modelId: string;
  revision: string;
  license: string;
  installed: boolean;
  bytesOnDisk: number;
  message: string;
}

export interface SedaTranscriptSegment {
  id: string;
  startSeconds: number;
  endSeconds: number | null;
  text: string;
  channel: string | null;
  speaker: string;
  annotationType: TranscriptAnnotationType;
  status: "taslak";
  source: "asr";
}

export async function getSedaModelStatus(): Promise<SedaModelStatus> {
  return invoke<SedaModelStatus>("get_seda_model_status_command");
}

export async function installSedaModel(): Promise<SedaModelStatus> {
  return invoke<SedaModelStatus>("install_seda_model_command");
}

export async function transcribeStoredAudio(metadata: VaultAudioMetadata, jobId: string): Promise<SedaTranscriptSegment[]> {
  const store = requireStore();
  validateMetadata(metadata);
  if (!/^[a-f0-9]{32}$/.test(jobId)) throw new Error("ASR görev kimliği geçersiz.");
  const rawKey = await store.get(audioKeyKey(metadata.fileId));
  if (!rawKey || rawKey.byteLength !== 32) {
    rawKey?.fill(0);
    throw new Error("Ses dosyasının kasa anahtarı bulunamadı.");
  }

  const rawKeyTransfer = Array.from(rawKey);
  try {
    return await invoke<SedaTranscriptSegment[]>("transcribe_stored_audio_command", {
      fileId: metadata.fileId,
      sizeBytes: metadata.sizeBytes,
      noncePrefix: metadata.noncePrefix,
      rawKey: rawKeyTransfer,
      fileName: metadata.fileName,
      jobId,
    });
  } finally {
    rawKeyTransfer.fill(0);
    rawKey.fill(0);
  }
}

export async function openStoredAudio(metadata: VaultAudioMetadata): Promise<VaultAudioPlayback> {
  const store = requireStore();
  validateMetadata(metadata);
  const rawKey = await store.get(audioKeyKey(metadata.fileId));
  if (!rawKey || rawKey.byteLength !== 32) {
    rawKey?.fill(0);
    throw new Error("Ses dosyasının şifreleme anahtarı bulunamadı.");
  }

  const sessionId = crypto.randomUUID().replaceAll("-", "").toLowerCase();
  const rawKeyTransfer = Array.from(rawKey);
  try {
    await invoke("open_audio_playback_session", {
      sessionId,
      fileId: metadata.fileId,
      sizeBytes: metadata.sizeBytes,
      noncePrefix: metadata.noncePrefix,
      rawKey: rawKeyTransfer,
      mediaType: metadata.mediaType,
    });
    return {
      sessionId,
      url: `mihenk-audio://localhost/${sessionId}`,
    };
  } finally {
    rawKeyTransfer.fill(0);
    rawKey.fill(0);
  }
}

export async function closeStoredAudioPlaybackSession(sessionId: string): Promise<void> {
  if (!/^[a-f0-9]{32}$/.test(sessionId)) {
    throw new Error("Ses oynatma oturumu kimliği geçersiz.");
  }
  await invoke("close_audio_playback_session", { sessionId });
}

export async function clearStoredAudioPlaybackSessions(): Promise<void> {
  await invoke("clear_audio_playback_sessions");
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

/**
 * Yedek paketi yalnızca şifreli Stronghold snapshot'ını, Argon2 salt dosyasını
 * ve zaten AES-GCM ile şifrelenmiş materyal dosyalarını taşır.
 * Dış paket gerçek dosya adı veya transkript metnini açığa çıkarmaz.
 */
export async function exportLocalVaultBackup(fileName: string): Promise<boolean> {
  const stronghold = requireStronghold();
  await stronghold.save();
  return invoke<boolean>("export_local_vault_backup", { fileName });
}

/**
 * Yedek seçimi, paket doğrulaması ve disk yazımı Rust tarafında 64 KiB
 * tamponlarla yapılır. İşlem yalnızca boş kasaya izin verir.
 */
export async function restoreLocalVaultBackup(): Promise<boolean> {
  if (activeStronghold) throw new Error("Geri yüklemeden önce açık kasayı kilitleyin.");
  if (await getVaultState() !== "not-created") {
    throw new Error("Geri yükleme yalnızca bu cihazda kasa yokken yapılabilir.");
  }
  return invoke<boolean>("restore_local_vault_backup");
}

