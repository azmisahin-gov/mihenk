/**
 * Serialises writes to the local Stronghold vault.
 *
 * A failed write does not poison later operations; drain() resolves after every
 * operation already submitted to the queue has settled.
 */
export class SerialTaskQueue {
  private tail: Promise<void> = Promise.resolve();

  enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation, operation);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  drain(): Promise<void> {
    return this.tail;
  }
}
