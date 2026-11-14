import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  createSegment,
  formatBytes,
  formatTime,
  repeatStartIfReached,
  safeFileStem,
  type AudioRecord,
  type SegmentStatus,
} from "./domain/audio";
import { createVaultAudioRecord } from "./domain/vault-audio-record";
import { buildTranscriptExport, buildTranscriptText } from "./domain/export";
import { buildDocxReport, buildOdtReport } from "./domain/report";
import {
  formatAssignmentQuestions,
  hasAssignmentProfileChanges,
  parseAssignmentQuestions,
  resolveActiveAssignment,
} from "./domain/assignment";
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
  closeStoredAudioPlaybackSession,
  clearStoredAudioPlaybackSessions,
  saveStoredAudioMetadata,
  getSedaModelStatus,
  installSedaModel,
  transcribeStoredAudio,
  type SedaModelStatus,
  unlockLocalVault,
  exportLocalVaultBackup,
  restoreLocalVaultBackup,
  type VaultAudioMetadata,
  type VaultAssignment,
  type VaultState,
} from "./domain/vault";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { SerialTaskQueue } from "./domain/save-queue";

const AUDIO_EXTENSION = /\.(wav|mp3|m4a|aac|ogg|flac|aiff?)$/i;

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
    case "buyuk-dosya": return "240 MiB üst sınır — atlandı";
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
  const [sedaModelStatus, setSedaModelStatus] = useState<SedaModelStatus | null>(null);
  const [sedaInstalling, setSedaInstalling] = useState(false);
  const [asrBusyRecordId, setAsrBusyRecordId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const recordsRef = useRef<AudioRecord[]>([]);
  const assignmentsRef = useRef<VaultAssignment[]>([]);
  const activeAssignmentIdRef = useRef<string | null>(null);
  const assignmentProfileDraftRef = useRef<AssignmentProfileDraft>(EMPTY_ASSIGNMENT_PROFILE);
  const vaultStateRef = useRef(vaultState);
  const saveQueueRef = useRef(new SerialTaskQueue());
  const saveRevisionRef = useRef(0);
  const allowWindowCloseRef = useRef(false);
  const windowCloseInProgressRef = useRef(false);

  useLayoutEffect(() => {
    recordsRef.current = records;
    assignmentsRef.current = assignments;
    activeAssignmentIdRef.current = activeAssignmentId;
    assignmentProfileDraftRef.current = assignmentProfileDraft;
    vaultStateRef.current = vaultState;
  }, [records, assignments, activeAssignmentId, assignmentProfileDraft, vaultState]);

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

  useEffect(() => () => {
    for (const record of recordsRef.current) {
      if (record.objectUrl.startsWith("blob:")) URL.revokeObjectURL(record.objectUrl);
    }
    void clearStoredAudioPlaybackSessions().catch(() => undefined);
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
      questionsText: formatAssignmentQuestions(activeAssignment.questions),
    });
  }, [activeAssignmentId]);

  const assignmentProfileDirty = Boolean(
    activeAssignment && hasAssignmentProfileChanges(activeAssignment, assignmentProfileDraft),
  );

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
  }, [availableUpdate, updateState, vaultState, isPlaying, loadingRecordId, assignmentProfileDirty]);

  const activeRecord = useMemo(
    () => assignmentRecords.find((record) => record.id === activeId) ?? null,
    [assignmentRecords, activeId],
  );

  const totalDuration = useMemo(
    () => assignmentRecords.reduce((total, record) => total + (record.durationSeconds ?? 0), 0),
    [assignmentRecords],
  );

  useEffect(() => {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return;
    let cancelled = false;
    void getSedaModelStatus().then((status) => {
      if (!cancelled) setSedaModelStatus(status);
    }).catch(() => {
      if (!cancelled) setSedaModelStatus(null);
    });
    return () => { cancelled = true; };
  }, []);

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
    const restored: AudioRecord[] = stored.map((metadata) =>
      createVaultAudioRecord(metadata, metadata.sha256Preview ? "hesaplandi" : "bekliyor")
    );
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
    try {
      await saveQueueRef.current.enqueue(write);
      if (revision === saveRevisionRef.current) setVaultSaveStatus("saved");
    } catch (error) {
      if (revision === saveRevisionRef.current) setVaultSaveStatus("error");
      throw error;
    }
  }

  async function persistAssignmentProfileSnapshot(
    assignmentId: string,
    snapshot: AssignmentProfileDraft,
  ): Promise<void> {
    const write = async () => {
      const current = assignmentsRef.current.find((item) => item.id === assignmentId);
      if (!current) throw new Error("Görev alanı bulunamadı.");

      if (!hasAssignmentProfileChanges(current, snapshot)) return;

      const updated = await updateVaultAssignment(assignmentId, {
        name: snapshot.name,
        localReference: snapshot.localReference,
        authority: snapshot.authority,
        appointedAt: snapshot.appointedAt,
        dueAt: snapshot.dueAt,
        scope: snapshot.scope,
        questions: parseAssignmentQuestions(snapshot.questionsText),
      });

      const nextAssignments = assignmentsRef.current.map((item) => (
        item.id === updated.id ? updated : item
      ));
      assignmentsRef.current = nextAssignments;
      setAssignments(nextAssignments);

      if (
        activeAssignmentIdRef.current === assignmentId &&
        JSON.stringify(assignmentProfileDraftRef.current) === JSON.stringify(snapshot)
      ) {
        const normalizedDraft: AssignmentProfileDraft = {
          name: updated.name,
          localReference: updated.localReference,
          authority: updated.authority,
          appointedAt: updated.appointedAt,
          dueAt: updated.dueAt,
          scope: updated.scope,
          questionsText: formatAssignmentQuestions(updated.questions),
        };
        assignmentProfileDraftRef.current = normalizedDraft;
        setAssignmentProfileDraft(normalizedDraft);
      }
    };

    const revision = ++saveRevisionRef.current;
    setVaultSaveStatus("saving");
    try {
      await saveQueueRef.current.enqueue(write);
      if (revision === saveRevisionRef.current) setVaultSaveStatus("saved");
    } catch (error) {
      if (revision === saveRevisionRef.current) setVaultSaveStatus("error");
      throw error;
    }
  }

  async function persistCurrentVaultState(): Promise<void> {
    // Finish storage work already in progress before taking the latest UI snapshot.
    await saveQueueRef.current.drain();
    await persistVaultRecords(recordsRef.current);

    const assignmentId = activeAssignmentIdRef.current;
    if (assignmentId) {
      const stored = assignmentsRef.current.find((item) => item.id === assignmentId);
      const draft = { ...assignmentProfileDraftRef.current };
      if (stored && hasAssignmentProfileChanges(stored, draft)) {
        await persistAssignmentProfileSnapshot(assignmentId, draft);
      }
    }
    await saveQueueRef.current.drain();
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

  useEffect(() => {
    if (vaultState !== "unlocked" || !activeAssignment || !assignmentProfileDirty) return;
    const snapshot = { ...assignmentProfileDraft };
    if (!snapshot.name.trim()) return;

    setVaultSaveStatus("pending");
    const assignmentId = activeAssignment.id;
    const timeout = window.setTimeout(() => {
      void persistAssignmentProfileSnapshot(assignmentId, snapshot).catch((error) => {
        setNotice(error instanceof Error
          ? `Görev profili otomatik kaydedilemedi: ${error.message}`
          : "Görev profili otomatik kaydedilemedi.");
      });
    }, 450);
    return () => window.clearTimeout(timeout);
  }, [vaultState, activeAssignment?.id, assignmentProfileDraft, assignmentProfileDirty]);

  useEffect(() => {
    const isDesktopRuntime = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
    if (!isDesktopRuntime) return;

    let disposed = false;
    let unlisten: (() => void) | undefined;
    const currentWindow = getCurrentWindow();

    void currentWindow.onCloseRequested((event) => {
      if (allowWindowCloseRef.current) return;
      // Tauri requires this to happen synchronously, before the async flush starts.
      event.preventDefault();
      if (windowCloseInProgressRef.current) return;
      windowCloseInProgressRef.current = true;

      void (async () => {
        try {
          await saveQueueRef.current.drain();
          const currentState = vaultStateRef.current;
          if (currentState === "creating" || currentState === "unlocking" || currentState === "locking") {
            throw new Error("Kasa işlemi devam ediyor. İşlem tamamlandıktan sonra pencereyi kapatın.");
          }
          if (currentState === "unlocked") {
            await persistCurrentVaultState();
          }

          allowWindowCloseRef.current = true;
          await currentWindow.close();
        } catch (error) {
          allowWindowCloseRef.current = false;
          windowCloseInProgressRef.current = false;
          const message = error instanceof Error ? error.message : "Kapanış öncesi kasa kaydı tamamlanamadı.";
          setVaultSaveStatus("error");
          setVaultError(message);
          setNotice("Bekleyen kayıtlar tamamlanamadığı için pencere açık bırakıldı.");
        }
      })();
    }).then((stopListening) => {
      if (disposed) stopListening();
      else unlisten = stopListening;
    }).catch((error) => {
      setVaultError(error instanceof Error ? error.message : "Güvenli kapanış denetimi başlatılamadı.");
    });

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "hidden" || vaultStateRef.current !== "unlocked") return;
      void persistCurrentVaultState().catch((error) => {
        setVaultSaveStatus("error");
        setNotice(error instanceof Error ? `Arka plana geçerken kayıt tamamlanamadı: ${error.message}` : "Arka plana geçerken kayıt tamamlanamadı.");
      });
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      disposed = true;
      unlisten?.();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

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
    setVaultBusy(true);
    setVaultState("locking");
    try {
      await persistCurrentVaultState();
      audioRef.current?.pause();
      audioRef.current?.removeAttribute("src");
      audioRef.current?.load();
      await clearStoredAudioPlaybackSessions();
      await lockLocalVault();
      for (const record of recordsRef.current) {
        if (record.objectUrl.startsWith("blob:")) URL.revokeObjectURL(record.objectUrl);
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
    if (record.playbackSessionId || !record.vaultMetadata) return;

    setLoadingRecordId(recordId);
    try {
      await clearStoredAudioPlaybackSessions();
      setRecords((current) => current.map((item) => (
        item.playbackSessionId ? { ...item, objectUrl: "", playbackSessionId: undefined } : item
      )));
      const playback = await openStoredAudio(record.vaultMetadata);
      updateRecord(recordId, (item) => ({
        ...item,
        objectUrl: playback.url,
        playbackSessionId: playback.sessionId,
      }));
      setNotice("Şifreli ses kaydı doğrulanmış bloklarla dinlemeye açıldı.");
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
      const created = await saveQueueRef.current.enqueue(() => createVaultAssignment(name));
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
      await persistAssignmentProfileSnapshot(activeAssignment.id, { ...assignmentProfileDraft });
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
    audioRef.current?.removeAttribute("src");
    audioRef.current?.load();
    void clearStoredAudioPlaybackSessions().catch(() => undefined);
    setRecords((current) => current.map((record) => (
      record.playbackSessionId ? { ...record, objectUrl: "", playbackSessionId: undefined } : record
    )));
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
    const accepted = incoming.filter((file) => AUDIO_EXTENSION.test(file.name));
    const rejectedCount = incoming.length - accepted.length;
    if (accepted.length === 0) {
      setNotice("Seçilen dosyalarda tanınan bir ses dosyası bulunamadı.");
      return;
    }

    let addedCount = 0;
    let failedCount = 0;
    let duplicateContentCount = 0;
    let reusedNameCount = 0;
    const knownHashes = new Set<string>();
    const knownNames = new Map<string, string | null>();
    for (const existing of records) {
      if (existing.sha256) knownHashes.add(existing.sha256);
      knownNames.set(existing.vaultMetadata?.fileName ?? existing.file.name, existing.sha256);
    }
    for (const file of accepted) {
      try {
        setNotice(`“${file.name}” şifreli yerel kasaya alınıyor…`);
        const metadata = await saveQueueRef.current.enqueue(
          () => importAudioToVault(file, activeAssignmentId)
        );
        const record = createVaultAudioRecord(metadata, metadata.sha256Preview ? "hesaplandi" : "hata");
        if (metadata.sha256Preview && knownHashes.has(metadata.sha256Preview)) {
          duplicateContentCount += 1;
        }
        if (knownNames.has(metadata.fileName) && knownNames.get(metadata.fileName) !== metadata.sha256Preview) {
          reusedNameCount += 1;
        }
        if (metadata.sha256Preview) knownHashes.add(metadata.sha256Preview);
        knownNames.set(metadata.fileName, metadata.sha256Preview);

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
      duplicateContentCount > 0 ? `${duplicateContentCount} dosyanın SHA-256 içeriği mevcut materyalle aynı; ayrı kayıt korundu` : "",
      reusedNameCount > 0 ? `${reusedNameCount} dosya adı farklı içerikle yeniden kullanılıyor; ayrı kayıt korundu` : "",
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
        segment.id === segmentId ? { ...update(segment), source: "uzman" } : segment
      )),
    }));
  }

  async function installLocalSedaModel(): Promise<void> {
    if (sedaInstalling) return;
    setSedaInstalling(true);
    setNotice("SEDA v0.1 yerel modeli sabit sürümden indiriliyor ve bütünlük doğrulaması yapılıyor…");
    try {
      const status = await installSedaModel();
      setSedaModelStatus(status);
      setNotice(status.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "SEDA modeli kurulamadı.";
      setNotice(message);
      setSedaModelStatus((current) => current ? { ...current, installed: false, message } : null);
    } finally {
      setSedaInstalling(false);
    }
  }

  async function transcribeActiveRecord(): Promise<void> {
    if (!activeRecord?.vaultMetadata || vaultState !== "unlocked") {
      setNotice("Transkripsiyon için açık kasa ve kayıtlı bir ses materyali gerekir.");
      return;
    }
    if (!sedaModelStatus?.installed) {
      setNotice("Önce Yerel Model bölümünden SEDA v0.1'i kurun.");
      return;
    }
    if (asrBusyRecordId) return;

    const recordId = activeRecord.id;
    const metadata = activeRecord.vaultMetadata;
    setAsrBusyRecordId(recordId);
    setNotice("Şifreli ses blokları doğrulanarak yerel SEDA transkripsiyonu hazırlanıyor…");
    try {
      const jobId = crypto.randomUUID().replaceAll("-", "").toLowerCase();
      const generated = await saveQueueRef.current.enqueue(() => transcribeStoredAudio(metadata, jobId));
      setRecords((current) => current.map((record) => record.id === recordId
        ? {
            ...record,
            segments: [...record.segments.filter((segment) => segment.source !== "asr"), ...generated].sort((a, b) => (
              a.startSeconds - b.startSeconds
            )),
          }
        : record));
      setNotice(`SEDA ${generated.length} makine taslağı bölümü oluşturdu. Her bölümü ses kaydından dinleyerek uzman kontrolü yapın.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Yerel transkripsiyon tamamlanamadı.");
    } finally {
      setAsrBusyRecordId(null);
    }
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
        item.id === segmentId ? { ...item, endSeconds, source: "uzman" } : item
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
      if (activeId === recordId) {
        audioRef.current?.pause();
        audioRef.current?.removeAttribute("src");
        audioRef.current?.load();
        setIsPlaying(false);
      }
      if (target.playbackSessionId) await closeStoredAudioPlaybackSession(target.playbackSessionId);
      if (target.vaultMetadata) {
        await saveQueueRef.current.enqueue(() => deleteStoredAudio(recordId));
      }
      if (target.objectUrl.startsWith("blob:")) URL.revokeObjectURL(target.objectUrl);
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
    if (vaultState !== "unlocked" || backupInputBusy) return;
    setBackupInputBusy(true);
    try {
      await persistCurrentVaultState();
      const dateStamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
      const saved = await saveQueueRef.current.enqueue(() => exportLocalVaultBackup(`MİHENK-yerel-kasa-${dateStamp}.mihenkbackup`));
      setNotice(saved
        ? "Kasa yedeği oluşturuldu. İçindeki veriler mevcut kasa parolasıyla açılır."
        : "Kasa yedeği oluşturma işlemi iptal edildi.");
    } catch (error) {
      setNotice(error instanceof Error ? `Kasa yedeği oluşturulamadı: ${error.message}` : "Şifreli yedek oluşturulamadı.");
    } finally {
      setBackupInputBusy(false);
    }
  }

  async function restoreEncryptedBackup(): Promise<void> {
    if (vaultBusy || backupInputBusy || vaultState !== "not-created") return;

    setBackupInputBusy(true);
    setVaultError("");
    let restored = false;
    try {
      restored = await saveQueueRef.current.enqueue(() => restoreLocalVaultBackup());
      if (!restored) {
        setNotice("Kasa yedeği seçme işlemi iptal edildi.");
        return;
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
              <button
                className="secondary-button vault-submit-button"
                type="button"
                onClick={() => void restoreEncryptedBackup()}
                disabled={backupInputBusy || busy}
              >{backupInputBusy ? "Yedek doğrulanıyor…" : "Kasa yedeğinden geri yükle"}</button>
            </div>
          )}
          <div className="vault-gate-notice">
            <strong>Önizleme sınırları</strong>
            Her ses dosyası en fazla 240 MiB olabilir. Şifreli yedek snapshot, salt ve materyalleri birlikte taşır; geri yükleme yalnız boş kasaya yapılır. Kasa parolası kaybolursa yedek de açılamaz. Yalnızca sentetik veya kullanım izni bulunan test kayıtlarıyla deneyin.
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
                Ses dosyaları AES-GCM bloklarıyla şifrelenir; parola koruması Stronghold ile sağlanır.
                Dinleme, istenen en fazla 1 MiB'lik doğrulanmış aralıklarla yürür; uygulama kodu tam dosyanın çözülmüş kopyasını üretmez.
                Bu sürümde dosya başına 240 MiB üst sınırı uygulanır.
                Kasa yedeğini boş kasaya geri yükleyebilirsiniz; aynı parola gerekir. Paket ayrıca şifrelenmez, ancak içindeki Stronghold snapshot ve AES-GCM materyalleri şifrelidir. SHA-256 denetimi imza değildir. SEDA v0.1 yerel ASR taslak üretir; kelime hizalaması/uzman onayı sağlamaz. Gerçek vaka materyali kullanmayın.
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
              <span className="stat-label">YEREL ASR · SEDA v0.1</span>
              <strong>{sedaModelStatus?.installed ? "Kurulu" : sedaInstalling ? "İndiriliyor" : "Kurulu değil"}</strong>
              <span className="stat-foot">{sedaModelStatus?.installed
                ? `${(sedaModelStatus.bytesOnDisk / (1024 * 1024)).toFixed(1)} MiB · çevrimdışı`
                : "İndirme sonrası yerel CPU ile çalışır"}</span>
              <button
                className="secondary-button"
                type="button"
                onClick={() => void installLocalSedaModel()}
                disabled={sedaInstalling || sedaModelStatus?.installed}
              >{sedaInstalling ? "Model kuruluyor…" : sedaModelStatus?.installed ? "Model hazır" : "Yerel modeli kur"}</button>
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
                        <strong>Kaynak SHA-256 özeti</strong>
                        <small>{hashLabel(activeRecord)}</small>
                      </div>
                    </div>
                    <div className="hash-value">
                      {activeRecord.sha256
                        ? <code>{activeRecord.sha256}</code>
                        : <span>
                            {activeRecord.hashState === "buyuk-dosya"
                              ? "Dosya 240 MiB sınırını aşıyor; kasaya alınmadı ve SHA-256 hesaplanmadı."
                              : activeRecord.hashState === "hesaplaniyor"
                                ? "SHA-256 hesaplanıyor…"
                                : "Hash bilgisi henüz yok."}
                          </span>}
                    </div>
                    <p>Özet, içe aktarma sırasında okunan kaynak byte’larını tanımlar; bağımsız read-back, delil kökeni, imza veya ses özgünlüğü kanıtı değildir.</p>
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
                    <span><span className="toolbar-dot" /> Makine taslağı / uzman kontrolü</span>
                    <div className="transcript-toolbar-actions">
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => void transcribeActiveRecord()}
                        disabled={!sedaModelStatus?.installed || asrBusyRecordId === activeRecord.id || vaultState !== "unlocked"}
                      >{asrBusyRecordId === activeRecord.id ? "Transkripsiyon…" : "Yerel ASR çalıştır"}</button>
                      <button className="text-button" type="button" onClick={addSegment} disabled={!activeRecord}>+ Bölüm</button>
                    </div>
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
                          <span className={`segment-source ${segment.source === "asr" ? "machine" : "expert"}`}>{segment.source === "asr" ? "MAKİNE TASLAĞI" : "UZMAN"}</span>
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
            <span>Yerel şifreli kasa · SEDA v0.1 yerel ASR · Model kurulduktan sonra çevrimdışı</span>
          </footer>
        </section>
      </main>
    </div>
  );
}
