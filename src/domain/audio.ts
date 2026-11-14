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

import type { VaultAudioMetadata } from "./vault";
import { Sha256 } from "./sha256.ts";

export interface AudioRecord {
  id: string;
  file: File;
  objectUrl: string;
  durationSeconds: number | null;
  sha256: string | null;
  hashState: HashState;
  segments: TranscriptSegment[];
  vaultMetadata?: VaultAudioMetadata;
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

/**
 * Ses oynatıcısının işaretli aralığın sonuna ulaşıp ulaşmadığını belirler.
 * Geçerli aralıkta son noktaya gelince başlangıç saniyesini döndürür.
 */
export function repeatStartIfReached(
  currentSeconds: number,
  startSeconds: number,
  endSeconds: number,
): number | null {
  if (
    !Number.isFinite(currentSeconds) ||
    !Number.isFinite(startSeconds) ||
    !Number.isFinite(endSeconds) ||
    startSeconds < 0 ||
    endSeconds <= startSeconds
  ) {
    return null;
  }

  return currentSeconds >= endSeconds ? startSeconds : null;
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
 * Dosyayı 1 MiB parçalar halinde okuyarak SHA-256 ön kontrolü üretir.
 * Bellekte hiçbir zaman dosyanın tamamı tutulmaz. 128 MiB sınırı,
 * büyük dosyaların mevcut oynatma ve yedekleme yolları da akışlı hale
 * getirilene kadar güvenlik sınırı olarak korunur.
 */
export async function calculatePreviewHash(
  file: File,
): Promise<{ state: HashState; hash: string | null }> {
  if (!Number.isSafeInteger(file.size) || file.size < 0) {
    return { state: "hata", hash: null };
  }
  if (file.size > MAX_PREVIEW_HASH_BYTES) {
    return { state: "buyuk-dosya", hash: null };
  }

  try {
    const hasher = new Sha256();
    const chunkSize = 1024 * 1024;
    for (let offset = 0; offset < file.size; offset += chunkSize) {
      const end = Math.min(file.size, offset + chunkSize);
      const bytes = new Uint8Array(await file.slice(offset, end).arrayBuffer());
      try {
        if (bytes.byteLength !== end - offset) {
          throw new Error("Ses dosyası parçası eksik okundu.");
        }
        hasher.update(bytes);
      } finally {
        bytes.fill(0);
      }
    }
    return { state: "hesaplandi", hash: hasher.digestHex() };
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
