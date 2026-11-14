export interface AssignmentRecord {
  id: string;
  name: string;
  localReference: string;
  authority: string;
  appointedAt: string;
  dueAt: string;
  scope: string;
  questions: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AssignmentProfileInput {
  name: string;
  localReference: string;
  authority: string;
  appointedAt: string;
  dueAt: string;
  scope: string;
  questions: string[];
}

export const DEFAULT_ASSIGNMENT_NAME = "Genel çalışma";
export const MAX_ASSIGNMENT_NAME_LENGTH = 100;

export function isValidAssignmentId(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{32}$/i.test(value);
}

export function normalizeAssignmentName(value: string): string {
  if (typeof value !== "string") {
    throw new Error("Görev etiketi metin olmalıdır.");
  }

  const normalizedSource = value.normalize("NFC");
  if (/[\u0000-\u001f\u007f]/u.test(normalizedSource)) {
    throw new Error("Görev etiketi kontrol karakteri içeremez.");
  }
  const normalized = normalizedSource.trim().replace(/\s+/gu, " ");
  if (!normalized) throw new Error("Görev etiketi boş olamaz.");
  if (normalized.length > MAX_ASSIGNMENT_NAME_LENGTH) {
    throw new Error(`Görev etiketi en fazla ${MAX_ASSIGNMENT_NAME_LENGTH} karakter olabilir.`);
  }
  return normalized;
}

export function normalizeAssignmentField(value: string, label: string, maxLength = 4000): string {
  if (typeof value !== "string") throw new Error(label + " metin olmalıdır.");
  const normalized = value.normalize("NFC").replace(/\r\n?/gu, "\n").trim();
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(normalized)) {
    throw new Error(label + " kontrol karakteri içeremez.");
  }
  if (normalized.length > maxLength) throw new Error(label + " en fazla " + maxLength + " karakter olabilir.");
  return normalized;
}

export function normalizeDateField(value: string, label: string): string {
  const normalized = normalizeAssignmentField(value, label, 10);
  if (normalized && !/^\d{4}-\d{2}-\d{2}$/u.test(normalized)) {
    throw new Error(label + " YYYY-AA-GG biçiminde olmalıdır.");
  }
  if (normalized) {
    const parsed = new Date(normalized + "T00:00:00.000Z");
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
      throw new Error(label + " geçerli bir tarih olmalıdır.");
    }
  }
  return normalized;
}

export function assertUniqueAssignmentName(
  candidate: string,
  assignments: readonly AssignmentRecord[],
  exceptId?: string,
): void {
  const normalized = normalizeAssignmentName(candidate).toLocaleLowerCase("tr-TR");
  if (assignments.some((assignment) =>
    assignment.id !== exceptId &&
    normalizeAssignmentName(assignment.name).toLocaleLowerCase("tr-TR") === normalized
  )) {
    throw new Error("Aynı adla başka bir görev alanı zaten var.");
  }
}

export function resolveStoredAssignmentId(
  storedAssignmentId: unknown,
  knownAssignmentIds: readonly string[],
  fallbackAssignmentId: string,
): string {
  if (
    !isValidAssignmentId(fallbackAssignmentId) ||
    !knownAssignmentIds.includes(fallbackAssignmentId)
  ) {
    throw new Error("Varsayılan görev alanı bulunamadı.");
  }
  if (storedAssignmentId === undefined || storedAssignmentId === null || storedAssignmentId === "") {
    return fallbackAssignmentId;
  }
  if (!isValidAssignmentId(storedAssignmentId) || !knownAssignmentIds.includes(storedAssignmentId)) {
    throw new Error("Ses kaydı var olmayan veya geçersiz bir görev alanına bağlı.");
  }
  return storedAssignmentId;
}

export function createAssignmentRecord(
  name: string,
  now = new Date().toISOString(),
  id = crypto.randomUUID().replaceAll("-", "").toLowerCase(),
): AssignmentRecord {
  if (!isValidAssignmentId(id)) throw new Error("Görev alanı kimliği geçersiz.");
  const normalized = normalizeAssignmentName(name);
  return {
    id,
    name: normalized,
    localReference: "",
    authority: "",
    appointedAt: "",
    dueAt: "",
    scope: "",
    questions: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function parseAssignmentQuestions(value: string): string[] {
  if (typeof value !== "string") throw new Error("İnceleme soruları metin olmalıdır.");
  return value.split(/\r\n|\n|\r/u);
}

export function formatAssignmentQuestions(questions: readonly string[]): string {
  if (!Array.isArray(questions)) throw new Error("İnceleme soruları listesi geçersiz.");
  return questions.join("\n");
}

function normalizeQuestions(questions: string[]): string[] {
  if (!Array.isArray(questions)) throw new Error("İnceleme soruları listesi geçersiz.");
  if (questions.length > 100) throw new Error("Bir görev alanında en fazla 100 inceleme sorusu olabilir.");
  return questions.map((question, index) =>
    normalizeAssignmentField(question, "İnceleme sorusu " + (index + 1), 1000)
  ).filter(Boolean);
}

export function normalizeAssignmentProfile(
  current: AssignmentRecord,
  input: AssignmentProfileInput,
): AssignmentRecord {
  return {
    ...current,
    name: normalizeAssignmentName(input.name),
    localReference: normalizeAssignmentField(input.localReference, "Yerel dosya referansı", 160),
    authority: normalizeAssignmentField(input.authority, "Atama mercii", 240),
    appointedAt: normalizeDateField(input.appointedAt, "Görevlendirme tarihi"),
    dueAt: normalizeDateField(input.dueAt, "Son tarih"),
    scope: normalizeAssignmentField(input.scope, "İnceleme kapsamı", 4000),
    questions: normalizeQuestions(input.questions),
    updatedAt: new Date().toISOString(),
  };
}

export function filterByAssignment<T extends { assignmentId?: string }>(
  records: readonly T[],
  assignmentId: string | null,
): T[] {
  if (!assignmentId) return [];
  return records.filter((record) => record.assignmentId === assignmentId);
}

export function resolveActiveAssignment(
  assignments: readonly AssignmentRecord[],
  preferredId: string | null,
): string | null {
  if (preferredId && assignments.some((assignment) => assignment.id === preferredId)) {
    return preferredId;
  }
  return assignments[0]?.id ?? null;
}


export function hasAssignmentProfileChanges(
  current: AssignmentRecord,
  draft: Omit<AssignmentProfileInput, "questions"> & { questionsText: string },
): boolean {
  return (
    current.name !== draft.name ||
    current.localReference !== draft.localReference ||
    current.authority !== draft.authority ||
    current.appointedAt !== draft.appointedAt ||
    current.dueAt !== draft.dueAt ||
    current.scope !== draft.scope ||
    current.questions.join("\n") !== draft.questionsText
  );
}
