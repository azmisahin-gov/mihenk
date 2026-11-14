export interface AsrTextPair {
  id?: string;
  reference: string;
  hypothesis: string;
}

export interface EditCounts {
  errors: number;
  referenceUnits: number;
  hypothesisUnits: number;
}
export interface AsrMetricScore {
  word: EditCounts;
  character: EditCounts;
  wer: number | null;
  cer: number | null;
}

export interface AsrMetricAggregate {
  utterances: number;
  scoredUtterances: number;
  word: EditCounts;
  character: EditCounts;
  wer: number | null;
  cer: number | null;
}

/**
 * Turkish-aware normalization for model comparison only.
 * Digits are deliberately not rewritten to words; negation and suffixes are preserved.
 */
export function normalizeTurkishAsrText(value: string): string {
  return value
    .normalize("NFC")
    .toLocaleLowerCase("tr-TR")
    .replace(/[’‘]/gu, "'")
    .replace(/(?<![\p{L}\p{N}])'|'(?![\p{L}\p{N}])/gu, " ")
    .replace(/[^\p{L}\p{N}'\s]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function calculateEditCounts(
  reference: readonly string[],
  hypothesis: readonly string[],
): EditCounts {
  let left = reference;
  let right = hypothesis;
  if (right.length > left.length) {
    left = hypothesis;
    right = reference;
  }

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  let current = new Array<number>(right.length + 1).fill(0);

  for (let row = 1; row <= left.length; row += 1) {
    current[0] = row;
    for (let column = 1; column <= right.length; column += 1) {
      const substitutionCost = left[row - 1] === right[column - 1] ? 0 : 1;
      current[column] = Math.min(
        previous[column] + 1,
        current[column - 1] + 1,
        previous[column - 1] + substitutionCost,
      );
    }
    [previous, current] = [current, previous];
  }

  return {
    errors: previous[right.length],
    referenceUnits: reference.length,
    hypothesisUnits: hypothesis.length,
  };
}

export function scoreAsrUtterance(reference: string, hypothesis: string): AsrMetricScore {
  const normalizedReference = normalizeTurkishAsrText(reference);
  const normalizedHypothesis = normalizeTurkishAsrText(hypothesis);
  const referenceWords = normalizedReference ? normalizedReference.split(" ") : [];
  const hypothesisWords = normalizedHypothesis ? normalizedHypothesis.split(" ") : [];
  const word = calculateEditCounts(referenceWords, hypothesisWords);
  const character = calculateEditCounts(
    Array.from(normalizedReference),
    Array.from(normalizedHypothesis),
  );

  return {
    word,
    character,
    wer: word.referenceUnits === 0 ? null : word.errors / word.referenceUnits,
    cer: character.referenceUnits === 0 ? null : character.errors / character.referenceUnits,
  };
}

export function aggregateAsrMetrics(pairs: readonly AsrTextPair[]): AsrMetricAggregate {
  const word: EditCounts = {
    errors: 0, referenceUnits: 0, hypothesisUnits: 0,
  };
  const character: EditCounts = { ...word };
  let scoredUtterances = 0;

  for (const pair of pairs) {
    const score = scoreAsrUtterance(pair.reference, pair.hypothesis);
    if (score.wer !== null) scoredUtterances += 1;

    for (const key of [
      "errors", "referenceUnits", "hypothesisUnits",
    ] as const) {
      word[key] += score.word[key];
      character[key] += score.character[key];
    }
  }

  return {
    utterances: pairs.length,
    scoredUtterances,
    word,
    character,
    wer: word.referenceUnits === 0 ? null : word.errors / word.referenceUnits,
    cer: character.referenceUnits === 0 ? null : character.errors / character.referenceUnits,
  };
}
