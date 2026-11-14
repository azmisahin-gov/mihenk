import type { AudioRecord, HashState } from "./audio";
import type { VaultAudioMetadata } from "./vault";

/**
 * Builds an in-memory row for a vault-backed recording.
 *
 * The original File is used only while importing and hashing. The working
 * record contains an empty File placeholder; playback must always go through
 * the authenticated mihenk-audio protocol backed by the encrypted vault.
 */
export function createVaultAudioRecord(
  metadata: VaultAudioMetadata,
  hashState: HashState,
): AudioRecord {
  return {
    id: metadata.fileId,
    file: new File([], metadata.fileName, {
      type: metadata.mediaType,
      lastModified: metadata.lastModified,
    }),
    objectUrl: "",
    durationSeconds: metadata.durationSeconds,
    sha256: metadata.sha256Preview,
    hashState,
    segments: metadata.segments,
    vaultMetadata: metadata,
  };
}
