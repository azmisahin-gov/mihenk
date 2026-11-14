import assert from "node:assert/strict";
import test from "node:test";

import {
  assertUniqueAssignmentName,
  createAssignmentRecord,
  filterByAssignment,
  normalizeAssignmentName,
  normalizeAssignmentProfile,
  normalizeDateField,
  resolveActiveAssignment,
  resolveStoredAssignmentId,
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

test("eski kasadaki görev kimliği olmayan ses varsayılan alana taşınır", () => {
  assert.equal(resolveStoredAssignmentId(undefined, [first.id, second.id], first.id), first.id);
  assert.equal(resolveStoredAssignmentId(null, [first.id, second.id], first.id), first.id);
});

test("bilinen görev kimliği korunur; bozuk veya yetim görev kimliği reddedilir", () => {
  assert.equal(resolveStoredAssignmentId(second.id, [first.id, second.id], first.id), second.id);
  assert.throws(
    () => resolveStoredAssignmentId("not-an-id", [first.id, second.id], first.id),
    /geçersiz/,
  );
  assert.throws(
    () => resolveStoredAssignmentId("c".repeat(32), [first.id, second.id], first.id),
    /var olmayan/,
  );
});

test("atama profili alanlarını doğrular ve satır satır soruları korur", () => {
  const updated = normalizeAssignmentProfile(first, {
    name: "  Dosya A  ",
    localReference: "  Yerel-01  ",
    authority: "  Örnek Mahkemesi  ",
    appointedAt: "2026-11-01",
    dueAt: "2026-12-01",
    scope: " Ses kaydının incelenmesi ",
    questions: [" İlk soru? ", "", "İkinci soru?"],
  });
  assert.equal(updated.name, "Dosya A");
  assert.equal(updated.localReference, "Yerel-01");
  assert.equal(updated.authority, "Örnek Mahkemesi");
  assert.equal(updated.appointedAt, "2026-11-01");
  assert.deepEqual(updated.questions, ["İlk soru?", "İkinci soru?"]);
  assert.equal(updated.scope, "Ses kaydının incelenmesi");
});

test("atama profili geçersiz tarih, kontrol karakteri ve aşırı uzun alanları reddeder", () => {
  assert.throws(() => normalizeDateField("2026-02-30", "Son tarih"), /geçerli bir tarih/);
  assert.throws(() => normalizeDateField("01.12.2026", "Son tarih"), /YYYY-AA-GG/);
  assert.throws(() => normalizeAssignmentProfile(first, {
    name: first.name, localReference: "x".repeat(161), authority: "", appointedAt: "", dueAt: "", scope: "", questions: [],
  }), /en fazla 160/);
  assert.throws(() => normalizeAssignmentProfile(first, {
    name: first.name, localReference: "", authority: "", appointedAt: "", dueAt: "", scope: "", questions: Array(101).fill("soru"),
  }), /en fazla 100/);
});

test("atama profilindeki satır sonları korunur; kontrol karakterleri reddedilir", () => {
  const updated = normalizeAssignmentProfile(first, {
    name: first.name, localReference: "", authority: "", appointedAt: "", dueAt: "",
    scope: "Birinci satır\r\nİkinci satır", questions: [],
  });
  assert.equal(updated.scope, "Birinci satır\nİkinci satır");
  assert.throws(() => normalizeAssignmentProfile(first, {
    name: first.name, localReference: "", authority: "", appointedAt: "", dueAt: "",
    scope: "geçersiz\u0001veri", questions: [],
  }), /kontrol karakteri/);
});
