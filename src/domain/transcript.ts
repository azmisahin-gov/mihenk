export interface TranscriptRevisionSnapshot {
  startSeconds: number;
  endSeconds: number | null;
  text: string;
  speaker: string;
  status: string;
}

export interface TranscriptRevisionEvent {
  id: string;
  changedAt: string;
  /** Null until the application has a configured local expert identity. */
  editorId: string | null;
  reason: string;
  before: TranscriptRevisionSnapshot;
  after: TranscriptRevisionSnapshot;
}

export interface VersionedTranscriptSegment {
  id: string;
  startSeconds: number;
  endSeconds: number | null;
  text: string;
  speaker: string;
  status: string;
  source?: "asr" | "uzman";
  /** Immutable machine output captured before the first expert edit. */
  rawAsrText?: string;
  revisions?: TranscriptRevisionEvent[];
}

export interface TranscriptEditOptions {
  changedAt?: string;
  editorId?: string | null;
}

const REVISION_COALESCE_WINDOW_MS = 1_500;

function snapshot(segment: VersionedTranscriptSegment): TranscriptRevisionSnapshot {
  return {
    startSeconds: segment.startSeconds,
    endSeconds: segment.endSeconds,
    text: segment.text,
    speaker: segment.speaker,
    status: segment.status,
  };
}

function sameSnapshot(
  left: TranscriptRevisionSnapshot,
  right: TranscriptRevisionSnapshot,
): boolean {
  return left.startSeconds === right.startSeconds
    && left.endSeconds === right.endSeconds
    && left.text === right.text
    && left.speaker === right.speaker
    && left.status === right.status;
}

function revisionReason(
  before: TranscriptRevisionSnapshot,
  after: TranscriptRevisionSnapshot,
): string {
  const changes: string[] = [];
  if (before.text !== after.text) changes.push("Metin düzeltmesi");
  if (before.speaker !== after.speaker) changes.push("Anonim konuşmacı etiketi değişikliği");
  if (before.startSeconds !== after.startSeconds || before.endSeconds !== after.endSeconds) {
    changes.push("Zaman aralığı değişikliği");
  }
  if (before.status !== after.status) changes.push("Kontrol durumu değişikliği");
  return changes.join(" · ");
}

/**
 * Keeps the machine source immutable and appends a before/after audit event
 * whenever an expert changes text, speaker, timing, or review status.
 * Consecutive keystrokes in the same field are coalesced into one edit event.
 */
export function recordTranscriptEdit<T extends VersionedTranscriptSegment>(
  previous: T,
  next: T,
  options: TranscriptEditOptions = {},
): T {
  const before = snapshot(previous);
  const after = snapshot(next);
  const rawAsrText = previous.rawAsrText
    ?? (previous.source === "asr" ? previous.text : next.rawAsrText);
  const source = previous.source ?? "uzman";
  const revisions = previous.revisions ?? [];

  if (sameSnapshot(before, after)) {
    return {
      ...next,
      source,
      ...(rawAsrText === undefined ? {} : { rawAsrText }),
      revisions,
    };
  }

  const changedAt = options.changedAt ?? new Date().toISOString();
  const changedAtMs = Date.parse(changedAt);
  if (!Number.isFinite(changedAtMs)) {
    throw new Error("Transkript değişiklik zamanı geçerli bir ISO tarih olmalıdır.");
  }
  const editorId = options.editorId ?? null;
  const reason = revisionReason(before, after);
  const last = revisions[revisions.length - 1];
  const lastChangedAtMs = last ? Date.parse(last.changedAt) : Number.NaN;
  const elapsed = changedAtMs - lastChangedAtMs;
  const canCoalesce = Boolean(
    last
    && last.reason === reason
    && last.editorId === editorId
    && elapsed >= 0
    && elapsed <= REVISION_COALESCE_WINDOW_MS
    && sameSnapshot(last.after, before),
  );

  let updatedRevisions: TranscriptRevisionEvent[];
  if (canCoalesce && last) {
    updatedRevisions = [
      ...revisions.slice(0, -1),
      { ...last, changedAt, after },
    ];
  } else {
    updatedRevisions = [
      ...revisions,
      {
        id: crypto.randomUUID(),
        changedAt,
        editorId,
        reason,
        before,
        after,
      },
    ];
  }

  return {
    ...next,
    source,
    ...(rawAsrText === undefined ? {} : { rawAsrText }),
    revisions: updatedRevisions,
  };
}

/**
 * Resolves the transcript interval at the current playback position.
 * When a segment has no explicit end, the next segment start forms its
 * provisional boundary; the final open-ended segment remains active to EOF.
 */
export function findActiveTranscriptSegmentId(
  segments: ReadonlyArray<Pick<VersionedTranscriptSegment, "id" | "startSeconds" | "endSeconds">>,
  currentSeconds: number,
): string | null {
  if (!Number.isFinite(currentSeconds) || currentSeconds < 0 || segments.length === 0) {
    return null;
  }

  const ordered = [...segments].sort((left, right) => (
    left.startSeconds - right.startSeconds || left.id.localeCompare(right.id)
  ));

  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const segment = ordered[index];
    if (!Number.isFinite(segment.startSeconds) || segment.startSeconds < 0) continue;
    if (currentSeconds < segment.startSeconds) continue;

    const nextStart = ordered[index + 1]?.startSeconds;
    const endSeconds = segment.endSeconds !== null
      ? segment.endSeconds
      : (nextStart !== undefined && nextStart > segment.startSeconds
          ? nextStart
          : Number.POSITIVE_INFINITY);

    if (endSeconds > segment.startSeconds && currentSeconds < endSeconds) {
      return segment.id;
    }
  }

  return null;
}

/**
 * Replaces untouched machine drafts with a new run while retaining every
 * human-authored segment and every machine segment that has an expert edit.
 */
export function mergeAsrTranscriptSegments<T extends VersionedTranscriptSegment>(
  existing: T[],
  generated: T[],
): T[] {
  const retained = existing.filter((segment) => (
    segment.source !== "asr" || (segment.revisions?.length ?? 0) > 0
  ));
  const fresh = generated.map((segment) => ({
    ...segment,
    source: "asr" as const,
    rawAsrText: segment.text,
    revisions: [],
  }) as T);

  return [...retained, ...fresh].sort((left, right) => left.startSeconds - right.startSeconds);
}
