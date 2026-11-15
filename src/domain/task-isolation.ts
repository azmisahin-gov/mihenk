/**
 * Kayıtların görev sahipliğini alan katmanında koruyan ortak doğrulamalar.
 * Arayüz filtresi güvenlik sınırı değildir; kalıcı yazım öncesinde de çağrılmalıdır.
 */
export function assertSameTaskOwnership(currentAssignmentId: string, proposedAssignmentId: string, subject = "Kayıt"): void {
  if (!currentAssignmentId || currentAssignmentId !== proposedAssignmentId) {
    throw new Error(subject + " başka bir görev alanına taşınamaz.");
  }
}

/** Etkin soru dayanaklarının yalnızca seçili görevin kayıtlı segmentlerine bağlanmasını sağlar. */
export function assertQuestionEvidenceOwnership(
  activeQuestions: readonly string[],
  answers: readonly { question: string; supportingSegmentRefs: readonly string[] }[],
  availableTaskRefs: ReadonlySet<string>,
): void {
  const active = new Set(activeQuestions);
  for (const answer of answers) {
    if (!active.has(answer.question)) continue;
    for (const ref of answer.supportingSegmentRefs) {
      if (!availableTaskRefs.has(ref)) {
        throw new Error("Soru dayanağı seçili görevin kayıtlı transkript segmentleriyle eşleşmiyor.");
      }
    }
  }
}
