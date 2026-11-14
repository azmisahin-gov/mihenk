export interface AssignmentRecord {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
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

export function createAssignmentRecord(
  name: string,
  now = new Date().toISOString(),
  id = crypto.randomUUID().replaceAll("-", "").toLowerCase(),
): AssignmentRecord {
  if (!isValidAssignmentId(id)) throw new Error("Görev alanı kimliği geçersiz.");
  const normalized = normalizeAssignmentName(name);
  return { id, name: normalized, createdAt: now, updatedAt: now };
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
