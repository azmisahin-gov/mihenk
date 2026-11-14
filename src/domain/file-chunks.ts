export const FILE_STREAM_CHUNK_BYTES = 1024 * 1024;

export interface FileChunkSource {
  readonly size: number;
  slice(start?: number, end?: number): Blob;
}

/**
 * Reads a Blob/File in fixed 1 MiB pieces. It never asks the platform to
 * materialize the complete source file, validates every slice, and wipes each
 * returned buffer as soon as the consumer advances or aborts iteration.
 */
export async function* readFileChunks(
  file: FileChunkSource,
): AsyncGenerator<Uint8Array> {
  if (!Number.isSafeInteger(file.size) || file.size < 0) {
    throw new Error("Dosya boyutu geçersiz.");
  }

  for (let offset = 0; offset < file.size; offset += FILE_STREAM_CHUNK_BYTES) {
    const end = Math.min(file.size, offset + FILE_STREAM_CHUNK_BYTES);
    const expectedLength = end - offset;
    const part = file.slice(offset, end);
    if (part.size !== expectedLength) {
      throw new Error("Dosya parçasının boyutu doğrulanamadı.");
    }

    const bytes = new Uint8Array(await part.arrayBuffer());
    if (bytes.byteLength !== expectedLength) {
      bytes.fill(0);
      throw new Error("Dosya parçası eksik okundu.");
    }

    try {
      yield bytes;
    } finally {
      bytes.fill(0);
    }
  }
}
