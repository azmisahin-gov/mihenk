import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  calculatePreviewHash,
  createSegment,
  formatBytes,
  formatTime,
  repeatStartIfReached,
  safeFileStem,
  type AudioRecord,
  type SegmentStatus,
} from "./domain/audio";
import { buildTranscriptExport, buildTranscriptText } from "./domain/export";
import { buildDocxReport, buildOdtReport } from "./domain/report";
import { resolveActiveAssignment, type AssignmentProfileInput } from "./domain/assignment";
import {
  createLocalVault,
  createVaultAssignment,
  updateVaultAssignment,
  listAssignments,
  deleteStoredAudio,
  getVaultState,
  importAudioToVault,
  listStoredAudio,
  lockLocalVault,
  openStoredAudio,
  saveStoredAudioMetadata,
  unlockLocalVault,
  exportLocalVaultBackup,
  restoreLocalVaultBackup,
  type VaultAudioMetadata,
  type VaultAssignment,
  type VaultState,
} from "./domain/vault";
import { MAX_VAULT_BACKUP_BYTES } from "./domain/vault-backup";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

const AUDIO_EXTENSION = /\.(wav|mp3|m4a|aac|ogg|flac|opus|wma|aiff?)$/i;

function saveTextFile(fileName: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const downloadUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = downloadUrl;
  anchor.download = fileName;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
}

function saveBinaryFile(fileName: string, bytes: Uint8Array, mimeType = "application/octet-stream"): void {
  const owned = new Uint8Array(bytes.byteLength);
  owned.set(bytes);
  const blob = new Blob([owned.buffer], { type: mimeType });
  const downloadUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = downloadUrl;
  anchor.download = fileName;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
  owned.fill(0);
}

interface AssignmentProfileDraft {
  name: string;
  localReference: string;
  authority: string;
  appointedAt: string;
  dueAt: string;
  scope: string;
  questionsText: string;
}

const EMPTY_ASSIGNMENT_PROFILE: AssignmentProfileDraft = {
  name: "",
  localReference: "",
  authority: "",
  appointedAt: "",
  dueAt: "",
  scope: "",
  questionsText: "",
};

function hashLabel(record: AudioRecord): string {
  switch (record.hashState) {
    case "bekliyor": return "Sırada";
    case "hesaplaniyor": return "Hesaplanıyor";
    case "hesaplandi": return "SHA-256 hazır";
    case "buyuk-dosya": return "Büyük dosya — atlandı";
    case "desteklenmiyor": return "Tarayıcı desteği yok";
    case "hata": return "Hesaplanamadı";
  }
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.matches("input, textarea, select");
}

export default function App() {
  const [records, setRecords] = useState<AudioRecord[]>([]);
  const [assignments, setAssignments] = useState<VaultAssignment[]>([]);
  const [activeAssignmentId, setActiveAssignmentId] = useState<string | null>(null);
  const [assignmentNameDraft, setAssignmentNameDraft] = useState("");
  const [assignmentProfileDraft, setAssignmentProfileDraft] = useState<AssignmentProfileDraft>(EMPTY_ASSIGNMENT_PROFILE);
  const [assignmentProfileBusy, setAssignmentProfileBusy] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [repeatSegmentId, setRepeatSegmentId] = useState<string | null>(null);
  const [notice, setNotice] = useState("Ses seçerek çalışma alanını başlatın.");
  const [isDragging, setIsDragging] = useState(false);
  const [availableUpdate, setAvailableUpdate] = useState<Awaited<ReturnType<typeof check>>>(null);
  const [updateState, setUpdateState] = useState<"checking" | "none" | "available" | "installing" | "error">("checking");
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateError, setUpdateError] = useState("");
  const [vaultState, setVaultState] = useState<VaultState | "checking" | "unavailable" | "creating" | "unlocking" | "locking">("checking");
  const [vaultPassword, setVaultPassword] = useState("");
  const [vaultPasswordConfirm, setVaultPasswordConfirm] = useState("");
  const [vaultBusy, setVaultBusy] = useState(false);
  const [vaultSaveStatus, setVaultSaveStatus] = useState<"idle" | "pending" | "saving" | "saved" | "error">("idle");
  const [vaultError, setVaultError] = useState("");
  const [loadingRecordId, setLoadingRecordId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [backupInputBusy, setBackupInputBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const recordsRef = useRef<AudioRecord[]>([]);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const saveRevisionRef = useRef(0);

  useEffect(() => {
    recordsRef.current = records;
  }, [records]);

  useEffect(() => {
    const isDesktopRuntime = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
    if (!isDesktopRuntime) {
      setVaultState("unavailable");
      return;
    }

    let cancelled = false;
    void getVaultState()
      .then((state) => {
        if (!cancelled) setVaultState(state);
      })
      .catch((error) => {
        if (!cancelled) {
          setVaultError(error instanceof Error ? error.message : "Yerel kasa durumu okunamadı.");
          setVaultState("unavailable");
        }
      });

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const isDesktopRuntime = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
    if (!isDesktopRuntime) {
      setUpdateState("none");
      return;
    }

    let cancelled = false;
    void check()
      .then((update) => {
        if (cancelled) return;
        setAvailableUpdate(update);
        setUpdateState(update ? "available" : "none");
      })
      .catch(() => {
        // Ağ hatası veya yapılandırılmamış geliştirme derlemesi kullanıcı iş akışını engellemez.
        if (!cancelled) setUpdateState("none");
      });

    return () => { cancelled = true; };
  }, []);

  // Güncellemeler ses çalarken veya şifreli dosya belleğe alınırken bekler.
  // Kayıtlar artık kalıcı olduğundan kuyruk sayısı güncellemeyi engellemez.
  useEffect(() => {
    if (
      vaultState === "unlocked" &&
      updateState === "available" &&
      availableUpdate &&
      !isPlaying &&
      loadingRecordId === null
    ) {
      void installAvailableUpdate();
    }
  }, [availableUpdate, updateState, vaultState, isPlaying, loadingRecordId]);

  useEffect(() => () => {
    for (const record of recordsRef.current) {
      if (record.objectUrl) URL.revokeObjectURL(record.objectUrl);
    }
  }, []);

  const assignmentRecords = useMemo(
    () => records.filter((record) => record.vaultMetadata?.assignmentId === activeAssignmentId),
    [records, activeAssignmentId],
  );

  const activeAssignment = useMemo(
    () => assignments.find((assignment) => assignment.id === activeAssignmentId) ?? null,
    [assignments, activeAssignmentId],
  );

  useEffect(() => {
    if (!activeAssignment) {
      setAssignmentProfileDraft(EMPTY_ASSIGNMENT_PROFILE);
      return;
    }
    setAssignmentProfileDraft({
      name: activeAssignment.name,
      localReference: activeAssignment.localReference,
      authority: activeAssignment.authority,
      appointedAt: activeAssignment.appointedAt,
      dueAt: activeAssignment.dueAt,
      scope: activeAssignment.scope,
      questionsText: activeAssignment.questions.join("\n"),
    });
  }, [activeAssignmentId]);

  const assignmentProfileDirty = Boolean(activeAssignment && (
    assignmentProfileDraft.name !== activeAssignment.name ||
    assignmentProfileDraft.localReference !== activeAssignment.localReference ||
    assignmentProfileDraft.authority !== activeAssignment.authority ||
    assignmentProfileDraft.appointedAt !== activeAssignment.appointedAt ||
    assignmentProfileDraft.dueAt !== activeAssignment.dueAt ||
    assignmentProfileDraft.scope !== activeAssignment.scope ||
    assignmentProfileDraft.questionsText !== activeAssignment.questions.join("\\n")
  ));

  const activeRecord = useMemo(
    () => assignmentRecords.find((record) => record.id === activeId) ?? null,
    [assignmentRecords, activeId],
  );

  const totalDuration = useMemo(
    () => assignmentRecords.reduce((total, record) => total + (record.durationSeconds ?? 0), 0),
    [assignmentRecords],
  );

  useEffect(() => {
    function handleKeyboardShortcuts(event: KeyboardEvent): void {
      if (event.defaultPrevented || isTextEntryTarget(event.target)) return;

      const player = audioRef.current;
      if (!activeRecord || !player) return;

      if (
        event.code === "Space" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.shiftKey
      ) {
        event.preventDefault();
        if (player.paused) {
          void player.play().catch(() => {
            setNotice("Ses oynatılamadı. Dosya biçimi veya tarayıcı desteğini kontrol edin.");
          });
        } else {
          player.pause();
        }
        return;
      }

      if (
        (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.shiftKey
      ) {
        event.preventDefault();
        const direction = event.key === "ArrowRight" ? 1 : -1;
        const duration = Number.isFinite(player.duration) ? player.duration : Number.MAX_SAFE_INTEGER;
        seekTo(Math.min(duration, Math.max(0, player.currentTime + direction * 5)));
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        addSegment();
      }
    }

    window.addEventListener("keydown", handleKeyboardShortcuts);
    return () => window.removeEventListener("keydown", handleKeyboardShortcuts);
  }, [activeRecord, currentTime]);

  async function restoreVaultRecords(): Promise<void> {
    const availableAssignments = await listAssignments();
    setAssignments(availableAssignments);
    setActiveAssignmentId((current) => resolveActiveAssignment(availableAssignments, current));
    const stored = await listStoredAudio();
    const restored: AudioRecord[] = stored.map((metadata) => ({
      id: metadata.fileId,
      file: new File([], metadata.fileName, {
        type: metadata.mediaType,
        lastModified: metadata.lastModified,
      }),
      objectUrl: "",
      durationSeconds: metadata.durationSeconds,
      sha256: metadata.sha256Preview,
      hashState: metadata.sha256Preview ? "hesaplandi" : "bekliyor",
      segments: metadata.segments,
      vaultMetadata: metadata,
    }));
    setRecords(restored);
    setActiveId(null);
    setCurrentTime(0);
    setRepeatSegmentId(null);
  }

  async function persistVaultRecords(snapshot: AudioRecord[]): Promise<void> {
    const write = async () => {
      for (const record of snapshot) {
        if (!record.vaultMetadata) continue;
        const metadata: VaultAudioMetadata = {
          ...record.vaultMetadata,
          durationSeconds: record.durationSeconds,
          sha256Preview: record.sha256,
          segments: record.segments,
        };
        await saveStoredAudioMetadata(metadata);
      }
    };

    const revision = ++saveRevisionRef.current;
    setVaultSaveStatus("saving");
    const queued = saveQueueRef.current.then(write, write);
    saveQueueRef.current = queued.catch(() => undefined);
    try {
      await queued;
      if (revision === saveRevisionRef.current) setVaultSaveStatus("saved");
    } catch (error) {
      if (revision === saveRevisionRef.current) setVaultSaveStatus("error");
      throw error;
    }
  }

  useEffect(() => {
    if (vaultState !== "unlocked" || records.length === 0) return;
    setVaultSaveStatus("pending");
    const timeout = window.setTimeout(() => {
      void persistVaultRecords(records).catch((error) => {
        setNotice(error instanceof Error ? `Kasa kaydı yapılamadı: ${error.message}` : "Kasa kaydı yapılamadı.");
      });
    }, 450);
    return () => window.clearTimeout(timeout);
  }, [records, vaultState]);

  async function submitVaultPassword(): Promise<void> {
    if (vaultBusy) return;
    setVaultError("");
    if (vaultState === "not-created" && vaultPassword !== vaultPasswordConfirm) {
      setVaultError("Parola ve parola tekrarı eşleşmiyor.");
      return;
    }
    if (vaultPassword.length < 12) {
      setVaultError("Kasa parolası en az 12 karakter olmalıdır.");
      return;
    }

    const creating = vaultState === "not-created";
    setVaultBusy(true);
    setVaultState(creating ? "creating" : "unlocking");
    try {
      if (creating) await createLocalVault(vaultPassword);
      else await unlockLocalVault(vaultPassword);
      await restoreVaultRecords();
      setVaultPassword("");
      setVaultPasswordConfirm("");
      setVaultState("unlocked");
      setVaultSaveStatus("saved");
      setNotice(creating ? "Şifreli yerel kasa oluşturuldu." : "Yerel kasa açıldı.");
    } catch (error) {
      await lockLocalVault().catch(() => undefined);
      const actualState = await getVaultState().catch(() => (creating ? "not-created" : "locked") as VaultState);
      setVaultState(actualState);
      setVaultError(error instanceof Error ? error.message : "Yerel kasa açılamadı.");
    } finally {
      setVaultBusy(false);
    }
  }

  async function lockVault(): Promise<void> {
    if (vaultState !== "unlocked" || vaultBusy) return;
    if (assignmentProfileDirty) {
      setNotice("Kasayı kilitlemeden önce görev profilindeki değişiklikleri kaydedin.");
      return;
    }
    setVaultBusy(true);
    setVaultState("locking");
    try {
      await persistVaultRecords(recordsRef.current);
      audioRef.current?.pause();
      await lockLocalVault();
      for (const record of recordsRef.current) {
        if (record.objectUrl) URL.revokeObjectURL(record.objectUrl);
      }
      setRecords([]);
      setVaultSaveStatus("idle");
      setAssignments([]);
      setActiveAssignmentId(null);
      setActiveId(null);
      setCurrentTime(0);
      setRepeatSegmentId(null);
      setLoadingRecordId(null);
      setVaultState("locked");
      setNotice("Yerel kasa kilitlendi.");
    } catch (error) {
      const actualState = await getVaultState().catch(() => "locked" as VaultState);
      setVaultState(actualState);
      setVaultError(error instanceof Error ? error.message : "Kasa kilitlenemedi.");
      setNotice("Kasa kilitlenemedi; çalışma açık bırakıldı.");
    } finally {
      setVaultBusy(false);
    }
  }

  async function selectRecord(recordId: string): Promise<void> {
    const record = records.find((item) => item.id === recordId);
    if (!record) return;
    setActiveId(recordId);
    setCurrentTime(0);
    setRepeatSegmentId(null);
    if (record.objectUrl || !record.vaultMetadata) return;

    setLoadingRecordId(recordId);
    try {
      const file = await openStoredAudio(record.vaultMetadata);
      const objectUrl = URL.createObjectURL(file);
      updateRecord(recordId, (item) => ({ ...item, file, objectUrl }));
      setNotice("Şifreli ses dosyası doğrulandı ve dinlemeye açıldı.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Şifreli ses dosyası açılamadı.");
    } finally {
      setLoadingRecordId((current) => current === recordId ? null : current);
    }
  }


  async function addAssignment(): Promise<void> {
    if (assignmentProfileDirty) {
      setNotice("Önce mevcut görev profilindeki değişiklikleri kaydedin.");
      return;
    }
    const name = assignmentNameDraft.trim();
    if (!name) {
      setNotice("Yeni görev alanına kısa bir etiket verin.");
      return;
    }

    try {
      const created = await createVaultAssignment(name);
      setAssignments((current) => [...current, created]);
      setVaultSaveStatus("saved");
      setActiveAssignmentId(created.id);
      setAssignmentNameDraft("");
      audioRef.current?.pause();
      setActiveId(null);
      setCurrentTime(0);
      setRepeatSegmentId(null);
      setNotice(`“${created.name}” görev alanı oluşturuldu. Yeni sesler yalnızca bu alana kaydedilecek.`);
    } catch (error) {
      setVaultSaveStatus("error");
      setNotice(error instanceof Error ? error.message : "Görev alanı oluşturulamadı.");
    }
  }

  function updateAssignmentProfileField(field: keyof AssignmentProfileDraft, value: string): void {
    setAssignmentProfileDraft((draft) => ({ ...draft, [field]: value }));
  }

  async function saveAssignmentProfile(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!activeAssignment || assignmentProfileBusy) return;
    setAssignmentProfileBusy(true);
    try {
      const input: AssignmentProfileInput = {
        name: assignmentProfileDraft.name,
        localReference: assignmentProfileDraft.localReference,
        authority: assignmentProfileDraft.authority,
        appointedAt: assignmentProfileDraft.appointedAt,
        dueAt: assignmentProfileDraft.dueAt,
        scope: assignmentProfileDraft.scope,
        questions: assignmentProfileDraft.questionsText.split(/\r?\n/u),
      };
      const updated = await updateVaultAssignment(activeAssignment.id, input);
      setAssignments((current) => current.map((item) => item.id === updated.id ? updated : item));
      setVaultSaveStatus("saved");
      setAssignmentProfileDraft({
        name: updated.name,
        localReference: updated.localReference,
        authority: updated.authority,
        appointedAt: updated.appointedAt,
        dueAt: updated.dueAt,
        scope: updated.scope,
        questionsText: updated.questions.join("\n"),
      });
      setNotice("Görev profili şifreli kasaya kaydedildi.");
    } catch (error) {
      setVaultSaveStatus("error");
      setNotice(error instanceof Error ? error.message : "Görev profili kaydedilemedi.");
    } finally {
      setAssignmentProfileBusy(false);
    }
  }

  function switchAssignment(assignmentId: string): void {
    if (!assignments.some((assignment) => assignment.id === assignmentId)) return;
    if (assignmentProfileDirty) {
      setNotice("Görev değiştirilemedi. Önce mevcut görev profilini kaydedin.");
      return;
    }
    audioRef.current?.pause();
    setActiveAssignmentId(assignmentId);
    setActiveId(null);
    setCurrentTime(0);
    setRepeatSegmentId(null);
    setNotice("Görev alanı değiştirildi. Yalnızca seçili görevin kayıtları gösteriliyor.");
  }

  function updateRecord(recordId: string, update: (record: AudioRecord) => AudioRecord): void {
    setRecords((current) => current.map((record) => (
      record.id === recordId ? update(record) : record
    )));
  }

  async function addFiles(fileList: FileList | File[]): Promise<void> {
    if (vaultState !== "unlocked") {
      setNotice("Ses eklemeden önce yerel kasayı açın.");
      return;
    }
    if (!activeAssignmentId) {
      setNotice("Ses eklemek için önce bir görev alanı oluşturun veya seçin.");
      return;
    }

    const incoming = Array.from(fileList);
    const accepted = incoming.filter((file) => file.type.startsWith("audio/") || AUDIO_EXTENSION.test(file.name));
    const rejectedCount = incoming.length - accepted.length;
    if (accepted.length === 0) {
      setNotice("Seçilen dosyalarda tanınan bir ses dosyası bulunamadı.");
      return;
    }

    let addedCount = 0;
    let failedCount = 0;
    for (const file of accepted) {
      try {
        setNotice(`“${file.name}” şifreli yerel kasaya alınıyor…`);
        const imported = await importAudioToVault(file, activeAssignmentId);
        const hash = await calculatePreviewHash(file);
        const metadata: VaultAudioMetadata = {
          ...imported,
          sha256Preview: hash.hash,
        };
        await saveStoredAudioMetadata(metadata);
        const record: AudioRecord = {
          id: metadata.fileId,
          file,
          objectUrl: URL.createObjectURL(file),
          durationSeconds: metadata.durationSeconds,
          sha256: metadata.sha256Preview,
          hashState: hash.state,
          segments: metadata.segments,
          vaultMetadata: metadata,
        };

        setRecords((current) => [...current, record]);
        if (assignmentRecords.length === 0 && addedCount === 0) {
          setActiveId(metadata.fileId);
          setCurrentTime(0);
        }
        addedCount += 1;
      } catch (error) {
        failedCount += 1;
        setNotice(error instanceof Error ? `“${file.name}” eklenemedi: ${error.message}` : `“${file.name}” eklenemedi.`);
      }
    }

    const messages = [
      addedCount > 0 ? `${addedCount} ses şifreli kasaya kaydedildi` : "",
      failedCount > 0 ? `${failedCount} dosya eklenemedi` : "",
      rejectedCount > 0 ? `${rejectedCount} desteklenmeyen dosya atlandı` : "",
    ].filter(Boolean);
    setNotice(messages.join("; ") || "Ses dosyası eklenemedi.");
  }

  function updateSegment(
    segmentId: string,
    update: (segment: AudioRecord["segments"][number]) => AudioRecord["segments"][number],
  ): void {
    if (!activeRecord) return;
    updateRecord(activeRecord.id, (record) => ({
      ...record,
      segments: record.segments.map((segment) => (
        segment.id === segmentId ? update(segment) : segment
      )),
    }));
  }

  function addSegment(): void {
    if (!activeRecord) return;
    const startSeconds = audioRef.current?.currentTime ?? currentTime;
    const segment = createSegment(startSeconds);
    updateRecord(activeRecord.id, (record) => ({
      ...record,
      segments: [...record.segments, segment].sort((a, b) => a.startSeconds - b.startSeconds),
    }));
    setNotice(`${formatTime(startSeconds)} konumuna yeni taslak bölümü eklendi.`);
  }

  function markSegmentEnd(segmentId: string): void {
    if (!activeRecord) return;
    const endSeconds = audioRef.current?.currentTime ?? currentTime;
    const segment = activeRecord.segments.find((item) => item.id === segmentId);
    if (!segment) return;
    if (endSeconds < segment.startSeconds) {
      setNotice("Bölüm bitişi, başlangıç zamanından önce olamaz.");
      return;
    }
    updateRecord(activeRecord.id, (record) => ({
      ...record,
      segments: record.segments.map((item) => (
        item.id === segmentId ? { ...item, endSeconds } : item
      )),
    }));
    setNotice(`${formatTime(endSeconds)} bölüm bitişi olarak kaydedildi.`);
  }

  function removeSegment(segmentId: string): void {
    if (!activeRecord) return;
    if (repeatSegmentId === segmentId) setRepeatSegmentId(null);
    updateRecord(activeRecord.id, (record) => ({
      ...record,
      segments: record.segments.filter((segment) => segment.id !== segmentId),
    }));
  }

  async function removeRecord(recordId: string): Promise<void> {
    const target = records.find((record) => record.id === recordId);
    if (!target) return;

    try {
      if (target.vaultMetadata) await deleteStoredAudio(recordId);
      if (target.objectUrl) URL.revokeObjectURL(target.objectUrl);
      const remaining = records.filter((record) => record.id !== recordId);
      setRecords(remaining);
      if (activeId === recordId) {
        setActiveId(null);
        setCurrentTime(0);
        setRepeatSegmentId(null);
      }
      setNotice("Ses dosyası ve şifreli kasa kaydı kaldırıldı.");
    } catch (error) {
      setNotice(error instanceof Error ? `Dosya kasadan kaldırılamadı: ${error.message}` : "Dosya kasadan kaldırılamadı.");
    }
  }

  function handleMetadata(): void {
    const duration = audioRef.current?.duration;
    if (!activeRecord || duration === undefined || !Number.isFinite(duration)) return;
    updateRecord(activeRecord.id, (record) => ({ ...record, durationSeconds: duration }));
  }

  function seekTo(value: number): void {
    if (!audioRef.current || !Number.isFinite(value)) return;
    audioRef.current.currentTime = value;
    setCurrentTime(value);
  }

  function handleAudioTimeUpdate(): void {
    const player = audioRef.current;
    if (!player) return;

    const repeatedSegment = activeRecord?.segments.find(
      (segment) => segment.id === repeatSegmentId,
    );
    if (repeatedSegment?.endSeconds !== null && repeatedSegment?.endSeconds !== undefined) {
      const repeatStart = repeatStartIfReached(
        player.currentTime,
        repeatedSegment.startSeconds,
        repeatedSegment.endSeconds,
      );
      if (repeatStart !== null) player.currentTime = repeatStart;
    }

    setCurrentTime(player.currentTime);
  }

  function toggleSegmentRepeat(segment: AudioRecord["segments"][number]): void {
    if (repeatSegmentId === segment.id) {
      setRepeatSegmentId(null);
      setNotice("Bölüm aralığı tekrarı kapatıldı.");
      return;
    }

    if (segment.endSeconds === null || segment.endSeconds <= segment.startSeconds) {
      setNotice("Tekrar için önce başlangıçtan sonra bir bölüm bitişi işaretleyin.");
      return;
    }

    setRepeatSegmentId(segment.id);
    const player = audioRef.current;
    if (player) {
      player.currentTime = segment.startSeconds;
      setCurrentTime(segment.startSeconds);
      void player.play().catch(() => {
        setNotice("Ses oynatılamadı. Dosya biçimi veya tarayıcı desteğini kontrol edin.");
      });
    }
    setNotice(
      `${formatTime(segment.startSeconds)}–${formatTime(segment.endSeconds)} aralığı tekrarlanıyor.`,
    );
  }

  function jumpTo(seconds: number): void {
    if (!audioRef.current) return;
    audioRef.current.currentTime = seconds;
    setCurrentTime(seconds);
    void audioRef.current.play().catch(() => {
      setNotice("Ses oynatılamadı. Dosya biçimi veya tarayıcı desteğini kontrol edin.");
    });
  }

  async function createEncryptedBackup(): Promise<void> {
    if (assignmentProfileDirty) {
      setNotice("Yedek oluşturmadan önce görev profilindeki değişiklikleri kaydedin.");
      return;
    }
    if (vaultState !== "unlocked" || backupInputBusy) return;
    setBackupInputBusy(true);
    try {
      await persistVaultRecords(recordsRef.current);
      const backup = await exportLocalVaultBackup();
      const dateStamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
      saveBinaryFile(`MİHENK-yerel-kasa-${dateStamp}.mihenkbackup`, backup);
      backup.fill(0);
      setNotice("Kasa yedeği oluşturuldu. İçindeki veriler mevcut kasa parolasıyla açılır.");
    } catch (error) {
      setNotice(error instanceof Error ? `Kasa yedeği oluşturulamadı: ${error.message}` : "Şifreli yedek oluşturulamadı.");
    } finally {
      setBackupInputBusy(false);
    }
  }

  async function restoreEncryptedBackup(file: File | undefined): Promise<void> {
    if (!file) return;
    if (vaultBusy || backupInputBusy) return;
    if (file.size > MAX_VAULT_BACKUP_BYTES) {
      setVaultError("Yedek dosyası 512 MiB sınırını aşıyor.");
      return;
    }

    setBackupInputBusy(true);
    setVaultError("");
    let restored = false;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      try {
        await restoreLocalVaultBackup(bytes);
        restored = true;
      } finally {
        bytes.fill(0);
      }
      setVaultPassword("");
      setVaultPasswordConfirm("");
      setVaultState("locked");
      setNotice("Kasa yedeği geri yüklendi. Salt yapılandırmasını yenilemek için uygulama yeniden başlatılıyor.");
      await relaunch();
    } catch (error) {
      setVaultError(error instanceof Error ? error.message : "Şifreli yedek geri yüklenemedi.");
      setVaultState(restored ? "locked" : "not-created");
    } finally {
      setBackupInputBusy(false);
      if (backupInputRef.current) backupInputRef.current.value = "";
    }
  }

  function exportText(): void {
    if (!activeRecord) return;
    saveTextFile(
      `${safeFileStem(activeRecord.file.name)}_transkript_taslagi.txt`,
      buildTranscriptText(activeRecord, activeAssignment),
      "text/plain;charset=utf-8",
    );
    setNotice("Transkript taslağı TXT olarak dışa aktarıldı.");
  }

  function exportJson(): void {
    if (!activeRecord) return;
    const payload = buildTranscriptExport(activeRecord, activeAssignment);
    saveTextFile(
      `${safeFileStem(activeRecord.file.name)}_transkript_taslagi.json`,
      JSON.stringify(payload, null, 2),
      "application/json;charset=utf-8",
    );
    setNotice("Transkript taslağı JSON olarak dışa aktarıldı.");
  }

  function exportReportInput() {
    if (!activeRecord || !activeAssignment) {
      setNotice("Rapor taslağı için görev alanı ve ses kaydı seçin.");
      return null;
    }
    return {
      assignment: activeAssignment,
      source: {
        fileName: activeRecord.vaultMetadata?.fileName ?? activeRecord.file.name,
        mediaType: activeRecord.vaultMetadata?.mediaType ?? activeRecord.file.type,
        sizeBytes: activeRecord.vaultMetadata?.sizeBytes ?? activeRecord.file.size,
        durationSeconds: activeRecord.durationSeconds,
        sha256Preview: activeRecord.vaultMetadata?.sha256Preview ?? activeRecord.sha256 ?? null,
      },
      segments: activeRecord.segments,
    };
  }

  function exportDocx(): void {
    const input = exportReportInput();
    if (!input) return;
    const fileName = safeFileStem(activeAssignment?.name ?? "gorev") + "_" +
      safeFileStem(activeRecord?.file.name ?? "ses") + "_taslak.docx";
    saveBinaryFile(fileName, buildDocxReport(input),
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    setNotice("DOCX çalışma taslağı oluşturuldu; imzasızdır ve resmî teslim değildir.");
  }

  function exportOdt(): void {
    const input = exportReportInput();
    if (!input) return;
    const fileName = safeFileStem(activeAssignment?.name ?? "gorev") + "_" +
      safeFileStem(activeRecord?.file.name ?? "ses") + "_taslak.odt";
    saveBinaryFile(fileName, buildOdtReport(input), "application/vnd.oasis.opendocument.text");
    setNotice("ODT çalışma taslağı oluşturuldu; imzasızdır ve resmî teslim değildir.");
  }

  const activeDuration = activeRecord?.durationSeconds ?? 0;

  async function installAvailableUpdate(): Promise<void> {
    if (assignmentProfileDirty) {
      setNotice("Güncellemeden önce görev profilindeki değişiklikleri kaydedin.");
      return;
    }
    if (!availableUpdate || isPlaying || loadingRecordId !== null || vaultState !== "unlocked" || updateState === "installing") return;
    setUpdateState("installing");
    setUpdateProgress(0);
    setUpdateError("");

    let downloadedBytes = 0;
    let totalBytes: number | undefined;
    try {
      await availableUpdate.downloadAndInstall((event) => {
        if (event.event === "Started") {
          totalBytes = event.data.contentLength;
        } else if (event.event === "Progress") {
          downloadedBytes += event.data.chunkLength;
          if (totalBytes && totalBytes > 0) {
            setUpdateProgress(Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)));
          }
        } else if (event.event === "Finished") {
          setUpdateProgress(100);
        }
      });

      // Kalıcı kasa güncelleme öncesi kaydedilir ve kilitlenir.
      setVaultState("locking");
      await persistVaultRecords(recordsRef.current);
      audioRef.current?.pause();
      await lockLocalVault();
      for (const record of recordsRef.current) {
        if (record.objectUrl) URL.revokeObjectURL(record.objectUrl);
      }
      setRecords([]);
      setActiveId(null);
      setVaultState("locked");
      await relaunch();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Güncelleme kurulamadı.";
      setUpdateError(message);
      setVaultError(message);
      const actualState = await getVaultState().catch(() => "locked" as VaultState);
      setVaultState(actualState);
      setUpdateState("error");
    }
  }

  if (vaultState !== "unlocked") {
    const newVault = vaultState === "not-created";
    const busy = vaultBusy || vaultState === "creating" || vaultState === "unlocking" || vaultState === "locking";
    return (
      <main className="vault-gate-shell">
        <section className="vault-gate-card" aria-labelledby="vault-title">
          <div className="brand-mark vault-brand-mark">M</div>
          <p className="eyebrow">MİHENK · YEREL GÖREV KASASI</p>
          <h1 id="vault-title">{vaultState === "checking" ? "Yerel kasa kontrol ediliyor" : vaultState === "unavailable" ? "Masaüstü uygulaması gerekli" : newVault ? "Yerel kasanızı oluşturun" : "Yerel kasanızı açın"}</h1>
          <p className="vault-gate-description">
            Görev sesleri bu cihazdaki parola korumalı kasaya şifrelenerek kaydedilir. Kasa parolası MİHENK hesabınızdan bağımsızdır.
          </p>
          {vaultState === "checking" && <p role="status">Kasa durumu okunuyor…</p>}
          {vaultState === "unavailable" && (
            <div className="vault-gate-notice">
              MİHENK yerel kasa işlevi masaüstü uygulamasında çalışır. Tarayıcı önizlemesi kalıcı ses saklamaz.
              {vaultError && <p>{vaultError}</p>}
            </div>
          )}
          {(vaultState === "locked" || vaultState === "not-created") && (
            <form className="vault-gate-form" onSubmit={(event) => { event.preventDefault(); void submitVaultPassword(); }}>
              <label>
                <span>Kasa parolası</span>
                <input
                  type="password"
                  value={vaultPassword}
                  onChange={(event) => setVaultPassword(event.currentTarget.value)}
                  autoComplete={newVault ? "new-password" : "current-password"}
                  minLength={12}
                  required
                  autoFocus
                />
              </label>
              {newVault && (
                <label>
                  <span>Kasa parolası (tekrar)</span>
                  <input
                    type="password"
                    value={vaultPasswordConfirm}
                    onChange={(event) => setVaultPasswordConfirm(event.currentTarget.value)}
                    autoComplete="new-password"
                    minLength={12}
                    required
                  />
                </label>
              )}
              {vaultError && <p className="vault-gate-error" role="alert">{vaultError}</p>}
              <button className="primary-button vault-submit-button" type="submit" disabled={busy || backupInputBusy}>
                {busy ? "İşleniyor…" : newVault ? "Şifreli kasa oluştur" : "Kasayı aç"}
              </button>
            </form>
          )}
          {newVault && (
            <div className="vault-restore-panel">
              <input
                ref={backupInputRef}
                className="visually-hidden"
                type="file"
                accept=".mihenkbackup,application/octet-stream"
                onChange={(event) => void restoreEncryptedBackup(event.currentTarget.files?.[0])}
              />
              <button
                className="secondary-button vault-submit-button"
                type="button"
                onClick={() => backupInputRef.current?.click()}
                disabled={backupInputBusy || busy}
              >{backupInputBusy ? "Yedek doğrulanıyor…" : "Kasa yedeğinden geri yükle"}</button>
            </div>
          )}
          <div className="vault-gate-notice">
            <strong>Önizleme sınırları</strong>
            Her ses dosyası en fazla 128 MiB olabilir. Şifreli yedek snapshot, salt ve materyalleri birlikte taşır; geri yükleme yalnız boş kasaya yapılır. Kasa parolası kaybolursa yedek de açılamaz. Yalnızca sentetik veya kullanım izni bulunan test kayıtlarıyla deneyin.
          </div>
        </section>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">M</div>
          <div>
            <div className="brand-name">MİHENK</div>
            <div className="brand-caption">Bilirkişi çalışma alanı</div>
          </div>
        </div>

        <div className="workspace-label">ÇALIŞMA ALANI</div>
        <nav className="nav-list" aria-label="Ana menü">
          <button className="nav-item" type="button" disabled>
            <span className="nav-icon">▦</span>
            <span>Görevler</span>
          </button>
          <button className="nav-item active" type="button" aria-current="page">
            <span className="nav-icon">◖</span>
            <span>Ses çalışma alanı</span>
          </button>
          <button className="nav-item" type="button" disabled>
            <span className="nav-icon">≡</span>
            <span>Transkriptler</span>
          </button>
          <button className="nav-item" type="button" disabled>
            <span className="nav-icon">▤</span>
            <span>Raporlar</span>
          </button>
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="note-dot" />
            <div>
              <strong>Yerel önizleme</strong>
              <p>Çalışma bu cihazda şifreli kasada saklanır.</p>
            </div>
          </div>
          <div className="version-line">
            <span>56.12 · Ses kayıtları</span>
            <span>{import.meta.env.VITE_APP_VERSION ?? "0.1.0"}</span>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            <span>MİHENK</span>
            <span className="breadcrumb-separator">/</span>
            <strong>Ses çalışma alanı</strong>
          </div>
          <div className="topbar-status">
            <span className="status-pill"><span className="status-dot" /> Cihaz içinde</span>
            <span className={`vault-save-state ${vaultSaveStatus}`} role="status" aria-live="polite">
              {vaultSaveStatus === "pending" ? "Kaydetme bekliyor"
                : vaultSaveStatus === "saving" ? "Kaydediliyor…"
                  : vaultSaveStatus === "saved" ? "Şifreli kasaya kaydedildi"
                    : vaultSaveStatus === "error" ? "Kayıt hatası"
                      : "Kayıt durumu bekleniyor"}
            </span>
            <span className="prototype-pill">GELİŞTİRME ÖNİZLEMESİ</span>
            <button className="vault-backup-button" type="button" onClick={() => void createEncryptedBackup()} disabled={backupInputBusy || vaultBusy}>
              {backupInputBusy ? "Yedek hazırlanıyor…" : "Kasa yedeği indir"}
            </button>
            <button className="vault-lock-button" type="button" onClick={() => void lockVault()} disabled={vaultBusy || backupInputBusy}>Kasayı kilitle</button>
          </div>
        </header>

        {updateState === "available" && availableUpdate && (
          <div className="update-banner" role="status">
            <div>
              <strong>MİHENK {availableUpdate.version} güncellemesi hazır.</strong>
              <p>{availableUpdate.body || "Yeni sürüm indirilebilir."}</p>
              <small>
                {isPlaying || loadingRecordId !== null
                  ? "Dinleme veya şifreli kayıt açma işlemi tamamlanınca güncelleme otomatik kurulacak."
                  : "Kasa güncelleme öncesi kaydedilip kilitlenecek; uygulama yeniden başlatılacak."}
              </small>
            </div>
          </div>
        )}
        {updateState === "installing" && (
          <div className="update-banner" role="status">
            <div>
              <strong>Güncelleme indiriliyor ve kuruluyor.</strong>
              <p>{updateProgress > 0 ? `İlerleme: %${updateProgress}` : "İndirme başlatıldı."}</p>
            </div>
          </div>
        )}
        {updateState === "error" && (
          <div className="update-banner update-error" role="alert">
            <div>
              <strong>Güncelleme kurulamadı.</strong>
              <p>{updateError || "Bağlantıyı kontrol edip daha sonra tekrar deneyin."}</p>
            </div>
          </div>
        )}

        <section className="page-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">UZMANLIK MODÜLÜ · 56.12</div>
              <h1>Ses kayıtlarının metne dönüştürülmesi</h1>
              <p>Sesleri tek alanda dinleyin, bölümlere ayırın ve transkript taslağını düzenleyin.</p>
            </div>
            <button className="primary-button" type="button" onClick={() => fileInputRef.current?.click()}>
              <span className="button-plus">+</span>
              Ses dosyası ekle
            </button>
            <input
              ref={fileInputRef}
              className="visually-hidden"
              type="file"
              accept="audio/*"
              multiple
              onChange={(event) => {
                if (event.currentTarget.files) void addFiles(event.currentTarget.files);
                event.currentTarget.value = "";
              }}
            />
          </div>

          <div className="assignment-toolbar">
            <div className="assignment-picker">
              <label htmlFor="active-assignment">GÖREV ALANI</label>
              <select
                id="active-assignment"
                value={activeAssignmentId ?? ""}
                onChange={(event) => switchAssignment(event.currentTarget.value)}
                disabled={assignments.length === 0}
              >
                {assignments.map((assignment) => (
                  <option key={assignment.id} value={assignment.id}>{assignment.name}</option>
                ))}
              </select>
              <small>Sesler ve transkriptler seçili görev alanında tutulur.</small>
            </div>
            <form className="assignment-create" onSubmit={(event) => { event.preventDefault(); void addAssignment(); }}>
              <label htmlFor="new-assignment-name">YENİ GÖREV ALANI</label>
              <div>
                <input
                  id="new-assignment-name"
                  type="text"
                  maxLength={100}
                  value={assignmentNameDraft}
                  onChange={(event) => setAssignmentNameDraft(event.currentTarget.value)}
                  placeholder="Örn. Görev A / İnceleme 01"
                  aria-label="Yeni görev alanı etiketi"
                />
                <button className="secondary-button" type="submit" disabled={!assignmentNameDraft.trim()}>Görev oluştur</button>
              </div>
              <small>Etikette kişi adı veya resmî dosya numarası kullanmayın.</small>
            </form>
          </div>

          {activeAssignment && (
            <form className="assignment-profile" onSubmit={(event) => void saveAssignmentProfile(event)}>
              <div className="assignment-profile-heading">
                <div>
                  <strong>Görev / atama profili</strong>
                  <span>Bu bilgiler yalnızca bu cihazdaki şifreli kasada saklanır. {assignmentProfileDirty ? "Kaydedilmemiş değişiklik var." : "Güncel."}</span>
                </div>
                <button className="primary-button" type="submit" disabled={assignmentProfileBusy || !assignmentProfileDirty}>
                  {assignmentProfileBusy ? "Kaydediliyor…" : assignmentProfileDirty ? "Görev profilini kaydet" : "Profil kayıtlı"}
                </button>
              </div>
              <div className="assignment-profile-grid">
                <label className="assignment-profile-wide">
                  <span>Görev alanı adı</span>
                  <input required maxLength={100} value={assignmentProfileDraft.name}
                    onChange={(event) => updateAssignmentProfileField("name", event.currentTarget.value)} />
                </label>
                <label>
                  <span>Yerel dosya referansı</span>
                  <input maxLength={160} value={assignmentProfileDraft.localReference}
                    onChange={(event) => updateAssignmentProfileField("localReference", event.currentTarget.value)}
                    placeholder="Cihaz içinde kullanacağınız kısa referans" />
                </label>
                <label>
                  <span>Atama mercii</span>
                  <input maxLength={240} value={assignmentProfileDraft.authority}
                    onChange={(event) => updateAssignmentProfileField("authority", event.currentTarget.value)}
                    placeholder="Mahkeme / savcılık / kurum" />
                </label>
                <label>
                  <span>Görevlendirme tarihi</span>
                  <input type="date" value={assignmentProfileDraft.appointedAt}
                    onChange={(event) => updateAssignmentProfileField("appointedAt", event.currentTarget.value)} />
                </label>
                <label>
                  <span>Rapor için son tarih</span>
                  <input type="date" value={assignmentProfileDraft.dueAt}
                    onChange={(event) => updateAssignmentProfileField("dueAt", event.currentTarget.value)} />
                </label>
                <label className="assignment-profile-wide">
                  <span>İnceleme kapsamı / görevin konusu</span>
                  <textarea rows={2} maxLength={4000} value={assignmentProfileDraft.scope}
                    onChange={(event) => updateAssignmentProfileField("scope", event.currentTarget.value)}
                    placeholder="Görevlendirme yazısında belirtilen inceleme kapsamını kendi notunuz olarak girin." />
                </label>
                <label className="assignment-profile-wide">
                  <span>Yanıtlanacak sorular (her satıra bir soru)</span>
                  <textarea rows={4} maxLength={40000} value={assignmentProfileDraft.questionsText}
                    onChange={(event) => updateAssignmentProfileField("questionsText", event.currentTarget.value)}
                    placeholder="1. ...&#10;2. ..." />
                </label>
              </div>
            </form>
          )}

          <div className="prototype-warning" role="status">
            <span className="warning-icon">i</span>
            <div>
              <strong>Prototip sınırı</strong>
              <span>
                Ses dosyaları yerel kasaya AES-GCM ile şifrelenerek kaydedilir; parola koruması Stronghold ile sağlanır.
                Bu önizlemede dosya başına 128 MiB sınırı vardır; dinleme sırasında dosya bellekte çözülür.
                Kasa yedeğini boş kasaya geri yükleyebilirsiniz; aynı parola gerekir. Paket ayrıca şifrelenmez, ancak içindeki Stronghold snapshot ve AES-GCM materyalleri şifrelidir. SHA-256 denetimi imza değildir. ASR henüz bağlı değildir. Gerçek vaka materyali kullanmayın.
              </span>
            </div>
          </div>

          <div className="stats-row">
            <div className="stat-card">
              <span className="stat-label">KAYIT SAYISI</span>
              <strong>{assignmentRecords.length}</strong>
              <span className="stat-foot">Seçili görev alanında</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">TOPLAM SES SÜRESİ</span>
              <strong>{formatTime(totalDuration)}</strong>
              <span className="stat-foot">Süre bilgisi okunan dosyalar</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">TRANSKRİPT DURUMU</span>
              <strong>{assignmentRecords.reduce((sum, record) => sum + record.segments.length, 0)}</strong>
              <span className="stat-foot">Elle eklenen bölümler</span>
            </div>
            <div className="stat-card engine-card">
              <span className="stat-label">ASR MOTORU</span>
              <strong>Bağlı değil</strong>
              <span className="stat-foot">Yerel motor entegrasyonu bekliyor</span>
            </div>
          </div>

          <div className="workbench-grid">
            <section className="panel recordings-panel">
              <div className="panel-header">
                <div>
                  <h2>Kayıt kuyruğu</h2>
                  <p>{assignmentRecords.length} ses dosyası</p>
                </div>
                <button className="icon-button" type="button" aria-label="Ses dosyası ekle" onClick={() => fileInputRef.current?.click()}>+</button>
              </div>

              <div
                className={`dropzone ${isDragging ? "dragging" : ""}`}
                onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setIsDragging(false);
                  void addFiles(event.dataTransfer.files);
                }}
              >
                <div className="drop-icon">♫</div>
                <strong>Ses dosyalarını buraya bırakın</strong>
                <span>veya <button type="button" className="text-button" onClick={() => fileInputRef.current?.click()}>cihazdan seçin</button></span>
                <small>Birden fazla dosya seçebilirsiniz</small>
              </div>

              <div className="record-list">
                {assignmentRecords.length === 0 ? (
                  <div className="empty-list">
                    <span className="empty-symbol">◌</span>
                    <strong>Henüz kayıt yok</strong>
                    <p>İlk ses dosyanızı ekleyerek başlayın.</p>
                  </div>
                ) : assignmentRecords.map((record, index) => (
                  <div key={record.id} className={`record-item ${record.id === activeId ? "selected" : ""}`}>
                    <button className="record-select" type="button" onClick={() => {
                      void selectRecord(record.id);
                    }}>
                      <span className="record-number">{String(index + 1).padStart(2, "0")}</span>
                      <span className="record-main">
                        <strong title={record.file.name}>{record.file.name}</strong>
                        <small>{formatBytes(record.vaultMetadata?.sizeBytes ?? record.file.size)} · {formatTime(record.durationSeconds)}</small>
                        <small className={record.hashState === "hesaplandi" ? "hash-ok" : "hash-muted"}>
                          {hashLabel(record)}
                        </small>
                      </span>
                    </button>
                    <button className="remove-record" type="button" aria-label={`${record.file.name} kaydını kaldır`} onClick={() => void removeRecord(record.id)}>×</button>
                  </div>
                ))}
              </div>
              <div className="queue-footer">
                <span>Orijinaller bu prototipte değiştirilmez.</span>
                <span>{assignmentRecords.length} kayıt · seçili görev</span>
              </div>
            </section>

            <section className="panel player-panel">
              <div className="panel-header">
                <div>
                  <h2>Dinleme alanı</h2>
                  <p>Seçili kaydın oynatma ve zaman kontrolü</p>
                </div>
                {activeRecord && <span className="file-kind">SES DOSYASI</span>}
              </div>

              {activeRecord && activeRecord.objectUrl ? (
                <div className="player-content">
                  <div className="active-file-card">
                    <div className="file-icon">♫</div>
                    <div className="active-file-details">
                      <strong title={activeRecord.file.name}>{activeRecord.file.name}</strong>
                      <span>{activeRecord.vaultMetadata?.mediaType || activeRecord.file.type || "Ses biçimi tarayıcı tarafından bildirilmedi"} · {formatBytes(activeRecord.vaultMetadata?.sizeBytes ?? activeRecord.file.size)}</span>
                    </div>
                    <span className="file-index">#{String(assignmentRecords.findIndex((item) => item.id === activeRecord.id) + 1).padStart(2, "0")}</span>
                  </div>

                  <div className="audio-stage">
                    <div className="stage-caption">
                      <span>OYNATMA KONTROLÜ · TEMSİLİ SES GÖRSELİ</span>
                      <span>{formatTime(currentTime)} / {formatTime(activeRecord.durationSeconds)}</span>
                    </div>
                    <div className="wave-placeholder" aria-hidden="true" title="Temsili görsel; gerçek dalga formu hesaplanmıyor">
                      {Array.from({ length: 72 }, (_, index) => (
                        <span key={index} style={{ height: `${12 + ((index * 17 + 13) % 40)}%` }} />
                      ))}
                    </div>
                    <input
                      className="seek-slider"
                      type="range"
                      min={0}
                      max={Math.max(activeDuration, 0.1)}
                      step={0.1}
                      value={Math.min(currentTime, activeDuration || 0)}
                      onChange={(event) => seekTo(Number(event.currentTarget.value))}
                      aria-label="Ses konumu"
                    />
                    <audio
                      key={activeRecord.id}
                      ref={audioRef}
                      src={activeRecord.objectUrl}
                      controls
                      preload="metadata"
                      onLoadedMetadata={handleMetadata}
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      onTimeUpdate={handleAudioTimeUpdate}
                      onEnded={() => { setIsPlaying(false); setCurrentTime(activeRecord.durationSeconds ?? currentTime); }}
                      onError={() => setNotice("Ses açılamadı. Dosya biçimi bu ortamda desteklenmiyor olabilir.")}
                    />
                  </div>

                  <div className="source-integrity">
                    <div className="integrity-heading">
                      <span className="integrity-check">✓</span>
                      <div>
                        <strong>Kaynak dosya ön kontrolü</strong>
                        <small>{hashLabel(activeRecord)}</small>
                      </div>
                    </div>
                    <div className="hash-value">
                      {activeRecord.sha256
                        ? <code>{activeRecord.sha256}</code>
                        : <span>
                            {activeRecord.hashState === "buyuk-dosya"
                              ? "Dosya 128 MiB sınırını aşıyor; bu prototip hash hesaplamasını atladı."
                              : activeRecord.hashState === "hesaplaniyor"
                                ? "SHA-256 hesaplanıyor…"
                                : "Hash bilgisi henüz yok."}
                          </span>}
                    </div>
                    <p>Bu değer yalnızca prototip ön kontrolüdür; delil kökeni veya özgünlük doğrulaması değildir.</p>
                  </div>

                  <div className="player-actions">
                    <button className="secondary-button" type="button" onClick={addSegment}>+ Dinleme konumuna bölüm ekle</button>
                    <span>Metin bölümleri elle girilir</span>
                    <span className="keyboard-hint">Kısayollar: Space oynat/duraklat · ← / → 5 saniye sar · Ctrl / ⌘ + Enter bölüm ekle. Bölüm kartından aralık tekrarı açılabilir.</span>
                  </div>
                </div>
              ) : activeRecord ? (
                <div className="empty-player">
                  <div className="empty-audio-icon">◌</div>
                  <h3>{loadingRecordId === activeRecord.id ? "Şifreli kayıt açılıyor" : "Dinleme için kaydı açın"}</h3>
                  <p>{loadingRecordId === activeRecord.id ? "Dosya bütünlüğü doğrulanarak belleğe alınıyor." : "Kayıt seçildi; şifreli ses dosyası açılmayı bekliyor."}</p>
                  {loadingRecordId !== activeRecord.id && (
                    <button className="secondary-button" type="button" onClick={() => void selectRecord(activeRecord.id)}>Kaydı aç</button>
                  )}
                </div>
              ) : (
                <div className="empty-player">
                  <div className="empty-audio-icon">♫</div>
                  <h3>Dinlemeye hazır</h3>
                  <p>Soldaki alandan bir ses kaydı seçin veya yeni kayıt ekleyin.</p>
                  <button className="secondary-button" type="button" onClick={() => fileInputRef.current?.click()}>Ses dosyası seç</button>
                </div>
              )}
            </section>

            <section className="panel transcript-panel">
              <div className="panel-header transcript-heading">
                <div>
                  <h2>Transkript taslağı</h2>
                  <p>{activeRecord ? `${activeRecord.segments.length} bölüm · elle düzenleme` : "Önce bir kayıt seçin"}</p>
                </div>
                <span className="draft-pill">TASLAK</span>
              </div>

              {activeRecord ? (
                <>
                  <div className="transcript-toolbar">
                    <span><span className="toolbar-dot" /> Uzman kontrolü bekliyor</span>
                    <button className="text-button" type="button" onClick={addSegment} disabled={!activeRecord}>+ Bölüm</button>
                  </div>
                  <div className="segment-list">
                    {activeRecord.segments.length === 0 ? (
                      <div className="empty-transcript">
                        <span>¶</span>
                        <strong>Henüz transkript bölümü yok</strong>
                        <p>Sesin istediğiniz konumunda durdurup “Bölüm ekle” düğmesini kullanın.</p>
                      </div>
                    ) : activeRecord.segments.map((segment) => (
                      <article className="segment-card" key={segment.id}>
                        <div className="segment-topline">
                          <button className="timestamp-button" type="button" onClick={() => jumpTo(segment.startSeconds)}>
                            <span>▶</span> {formatTime(segment.startSeconds)}
                          </button>
                          <span className="segment-number">
                            {formatTime(segment.startSeconds)}{segment.endSeconds === null ? " · Bitiş işaretlenmedi" : ` – ${formatTime(segment.endSeconds)}`}
                          </span>
                          <button
                            className="segment-end-button"
                            type="button"
                            onClick={() => markSegmentEnd(segment.id)}
                            aria-label="Geçerli oynatma konumunu bölüm bitişi olarak kaydet"
                          >Bitişi işaretle</button>
                          <button
                            className={`segment-repeat-button ${repeatSegmentId === segment.id ? "active" : ""}`}
                            type="button"
                            onClick={() => toggleSegmentRepeat(segment)}
                            disabled={segment.endSeconds === null || segment.endSeconds <= segment.startSeconds}
                            aria-pressed={repeatSegmentId === segment.id}
                            title={segment.endSeconds === null ? "Önce bölüm bitişini işaretleyin" : "Bu ses aralığını tekrar dinleyin"}
                          >{repeatSegmentId === segment.id ? "Tekrar açık" : "Aralığı tekrarla"}</button>
                          <button className="segment-delete" type="button" aria-label="Bölümü sil" onClick={() => removeSegment(segment.id)}>×</button>
                        </div>
                        <textarea
                          value={segment.text}
                          onChange={(event) => {
                            const value = event.currentTarget.value;
                            updateSegment(segment.id, (item) => ({ ...item, text: value }));
                          }}
                          placeholder="Duyduğunuz ifadeyi buraya yazın…"
                          rows={3}
                          aria-label={`${formatTime(segment.startSeconds)} zamanındaki transkript`}
                        />
                        <div className="segment-meta">
                          <label>
                            <span>Konuşmacı</span>
                            <input
                              value={segment.speaker}
                              onChange={(event) => {
                                const value = event.currentTarget.value;
                                updateSegment(segment.id, (item) => ({ ...item, speaker: value }));
                              }}
                              aria-label="Anonim konuşmacı etiketi"
                            />
                          </label>
                          <label>
                            <span>Durum</span>
                            <select
                              value={segment.status}
                              onChange={(event) => {
                                const value = event.currentTarget.value as SegmentStatus;
                                updateSegment(segment.id, (item) => ({ ...item, status: value }));
                              }}
                              aria-label="Bölümün kontrol durumu"
                            >
                              <option value="taslak">Taslak</option>
                              <option value="belirsiz">Belirsiz</option>
                              <option value="uzman-onayli">Uzman kontrol etti</option>
                            </select>
                          </label>
                        </div>
                      </article>
                    ))}
                  </div>
                  <div className="export-actions">
                    <button className="secondary-button export-text" type="button" onClick={exportText}>TXT dışa aktar</button>
                    <button className="secondary-button export-docx" type="button" onClick={exportDocx}>DOCX taslak</button>
                    <button className="secondary-button export-odt" type="button" onClick={exportOdt}>ODT taslak</button>
                    <button className="primary-button export-json" type="button" onClick={exportJson}>JSON dışa aktar</button>
                  </div>
                </>
              ) : (
                <div className="empty-transcript large">
                  <span>¶</span>
                  <strong>Transkript alanı</strong>
                  <p>Bir ses kaydı seçtiğinizde bölümler burada düzenlenir.</p>
                </div>
              )}
            </section>
          </div>

          <footer className="app-footer">
            <span className="footer-state"><span className="status-dot" /> {notice}</span>
            <span>Yerel şifreli kasa · Bulut yok · ASR henüz bağlı değil</span>
          </footer>
        </section>
      </main>
    </div>
  );
}
