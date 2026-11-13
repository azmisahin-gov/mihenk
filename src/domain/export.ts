import type { AudioRecord } from "./audio";
import { formatTime } from "./audio";

export interface TranscriptExport {
  schemaVersion: "0.1";
  prototype: true;
  exportedAt: string;
  source: {
    fileName: string;
    mediaType: string;
    sizeBytes: number;
    durationSeconds: number | null;
    sha256Preview: string | null;
  };
  notice: string;
  segments: AudioRecord["segments"];
}

export function buildTranscriptExport(record: AudioRecord): TranscriptExport {
  return {
    schemaVersion: "0.1",
    prototype: true,
    exportedAt: new Date().toISOString(),
    source: {
      fileName: record.file.name,
      mediaType: record.file.type || "bilinmiyor",
      sizeBytes: record.file.size,
      durationSeconds: record.durationSeconds,
      sha256Preview: record.sha256,
    },
    notice: "Bu çıktı prototip taslağıdır; doğrulanmış bilirkişi transkripti veya delil zinciri kaydı değildir.",
    segments: record.segments,
  };
}

export function buildTranscriptText(record: AudioRecord): string {
  const lines = [
    "MİHENK 56.12 — TRANSKRİPSİYON TASLAĞI",
    "Durum: Prototip / uzman kontrolü bekliyor",
    `Kaynak dosya: ${record.file.name}`,
    `Süre: ${formatTime(record.durationSeconds)}`,
    `SHA-256 ön kontrolü: ${record.sha256 ?? "hesaplanmadı"}`,
    "",
    "NOT: Bu çıktı prototip taslağıdır. Nihai bilirkişi transkripti veya delil zinciri kaydı değildir.",
    "",
  ];

  for (const segment of record.segments) {
    const status = segment.status === "belirsiz"
      ? " [BELİRSİZ]"
      : segment.status === "uzman-onayli"
        ? " [UZMAN KONTROLÜ]"
        : "";
    const content = segment.text.trim() || "[Metin girilmedi]";
    lines.push(`[${formatTime(segment.startSeconds)}] ${segment.speaker}${status}: ${content}`);
  }

  return lines.join("\n") + "\n";
}
