export type SegmentStatus = "taslak" | "belirsiz" | "uzman-onayli";

export interface TranscriptSegment {
  id: string;
  startSeconds: number;
  endSeconds: number | null;
  text: string;
  speaker: string;
  status: SegmentStatus;
}

export type HashState = "bekliyor" | "hesaplaniyor" | "hesaplandi" | "buyuk-dosya" | "desteklenmiyor" | "hata";

export interface AudioRecord {
  id: string;
  file: File;
  objectUrl: string;
  durationSeconds: number | null;
  sha256: string | null;
  hashState: HashState;
  segments: TranscriptSegment[];
}

export const MAX_PREVIEW_HASH_BYTES = 128 * 1024 * 1024;

export function formatTime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return "00:00";
  }

  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;

  if (hours > 0) {
    return [hours, minutes, remainder].map((part) => String(part).padStart(2, "0")).join(":");
  }

  return [minutes, remainder].map((part) => String(part).padStart(2, "0")).join(":");
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;

  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

export function createSegment(startSeconds: number): TranscriptSegment {
  return {
    id: crypto.randomUUID(),
    startSeconds: Math.max(0, startSeconds),
    endSeconds: null,
    text: "",
    speaker: "Konuşmacı 1",
    status: "taslak",
  };
}

/**
 * Prototipte yalnızca küçük dosyalar için ön kontrol amaçlı hash üretir.
 * Büyük dosyalarda tam dosyayı belleğe almaz; yerel akışlı hash servisi sonraki aşamadır.
 */
export async function calculatePreviewHash(
  file: File,
): Promise<{ state: HashState; hash: string | null }> {
  if (file.size > MAX_PREVIEW_HASH_BYTES) {
    return { state: "buyuk-dosya", hash: null };
  }

  if (!globalThis.crypto?.subtle) {
    return { state: "desteklenmiyor", hash: null };
  }

  try {
    const bytes = await file.arrayBuffer();
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    const hash = Array.from(new Uint8Array(digest))
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");

    return { state: "hesaplandi", hash };
  } catch {
    return { state: "hata", hash: null };
  }
}

export function safeFileStem(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[^.]+$/, "");
  const safe = withoutExtension
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}_-]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);

  return safe || "ses_kaydi";
}
