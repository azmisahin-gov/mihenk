import type { AudioRecord } from "./audio.ts";
import { formatBytes, formatTime } from "./audio.ts";
import type { AssignmentRecord } from "./assignment.ts";

export interface TranscriptExport {
  schemaVersion: "0.2";
  prototype: true;
  exportedAt: string;
  assignment?: Pick<
    AssignmentRecord,
    "name" | "localReference" | "authority" | "appointedAt" | "dueAt" | "scope" | "questions"
  >;
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

function sourceForExport(record: AudioRecord): TranscriptExport["source"] {
  return {
    fileName: record.vaultMetadata?.fileName ?? record.file.name,
    mediaType: record.vaultMetadata?.mediaType ?? record.file.type ?? "bilinmiyor",
    sizeBytes: record.vaultMetadata?.sizeBytes ?? record.file.size,
    durationSeconds: record.durationSeconds ?? record.vaultMetadata?.durationSeconds ?? null,
    sha256Preview: record.vaultMetadata?.sha256Preview ?? record.sha256 ?? null,
  };
}

export function buildTranscriptExport(
  record: AudioRecord,
  assignment?: AssignmentRecord | null,
): TranscriptExport {
  return {
    schemaVersion: "0.2",
    prototype: true,
    exportedAt: new Date().toISOString(),
    ...(assignment ? {
      assignment: {
        name: assignment.name,
        localReference: assignment.localReference,
        authority: assignment.authority,
        appointedAt: assignment.appointedAt,
        dueAt: assignment.dueAt,
        scope: assignment.scope,
        questions: [...assignment.questions],
      },
    } : {}),
    source: sourceForExport(record),
    notice: "Bu çıktı prototip çalışma taslağıdır; doğrulanmış bilirkişi transkripti, delil zinciri kaydı veya resmî teslim değildir.",
    segments: record.segments,
  };
}

export function buildTranscriptText(
  record: AudioRecord,
  assignment?: AssignmentRecord | null,
): string {
  const source = sourceForExport(record);
  const lines = [
    "MİHENK 56.12 — TRANSKRİPSİYON TASLAĞI",
    "Durum: Prototip / uzman kontrolü bekliyor",
    ...(assignment ? [
      "",
      "GÖREV / ATAMA",
      "Görev alanı: " + assignment.name,
      "Yerel dosya referansı: " + (assignment.localReference || "Belirtilmedi"),
      "Atama mercii: " + (assignment.authority || "Belirtilmedi"),
      "Görevlendirme tarihi: " + (assignment.appointedAt || "Belirtilmedi"),
      "Son tarih: " + (assignment.dueAt || "Belirtilmedi"),
      "İnceleme kapsamı: " + (assignment.scope || "Belirtilmedi"),
      "İnceleme soruları:",
      ...(assignment.questions.length > 0
        ? assignment.questions.map((question, index) => (index + 1) + ". " + question)
        : ["Henüz girilmedi."]),
    ] : []),
    "",
    "KAYNAK SES",
    "Kaynak dosya: " + source.fileName,
    "Medya türü: " + source.mediaType,
    "Dosya boyutu: " + formatBytes(source.sizeBytes),
    "Süre: " + formatTime(source.durationSeconds),
    "SHA-256 ön kontrolü: " + (source.sha256Preview ?? "hesaplanmadı"),
    "Hash notu: Bu değer tek başına delil zinciri veya özgünlük kanıtı değildir.",
    "",
    "NOT: Bu çıktı prototip taslağıdır. Nihai bilirkişi transkripti, onaylı rapor veya resmî teslim kaydı değildir.",
    "",
  ];

  for (const segment of record.segments) {
    const status = segment.status === "belirsiz"
      ? " [BELİRSİZ]"
      : segment.status === "uzman-onayli"
        ? " [UZMAN KONTROLÜ]"
        : " [TASLAK]";
    const content = segment.text.trim() || "[Metin girilmedi]";
    lines.push(
      "[" + formatTime(segment.startSeconds) +
      (segment.endSeconds === null ? "" : " – " + formatTime(segment.endSeconds)) +
      "] " + segment.speaker + status + ": " + content,
    );
  }

  return lines.join("\n") + "\n";
}
