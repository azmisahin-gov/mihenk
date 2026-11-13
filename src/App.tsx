import { useEffect, useMemo, useRef, useState } from "react";
import {
  calculatePreviewHash,
  createSegment,
  formatBytes,
  formatTime,
  safeFileStem,
  type AudioRecord,
  type SegmentStatus,
} from "./domain/audio";
import { buildTranscriptExport, buildTranscriptText } from "./domain/export";

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

export default function App() {
  const [records, setRecords] = useState<AudioRecord[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [notice, setNotice] = useState("Ses seçerek çalışma alanını başlatın.");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const recordsRef = useRef<AudioRecord[]>([]);

  useEffect(() => {
    recordsRef.current = records;
  }, [records]);

  useEffect(() => () => {
    for (const record of recordsRef.current) {
      URL.revokeObjectURL(record.objectUrl);
    }
  }, []);

  const activeRecord = useMemo(
    () => records.find((record) => record.id === activeId) ?? null,
    [records, activeId],
  );

  const totalDuration = useMemo(
    () => records.reduce((total, record) => total + (record.durationSeconds ?? 0), 0),
    [records],
  );

  function updateRecord(recordId: string, update: (record: AudioRecord) => AudioRecord): void {
    setRecords((current) => current.map((record) => (
      record.id === recordId ? update(record) : record
    )));
  }

  async function addFiles(fileList: FileList | File[]): Promise<void> {
    const incoming = Array.from(fileList);
    const accepted = incoming.filter((file) => file.type.startsWith("audio/") || AUDIO_EXTENSION.test(file.name));
    const rejectedCount = incoming.length - accepted.length;

    if (accepted.length === 0) {
      setNotice("Seçilen dosyalarda tanınan bir ses dosyası bulunamadı.");
      return;
    }

    const created: AudioRecord[] = accepted.map((file) => ({
      id: crypto.randomUUID(),
      file,
      objectUrl: URL.createObjectURL(file),
      durationSeconds: null,
      sha256: null,
      hashState: "bekliyor",
      segments: [],
    }));

    setRecords((current) => [...current, ...created]);
    setActiveId((current) => current ?? created[0]?.id ?? null);
    setCurrentTime(0);
    setNotice(
      rejectedCount > 0
        ? `${created.length} ses eklendi; ${rejectedCount} desteklenmeyen dosya atlandı.`
        : `${created.length} ses dosyası belleğe alındı. Kalıcı kayıt yapılmadı.`,
    );

    // Hash işlemleri sırayla yürütülür; aynı anda çok sayıda tam dosya belleğe alınmaz.
    for (const record of created) {
      updateRecord(record.id, (item) => ({ ...item, hashState: "hesaplaniyor" }));
      const result = await calculatePreviewHash(record.file);
      updateRecord(record.id, (item) => ({
        ...item,
        sha256: result.hash,
        hashState: result.state,
      }));
    }
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

  function removeSegment(segmentId: string): void {
    if (!activeRecord) return;
    updateRecord(activeRecord.id, (record) => ({
      ...record,
      segments: record.segments.filter((segment) => segment.id !== segmentId),
    }));
  }

  function removeRecord(recordId: string): void {
    const target = records.find((record) => record.id === recordId);
    if (!target) return;
    URL.revokeObjectURL(target.objectUrl);
    const remaining = records.filter((record) => record.id !== recordId);
    setRecords(remaining);
    if (activeId === recordId) {
      setActiveId(remaining[0]?.id ?? null);
      setCurrentTime(0);
    }
    setNotice("Ses dosyası bellekten çıkarıldı.");
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

  function jumpTo(seconds: number): void {
    if (!audioRef.current) return;
    audioRef.current.currentTime = seconds;
    setCurrentTime(seconds);
    void audioRef.current.play().catch(() => {
      setNotice("Ses oynatılamadı. Dosya biçimi veya tarayıcı desteğini kontrol edin.");
    });
  }

  function exportText(): void {
    if (!activeRecord) return;
    saveTextFile(
      `${safeFileStem(activeRecord.file.name)}_transkript_taslagi.txt`,
      buildTranscriptText(activeRecord),
      "text/plain;charset=utf-8",
    );
    setNotice("Transkript taslağı TXT olarak dışa aktarıldı.");
  }

  function exportJson(): void {
    if (!activeRecord) return;
    const payload = buildTranscriptExport(activeRecord);
    saveTextFile(
      `${safeFileStem(activeRecord.file.name)}_transkript_taslagi.json`,
      JSON.stringify(payload, null, 2),
      "application/json;charset=utf-8",
    );
    setNotice("Transkript taslağı JSON olarak dışa aktarıldı.");
  }

  const activeDuration = activeRecord?.durationSeconds ?? 0;

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
              <p>Dosyalar bu oturumun belleğinde kalır.</p>
            </div>
          </div>
          <div className="version-line">
            <span>56.12 · Ses kayıtları</span>
            <span>0.1.0</span>
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
            <span className="prototype-pill">GELİŞTİRME ÖNİZLEMESİ</span>
          </div>
        </header>

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

          <div className="prototype-warning" role="status">
            <span className="warning-icon">i</span>
            <div>
              <strong>Prototip sınırı</strong>
              <span>
                Bu sürüm ASR çalıştırmaz ve kalıcı kayıt yapmaz. Ses dosyaları dışarı gönderilmez;
                uygulamayı kapattığınızda bellekteki çalışma silinir. Gerçek vaka materyali kullanmayın.
              </span>
            </div>
          </div>

          <div className="stats-row">
            <div className="stat-card">
              <span className="stat-label">KAYIT SAYISI</span>
              <strong>{records.length}</strong>
              <span className="stat-foot">Bu oturumda eklenen</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">TOPLAM SES SÜRESİ</span>
              <strong>{formatTime(totalDuration)}</strong>
              <span className="stat-foot">Süre bilgisi okunan dosyalar</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">TRANSKRİPT DURUMU</span>
              <strong>{records.reduce((sum, record) => sum + record.segments.length, 0)}</strong>
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
                  <p>{records.length} ses dosyası</p>
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
                {records.length === 0 ? (
                  <div className="empty-list">
                    <span className="empty-symbol">◌</span>
                    <strong>Henüz kayıt yok</strong>
                    <p>İlk ses dosyanızı ekleyerek başlayın.</p>
                  </div>
                ) : records.map((record, index) => (
                  <div key={record.id} className={`record-item ${record.id === activeId ? "selected" : ""}`}>
                    <button className="record-select" type="button" onClick={() => {
                      setActiveId(record.id);
                      setCurrentTime(0);
                    }}>
                      <span className="record-number">{String(index + 1).padStart(2, "0")}</span>
                      <span className="record-main">
                        <strong title={record.file.name}>{record.file.name}</strong>
                        <small>{formatBytes(record.file.size)} · {formatTime(record.durationSeconds)}</small>
                        <small className={record.hashState === "hesaplandi" ? "hash-ok" : "hash-muted"}>
                          {hashLabel(record)}
                        </small>
                      </span>
                    </button>
                    <button className="remove-record" type="button" aria-label={`${record.file.name} kaydını kaldır`} onClick={() => removeRecord(record.id)}>×</button>
                  </div>
                ))}
              </div>
              <div className="queue-footer">
                <span>Orijinaller bu prototipte değiştirilmez.</span>
                <span>{records.length} / ∞</span>
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

              {activeRecord ? (
                <div className="player-content">
                  <div className="active-file-card">
                    <div className="file-icon">♫</div>
                    <div className="active-file-details">
                      <strong title={activeRecord.file.name}>{activeRecord.file.name}</strong>
                      <span>{activeRecord.file.type || "Ses biçimi tarayıcı tarafından bildirilmedi"} · {formatBytes(activeRecord.file.size)}</span>
                    </div>
                    <span className="file-index">#{String(records.findIndex((item) => item.id === activeRecord.id) + 1).padStart(2, "0")}</span>
                  </div>

                  <div className="audio-stage">
                    <div className="stage-caption">
                      <span>OYNATMA KONTROLÜ</span>
                      <span>{formatTime(currentTime)} / {formatTime(activeRecord.durationSeconds)}</span>
                    </div>
                    <div className="wave-placeholder" aria-hidden="true">
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
                      onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
                      onEnded={() => setCurrentTime(activeRecord.durationSeconds ?? currentTime)}
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
                  </div>
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
                    ) : activeRecord.segments.map((segment, index) => (
                      <article className="segment-card" key={segment.id}>
                        <div className="segment-topline">
                          <button className="timestamp-button" type="button" onClick={() => jumpTo(segment.startSeconds)}>
                            <span>▶</span> {formatTime(segment.startSeconds)}
                          </button>
                          <span className="segment-number">BÖLÜM {String(index + 1).padStart(2, "0")}</span>
                          <button className="segment-delete" type="button" aria-label="Bölümü sil" onClick={() => removeSegment(segment.id)}>×</button>
                        </div>
                        <textarea
                          value={segment.text}
                          onChange={(event) => updateSegment(segment.id, (item) => ({ ...item, text: event.currentTarget.value }))}
                          placeholder="Duyduğunuz ifadeyi buraya yazın…"
                          rows={3}
                          aria-label={`${formatTime(segment.startSeconds)} zamanındaki transkript`}
                        />
                        <div className="segment-meta">
                          <label>
                            <span>Konuşmacı</span>
                            <input
                              value={segment.speaker}
                              onChange={(event) => updateSegment(segment.id, (item) => ({ ...item, speaker: event.currentTarget.value }))}
                              aria-label="Anonim konuşmacı etiketi"
                            />
                          </label>
                          <label>
                            <span>Durum</span>
                            <select
                              value={segment.status}
                              onChange={(event) => updateSegment(segment.id, (item) => ({ ...item, status: event.currentTarget.value as SegmentStatus }))}
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
            <span>Sesler cihazdan dışarı gönderilmez · ASR henüz bağlı değil</span>
          </footer>
        </section>
      </main>
    </div>
  );
}
