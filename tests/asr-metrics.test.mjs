import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateAsrMetrics,
  calculateEditCounts,
  normalizeTurkishAsrText,
  scoreAsrUtterance,
} from "../src/domain/asr-metrics.ts";

test("Türkçe normalizasyonu I/İ harflerini doğru küçültür ve noktalama işaretlerini temizler", () => {
  assert.equal(
    normalizeTurkishAsrText("  İSTANBUL, IĞDIR ve Ankara'ya!  "),
    "istanbul ığdır ve ankara'ya",
  );
});

test("ek, olumsuzluk ve rakam/yazı farkı sessizce eşitlenmez", () => {
  assert.equal(scoreAsrUtterance("geldi", "gelmedi").word.errors, 1);
  assert.equal(scoreAsrUtterance("evler", "evlerde").word.errors, 1);
  assert.equal(scoreAsrUtterance("3", "üç").word.errors, 1);
});

test("WER ve CER ikame, silme ve eklemeyi ölçer", () => {
  const substitution = scoreAsrUtterance("kırmızı araba", "mavi araba");
  assert.equal(substitution.word.errors, 1);
  assert.equal(substitution.word.referenceUnits, 2);
  assert.equal(substitution.wer, 0.5);

  const deletion = scoreAsrUtterance("bir iki üç", "bir üç");
  assert.equal(deletion.word.errors, 1);
  assert.equal(deletion.word.deletions, 1);

  const insertion = scoreAsrUtterance("bir iki", "bir yeni iki");
  assert.equal(insertion.word.errors, 1);
  assert.equal(insertion.word.insertions, 1);
});

test("edit distance iki satırlı bellekle doğru hesaplanır", () => {
  const counts = calculateEditCounts(["a", "b", "c"], ["a", "x", "c", "d"]);
  assert.equal(counts.errors, 2);
  assert.equal(counts.referenceUnits, 3);
  assert.equal(counts.hypothesisUnits, 4);
});

test("boş referans paydası WER/CER'i null yapar, sessiz sıfır başarı üretmez", () => {
  const score = scoreAsrUtterance("", "hallucinated speech");
  assert.equal(score.wer, null);
  assert.equal(score.cer, null);
  assert.equal(score.word.errors, 2);
});

test("korpus metrikleri makro ortalama değil toplam hata/toplam referans birimi kullanır", () => {
  const aggregate = aggregateAsrMetrics([
    { id: "short", reference: "bir", hypothesis: "bir" },
    { id: "long", reference: "bir iki üç dört", hypothesis: "bir yanlış üç dört" },
  ]);
  assert.equal(aggregate.utterances, 2);
  assert.equal(aggregate.scoredUtterances, 2);
  assert.equal(aggregate.word.errors, 1);
  assert.equal(aggregate.word.referenceUnits, 5);
  assert.equal(aggregate.wer, 0.2);
});
