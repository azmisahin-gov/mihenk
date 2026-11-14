export interface AssignmentQuestionAnswer {
  /** Exact question text from the assignment profile, used as its stable key. */
  question: string;
  answer: string;
  /** Namespaced as `audioRecordId:transcriptSegmentId`; scoped to this assignment. */
  supportingSegmentRefs: string[];
  updatedAt: string;
}

export interface AssignmentRecord {
  id: string;
  name: string;
  localReference: string;
  authority: string;
  appointedAt: string;
  dueAt: string;
  scope: string;
  questions: string[];
  /** Optional for backward-compatible reads of older encrypted vaults. */
  questionAnswers?: AssignmentQuestionAnswer[];
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
  questionAnswers?: AssignmentQuestionAnswer[];
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

export function reconcileAssignmentQuestionAnswers(
  questions: readonly string[],
  existing: readonly AssignmentQuestionAnswer[] = [],
): AssignmentQuestionAnswer[] {
  const byQuestion = new Map<string, AssignmentQuestionAnswer>();
  for (const item of existing) {
    if (item && typeof item.question === "string" && !byQuestion.has(item.question)) {
      byQuestion.set(item.question, item);
    }
  }

  const active = new Set(questions);
  const current = questions.map((question) => {
    const previous = byQuestion.get(question);
    return previous
      ? {
          question,
          answer: typeof previous.answer === "string" ? previous.answer : "",
          supportingSegmentRefs: Array.isArray(previous.supportingSegmentRefs)
            ? [...new Set(previous.supportingSegmentRefs.filter((ref) => typeof ref === "string"))]
            : [],
          updatedAt: typeof previous.updatedAt === "string" ? previous.updatedAt : "",
        }
      : { question, answer: "", supportingSegmentRefs: [], updatedAt: "" };
  });

  // Keep answers for removed questions as recoverable orphans instead of
  // silently discarding potentially important expert work.
  const orphaned = existing
    .filter((item) => item && typeof item.question === "string" && !active.has(item.question))
    .map((item) => ({
      question: item.question,
      answer: typeof item.answer === "string" ? item.answer : "",
      supportingSegmentRefs: Array.isArray(item.supportingSegmentRefs)
        ? [...new Set(item.supportingSegmentRefs.filter((ref) => typeof ref === "string"))]
        : [],
      updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : "",
    }));

  return [...current, ...orphaned];
}

export function normalizeAssignmentQuestionAnswers(
  questions: readonly string[],
  answers: readonly AssignmentQuestionAnswer[] = [],
): AssignmentQuestionAnswer[] {
  if (!Array.isArray(answers) || answers.length > 200) {
    throw new Error("Görev soru yanıtları listesi geçersiz veya çok uzun.");
  }

  const reconciled = reconcileAssignmentQuestionAnswers(questions, answers);
  const seen = new Set<string>();
  return reconciled.map((item, index) => {
    const question = normalizeAssignmentField(item.question, "Yanıt sorusu " + (index + 1), 1000);
    if (!question || seen.has(question)) {
      throw new Error("Görev soru yanıtlarında boş veya yinelenen soru var.");
    }
    seen.add(question);
    const answer = normalizeAssignmentField(item.answer, "Uzman yanıtı " + (index + 1), 10_000);
    const refs = item.supportingSegmentRefs;
    if (!Array.isArray(refs) || refs.length > 200) {
      throw new Error("Bir soru için en fazla 200 destek segmenti bağlanabilir.");
    }
    const supportingSegmentRefs = [...new Set(refs.map((ref) => {
      if (typeof ref !== "string" || ref.length < 3 || ref.length > 220 || /[\u0000-\u001f]/u.test(ref)) {
        throw new Error("Destekleyici segment referansı geçersiz.");
      }
      return ref;
    }))];
    const updatedAt = typeof item.updatedAt === "string" ? item.updatedAt : "";
    if (updatedAt && !Number.isFinite(Date.parse(updatedAt))) {
      throw new Error("Soru yanıtı güncelleme zamanı geçersiz.");
    }
    return { question, answer, supportingSegmentRefs, updatedAt };
  });
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
    questionAnswers: normalizeAssignmentQuestionAnswers(
      normalizeQuestions(input.questions),
      input.questionAnswers ?? current.questionAnswers ?? [],
    ),
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
    current.questions.join("\n") !== draft.questionsText ||
    JSON.stringify(reconcileAssignmentQuestionAnswers(current.questions, current.questionAnswers ?? []))
      !== JSON.stringify(reconcileAssignmentQuestionAnswers(
        parseAssignmentQuestions(draft.questionsText).map((question) => question.normalize("NFC").trim()).filter(Boolean),
        draft.questionAnswers ?? current.questionAnswers ?? [],
      ))
  );
}
