import assert from "node:assert/strict";
import test from "node:test";

import {
  assertQuestionEvidenceOwnership,
  assertSameTaskOwnership,
} from "../src/domain/task-isolation.ts";

const taskA = "a".repeat(32);
const taskB = "b".repeat(32);

test("materyalin görev sahipliği değiştirilemez", () => {
  assert.doesNotThrow(() => assertSameTaskOwnership(taskA, taskA, "Ses materyali"));
  assert.throws(
    () => assertSameTaskOwnership(taskA, taskB, "Ses materyali"),
    /başka bir görev alanına taşınamaz/,
  );
  assert.throws(
    () => assertSameTaskOwnership(taskA, "", "Ses materyali"),
    /başka bir görev alanına taşınamaz/,
  );
});

test("soru dayanağı yalnızca aynı görevin mevcut segmentlerine bağlanabilir", () => {
  const ownRef = "audio-a:segment-1";
  const otherTaskRef = "audio-b:segment-2";
  const allowed = new Set([ownRef]);

  assert.doesNotThrow(() => assertQuestionEvidenceOwnership(
    ["Soru 1?"],
    [{ question: "Soru 1?", supportingSegmentRefs: [ownRef] }],
    allowed,
  ));
  assert.throws(() => assertQuestionEvidenceOwnership(
    ["Soru 1?"],
    [{ question: "Soru 1?", supportingSegmentRefs: [otherTaskRef] }],
    allowed,
  ), /seçili görevin/);
});

test("kaldırılmış soruların eski yanıtları korunur ancak etkin dayanak kontrolünü etkilemez", () => {
  assert.doesNotThrow(() => assertQuestionEvidenceOwnership(
    ["Etkin soru?"],
    [
      { question: "Etkin soru?", supportingSegmentRefs: [] },
      { question: "Kaldırılmış soru?", supportingSegmentRefs: ["eski:segment"] },
    ],
    new Set(),
  ));
});
