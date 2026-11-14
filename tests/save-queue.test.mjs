import assert from "node:assert/strict";
import test from "node:test";

import { SerialTaskQueue } from "../src/domain/save-queue.ts";

test("kasa yazımlarını eklenme sırasıyla ve eşzamanlı çakışma olmadan yürütür", async () => {
  const queue = new SerialTaskQueue();
  const order = [];
  let releaseFirst;
  const firstGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });

  const first = queue.enqueue(async () => {
    order.push("ilk-başladı");
    await firstGate;
    order.push("ilk-bitti");
    return 1;
  });
  const second = queue.enqueue(async () => {
    order.push("ikinci");
    return 2;
  });

  await Promise.resolve();
  assert.deepEqual(order, ["ilk-başladı"]);

  releaseFirst();
  assert.deepEqual(await Promise.all([first, second]), [1, 2]);
  await queue.drain();
  assert.deepEqual(order, ["ilk-başladı", "ilk-bitti", "ikinci"]);
});

test("başarısız bir yazım sonraki kayıtları durdurmaz", async () => {
  const queue = new SerialTaskQueue();
  const failed = queue.enqueue(async () => {
    throw new Error("sentetik yazma hatası");
  });
  const recovered = queue.enqueue(async () => "sonraki kayıt tamamlandı");

  await assert.rejects(failed, /sentetik yazma hatası/);
  assert.equal(await recovered, "sonraki kayıt tamamlandı");
  await queue.drain();
});
