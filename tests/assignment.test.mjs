import assert from "node:assert/strict";
import test from "node:test";

import {
  assertUniqueAssignmentName,
  createAssignmentRecord,
  filterByAssignment,
  normalizeAssignmentName,
  resolveActiveAssignment,
} from "../src/domain/assignment.ts";

const first = createAssignmentRecord("Dosya A", "2026-11-14T00:00:00.000Z", "a".repeat(32));
const second = createAssignmentRecord("Dosya B", "2026-11-14T00:00:00.000Z", "b".repeat(32));

test("görev etiketi boşlukları düzenler ve Türkçe karakterleri korur", () => {
  assert.equal(normalizeAssignmentName("  Örnek   Görev  "), "Örnek Görev");
});

test("boş, kontrol karakterli ve aşırı uzun görev etiketlerini reddeder", () => {
  assert.throws(() => normalizeAssignmentName("   "), /boş olamaz/);
  assert.throws(() => normalizeAssignmentName("Dosya\nA"), /kontrol karakteri/);
  assert.throws(() => normalizeAssignmentName("x".repeat(101)), /en fazla 100/);
});

test("görev etiketi Türkçe yerel kurallarıyla benzersiz olmalıdır", () => {
  assert.throws(
    () => assertUniqueAssignmentName("dosya a", [first, second]),
    /zaten var/,
  );
  assert.doesNotThrow(() => assertUniqueAssignmentName("Dosya C", [first, second]));
  assert.doesNotThrow(() => assertUniqueAssignmentName("Dosya A", [first, second], first.id));
});

test("görev alanı filtresi diğer görevin seslerini döndürmez", () => {
  const records = [
    { id: "1", assignmentId: first.id },
    { id: "2", assignmentId: second.id },
    { id: "3", assignmentId: first.id },
  ];
  assert.deepEqual(filterByAssignment(records, first.id).map((item) => item.id), ["1", "3"]);
  assert.deepEqual(filterByAssignment(records, second.id).map((item) => item.id), ["2"]);
  assert.deepEqual(filterByAssignment(records, null), []);
});

test("geçersiz veya boş tercih edilen görev yerine ilk mevcut görev seçilir", () => {
  assert.equal(resolveActiveAssignment([first, second], second.id), second.id);
  assert.equal(resolveActiveAssignment([first, second], "c".repeat(32)), first.id);
  assert.equal(resolveActiveAssignment([], null), null);
});
