import { useEffect, useMemo, useState, type ReactNode } from "react";
import "./studio.css";

type Screen =
  | "overview" | "tasks" | "new-assignment" | "workspace" | "profile"
  | "modules" | "engines" | "audio-tools" | "language-tools" | "test-history"
  | "vault" | "settings";
type WorkspaceTab = "overview" | "assignment" | "materials" | "audio" | "questions" | "report";
type Tone = "green" | "amber" | "blue" | "red" | "gray";
type Segment = {
  id: string; start: string; end: string; speaker: string; text: string;
  reason: string; priority: boolean; reviewed: boolean;
};

const taskData = [
  { id: "demo-014", title: "Ses kayıtlarının incelenmesi", number: "2026/184 E.", authority: "Ankara 12. Asliye Ceza Mahkemesi", due: "24 Kasım 2026", status: "İnceleme sürüyor", tone: "blue" as Tone, records: 5, flagged: 12, questions: 3, progress: 62, updated: "Bugün, 10:42", kind: "Ceza mahkemesi" },
  { id: "demo-013", title: "Çoklu kayıt ve konuşma dökümü", number: "2026/92 S.", authority: "Ankara Cumhuriyet Başsavcılığı", due: "28 Kasım 2026", status: "Taslak görev", tone: "amber" as Tone, records: 2, flagged: 0, questions: 2, progress: 18, updated: "Dün, 16:18", kind: "Cumhuriyet başsavcılığı" },
  { id: "demo-011", title: "Transkript kontrolü", number: "2026/311 E.", authority: "Ankara 6. Hukuk Mahkemesi", due: "02 Aralık 2026", status: "Rapor kontrolü", tone: "green" as Tone, records: 1, flagged: 2, questions: 1, progress: 86, updated: "12 Kasım 2026", kind: "Hukuk mahkemesi" },
];

const recordingData = [
  { id: "rec-a", name: "Telefon_gorusmesi_A.wav", duration: "08:42", size: "18,4 MB", status: "Öncelikli kontrol", tone: "amber" as Tone, markers: 6, format: "WAV · 16 kHz · Mono" },
  { id: "rec-b", name: "Ortam_kaydi_B.wav", duration: "17:05", size: "34,8 MB", status: "İncelemede", tone: "blue" as Tone, markers: 3, format: "WAV · 48 kHz · Stereo" },
  { id: "rec-c", name: "Telefon_gorusmesi_C.m4a", duration: "03:16", size: "4,6 MB", status: "Kontrol edildi", tone: "green" as Tone, markers: 0, format: "M4A · 44.1 kHz · Mono" },
  { id: "rec-d", name: "Ortam_kaydi_D.wav", duration: "42:11", size: "82,1 MB", status: "ASR taslağı hazır", tone: "gray" as Tone, markers: 2, format: "WAV · 48 kHz · Stereo" },
  { id: "rec-e", name: "Gorusme_E.wav", duration: "01:00:02", size: "112 MB", status: "Sırada", tone: "gray" as Tone, markers: 1, format: "WAV · 16 kHz · Mono" },
];

const initialSegments: Segment[] = [
  { id: "s1", start: "00:00:12.4", end: "00:00:16.8", speaker: "Konuşmacı A", text: "Toplantının başlangıcında gündem maddelerini birlikte değerlendirelim.", reason: "Düşük ses seviyesi · düşük model güveni", priority: true, reviewed: false },
  { id: "s2", start: "00:00:16.8", end: "00:00:21.2", speaker: "Konuşmacı B", text: "Önce kayıtların tarihlerini netleştirmemiz gerekiyor.", reason: "Üst üste konuşma olasılığı", priority: true, reviewed: false },
  { id: "s3", start: "00:00:21.2", end: "00:00:25.6", speaker: "Konuşmacı A", text: "Tamam, ilgili dosyayı tekrar kontrol ederim.", reason: "Elle kontrol işareti", priority: true, reviewed: false },
  { id: "s4", start: "00:00:25.6", end: "00:00:30.1", speaker: "Konuşmacı B", text: "Teslim tarihini de not edelim.", reason: "Kontrol edildi", priority: false, reviewed: true },
  { id: "s5", start: "00:00:30.1", end: "00:00:35.4", speaker: "Konuşmacı A", text: "Yarın saat on bir gibi yeniden görüşebiliriz.", reason: "Düşük model güveni", priority: true, reviewed: false },
  { id: "s6", start: "00:00:35.4", end: "00:00:39.0", speaker: "Konuşmacı B", text: "Uygun, o zaman bu şekilde ilerleyelim.", reason: "Kontrol edildi", priority: false, reviewed: true },
];

const recordingText: Record<string, string[]> = {
  "rec-b": [
    "Arka plandaki konuşma nedeniyle bu bölüm yeniden dinlenmelidir.",
    "Ana konuşmacı, toplantının ikinci gündem maddesine geçtiğini belirtiyor.",
    "Diğer ses kaynağından gelen kısa ifade üst üste konuşmayla örtüşüyor.",
    "Kayıt seviyesindeki değişim nedeniyle kelime sınırları kontrol edilmeli.",
    "Konuşmanın devamında tarih ve saat bilgisi tekrar ediliyor.",
    "Bu bölümdeki ifade uzman tarafından kontrol edilmiştir.",
  ],
  "rec-c": [
    "Dosyayı bugün teslim aldığımızı teyit ediyorum.",
    "Belgenin son sayfasını da ayrıca inceleyelim.",
    "Anlaşıldı, kayıt burada sona eriyor.",
    "Bu bölümde belirgin bir konuşma kesintisi yoktur.",
    "Son cümle kısa ve anlaşılır biçimde duyuluyor.",
    "Görüşme bu ifadeyle tamamlanıyor.",
  ],
  "rec-d": [
    "Ortam kaydında birden fazla ses kaynağı duyulmaktadır.",
    "Konuşmacı B, toplantı sırasındaki teknik durumu anlatıyor.",
    "Arka plan gürültüsü nedeniyle seçili aralık ayrıca incelenmeli.",
    "Ana konuşmacı bir önceki açıklamasını tekrar ediyor.",
    "Uzak mesafedeki sesin kelime sınırları belirsiz.",
    "Kayıt bütünlüğü korunarak sonraki bölüme geçiliyor.",
  ],
  "rec-e": [
    "Görüşmenin başlangıcında taraflar gündemi belirliyor.",
    "İkinci konuşmacı, dosyada yer alan tarihe atıf yapıyor.",
    "Kısa süreli örtüşme nedeniyle konuşmacı geçişi kontrol edilmeli.",
    "Bu bölümde ses seviyesi önceki aralığa göre daha düşük.",
    "Ana konuşmacı inceleme kapsamını açıklıyor.",
    "Son bölümde kapanış ifadesi duyuluyor.",
  ],
};

function timeToSeconds(value: string): number {
  const parts = (value.match(/\d+/g) || []).map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return String(hours).padStart(2, "0") + ":" + String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
}

function segmentsForRecording(recordId: string): Segment[] {
  if (recordId === "rec-a") return initialSegments;
  const texts = recordingText[recordId] || recordingText["rec-b"];
  const offsets: Record<string, number> = { "rec-b": 78, "rec-c": 18, "rec-d": 214, "rec-e": 342 };
  const base = offsets[recordId] ?? 60;
  const reasons = [
    "Düşük model güveni · ses seviyesi",
    "Üst üste konuşma olasılığı",
    "Elle kontrol işareti",
    "Kontrol edildi",
    "Düşük model güveni",
    "Kontrol edildi",
  ];
  return initialSegments.map((segment, index) => {
    const startSeconds = base + index * 5;
    const endSeconds = startSeconds + 4;
    const stamp = (seconds: number) => "00:" + String(Math.floor(seconds / 60)).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0") + ".0";
    const reviewed = index === 3 || index === 5;
    return {
      ...segment,
      id: recordId + "-" + (index + 1),
      start: stamp(startSeconds),
      end: stamp(endSeconds),
      text: texts[index],
      speaker: index % 2 === 0 ? "Konuşmacı A" : "Konuşmacı B",
      reason: reviewed ? "Kontrol edildi" : reasons[index],
      priority: !reviewed && index < 4,
      reviewed,
    };
  });
}

const questionsData = [
  "Sunulan kayıtların konuşma içeriğini, zaman damgalarını koruyarak yazıya aktarınız.",
  "Kayıtta birden fazla konuşmacı bulunup bulunmadığını, kayıt içi anonim etiketlerle belirtiniz.",
  "Anlaşılmayan veya teknik yönden değerlendirilemeyen bölümleri gerekçeleriyle açıklayınız.",
];

const navGroups: { label: string; items: { id: Screen; label: string; icon: string }[] }[] = [
  { label: "ÇALIŞMA ALANI", items: [{ id: "overview", label: "Genel Bakış", icon: "grid" }, { id: "tasks", label: "Görevlerim", icon: "folder" }] },
  { label: "UZMANLIK", items: [{ id: "modules", label: "Uzmanlık Modülleri", icon: "layers" }] },
  { label: "KİŞİSEL", items: [{ id: "profile", label: "Bilirkişi Profilim", icon: "user" }] },
  { label: "GÜVENLİK", items: [{ id: "vault", label: "Kasa ve Güvenlik", icon: "shield" }] },
  { label: "AYARLAR", items: [{ id: "settings", label: "Uygulama Ayarları", icon: "settings" }] },
];

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.3" /><rect x="14" y="3" width="7" height="7" rx="1.3" /><rect x="3" y="14" width="7" height="7" rx="1.3" /><rect x="14" y="14" width="7" height="7" rx="1.3" /></>,
    folder: <><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" /><path d="M3.5 9h17" /></>,
    layers: <><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 12 9 5 9-5" /><path d="m3 16 9 5 9-5" /></>,
    user: <><circle cx="12" cy="8" r="3.5" /><path d="M4.5 21a7.5 7.5 0 0 1 15 0" /></>,
    shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11z" /><path d="m9 12 2 2 4-4" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.1 1.9-2 3.4-2.2-.5a7.7 7.7 0 0 1-1.7 1l-.7 2.1h-4l-.7-2.1a7.7 7.7 0 0 1-1.7-1l-2.2.5-2-3.4L4.5 15a7.5 7.5 0 0 1 0-2l-1.1-1.9 2-3.4 2.2.5a7.7 7.7 0 0 1 1.7-1L10 5h4l.7 2.1a7.7 7.7 0 0 1 1.7 1l2.2-.5 2 3.4-1.1 1.9a7.5 7.5 0 0 1-.1 2.1z" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    down: <path d="m7 10 5 5 5-5" />,
    plus: <path d="M12 5v14M5 12h14" />,
    search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    help: <><circle cx="12" cy="12" r="9" /><path d="M9.7 9a2.4 2.4 0 1 1 4 1.8c-1.1.8-1.7 1.1-1.7 2.7" /><path d="M12 17h.01" /></>,
    chevronLeft: <path d="m15 18-6-6 6-6" />,
    play: <path d="m8 5 12 7-12 7z" />,
    pause: <><path d="M8 5h3v14H8z" /><path d="M15 5h3v14h-3z" /></>,
    rotate: <><path d="M3 12a9 9 0 0 1 15.4-6.4L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15.4 6.4L3 16" /><path d="M3 21v-5h5" /></>,
    download: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M4 20h16" /></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h8" /></>,
    audio: <><path d="M3 10v4M7 6v12M11 3v18M15 7v10M19 5v14M23 10v4" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    edit: <><path d="m15 5 4 4" /><path d="M4 20 5 16 16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z" /></>,
    filter: <><path d="M4 5h16l-6 7v6l-4 2v-8z" /></>,
    more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 1 1 8 0v3" /></>,
    sliders: <><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="8" cy="6" r="2" /><circle cx="15" cy="12" r="2" /><circle cx="10" cy="18" r="2" /></>,
    calendar: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M16 2v4M8 2v4M3 9h18" /></>,
    list: <><path d="M9 6h12M9 12h12M9 18h12" /><path d="M4 6h.01M4 12h.01M4 18h.01" /></>,
    mic: <><rect x="9" y="2" width="6" height="13" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8" /></>,
    spark: <><path d="m12 3 1.5 6.5L20 12l-6.5 1.5L12 20l-1.5-6.5L4 12l6.5-2.5z" /><path d="m19 2 .6 2.4L22 5l-2.4.6L19 8l-.6-2.4L16 5l2.4-.6z" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
    alert: <><path d="M10.3 3.9 2.7 17a2 2 0 0 0 1.7 3h15.2a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>,
    "corner-down-left": <><path d="M9 10 4 15l5 5" /><path d="M4 15h11a5 5 0 0 0 5-5V4" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></>,
    cpu: <><rect x="5" y="5" width="14" height="14" rx="2" /><rect x="9" y="9" width="6" height="6" rx="1" /><path d="M9 1v4M15 1v4M9 19v4M15 19v4M1 9h4M1 15h4M19 9h4M19 15h4" /></>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name] || paths.file}</svg>;
}

function Badge({ children, tone = "gray" }: { children: ReactNode; tone?: Tone }) {
  return <span className={"st-badge " + tone}><i />{children}</span>;
}

function Button({ children, kind = "secondary", icon, onClick, disabled = false, size = "normal" }: {
  children: ReactNode; kind?: "primary" | "secondary" | "ghost" | "danger"; icon?: string;
  onClick?: () => void; disabled?: boolean; size?: "small" | "normal";
}) {
  return <button type="button" className={"st-button " + kind + " " + size} onClick={onClick} disabled={disabled}>{icon && <Icon name={icon} size={15} />}{children}</button>;
}

function PageTitle({ eyebrow, title, description, action }: {
  eyebrow?: string; title: string; description?: string; action?: ReactNode;
}) {
  return <div className="st-page-title"><div>{eyebrow && <div className="st-eyebrow">{eyebrow}</div>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{action && <div className="st-page-actions">{action}</div>}</div>;
}

function PanelHeading({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="st-panel-heading"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>;
}

function StatCard({ label, value, detail, icon, tone = "green" }: { label: string; value: string; detail: string; icon: string; tone?: Tone }) {
  return <div className="st-stat-card"><div className={"st-stat-icon " + tone}><Icon name={icon} size={19} /></div><div className="st-stat-copy"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></div>;
}

function Progress({ value }: { value: number }) {
  return <div className="st-progress"><span style={{ width: value + "%" }} /></div>;
}

function WorkspaceTop({ tab, setTab, task }: { tab: WorkspaceTab; setTab: (tab: WorkspaceTab) => void; task: typeof taskData[number] }) {
  const tabs: { id: WorkspaceTab; label: string; icon: string }[] = [
    { id: "overview", label: "Görev Özeti", icon: "grid" },
    { id: "assignment", label: "Görevlendirme", icon: "file" },
    { id: "materials", label: "Materyaller", icon: "folder" },
    { id: "audio", label: "Ses ve Transkript", icon: "audio" },
    { id: "questions", label: "Sorular ve Bulgular", icon: "list" },
    { id: "report", label: "Tek Rapor", icon: "file" },
  ];
  return <>
    <div className="st-workspace-heading">
      <div className="st-breadcrumb"><span>Görevlerim</span><Icon name="chevron" size={13} /><span>Görev çalışma alanı</span></div>
      <div className="st-task-title-row"><div><div className="st-eyebrow">56.12 · SES KAYITLARININ METNE DÖNÜŞTÜRÜLMESİ</div><h1>{task.title}</h1><p>{task.authority} <span>•</span> {task.number}</p></div><div className="st-task-title-meta"><Badge tone={task.tone}>{task.status}</Badge><span><Icon name="calendar" size={14} /> Son tarih: {task.due}</span></div></div>
    </div>
    <div className="st-workspace-tabs" role="tablist" aria-label="Görev alanı bölümleri">
      {tabs.map(item => <button type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? "active" : ""} key={item.id} onClick={() => setTab(item.id)}><Icon name={item.icon} size={16} /><span>{item.label}</span>{item.id === "audio" && <b>12</b>}</button>)}
    </div>
  </>;
}

export default function MihenkStudio() {
  const [screen, setScreen] = useState<Screen>("overview");
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("overview");
  const [collapsed, setCollapsed] = useState(() => {
    try { return window.localStorage.getItem("mihenk.studio.sidebar") === "true"; } catch { return false; }
  });
  const [activeTaskId, setActiveTaskId] = useState("demo-014");
  const [searchText, setSearchText] = useState("");
  const [taskFilter, setTaskFilter] = useState("Tümü");
  const [segments, setSegments] = useState<Segment[]>(initialSegments);
  const [selectedRecording, setSelectedRecording] = useState("rec-a");
  const [selectedSegment, setSelectedSegment] = useState("s1");
  const [segmentDraft, setSegmentDraft] = useState(initialSegments[0].text);
  const [segmentFilter, setSegmentFilter] = useState("Öncelikli");
  const [segmentSearch, setSegmentSearch] = useState("");
  const [playing, setPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState("1.0×");
  const [currentTime, setCurrentTime] = useState(12);
  const [loopAB, setLoopAB] = useState(false);
  const [showSpectrogram, setShowSpectrogram] = useState(false);
  const [noiseReduction, setNoiseReduction] = useState(false);
  const [listeningSource, setListeningSource] = useState("Orijinal");
  const [questionAnswers, setQuestionAnswers] = useState<string[]>([
    "Kayıt içeriği, ilgili zaman aralıklarında dinlenerek kontrol edilmek üzere metne aktarılmıştır. Nihai döküm, uzman kontrolü sonrasında tamamlanacaktır.",
    "",
    "Bu bölümdeki değerlendirme, kayıt kalitesi ve duyulabilirlik sınırları açıklandıktan sonra tamamlanacaktır.",
  ]);
  const [questionEvidence, setQuestionEvidence] = useState([true, false, true]);
  const [reportPage, setReportPage] = useState(1);
  const [reportReview, setReportReview] = useState(["done", "done", "done", "pending", "pending", "pending"]);
  const [sampleDocumentAdded, setSampleDocumentAdded] = useState(true);
  const [profileEditing, setProfileEditing] = useState(false);
  const [toast, setToast] = useState("");

  const task = taskData.find(item => item.id === activeTaskId) || taskData[0];
  const selectedRecord = recordingData.find(item => item.id === selectedRecording) || recordingData[0];
  const activeSegment = segments.find(item => item.id === selectedSegment) || segments[0];
  const moduleScreen = ["modules", "engines", "audio-tools", "language-tools", "test-history"].includes(screen);
  const screenTitle: Record<Screen, string> = {
    overview: "Genel Bakış", tasks: "Görevlerim", "new-assignment": "Yeni görevlendirme", workspace: "Görev çalışma alanı",
    profile: "Bilirkişi Profilim", modules: "Uzmanlık Modülleri", engines: "Motorlar ve Modeller",
    "audio-tools": "Ses Araçları", "language-tools": "Dil ve Metin", "test-history": "Test Geçmişi",
    vault: "Kasa ve Güvenlik", settings: "Uygulama Ayarları",
  };

  useEffect(() => {
    try { window.localStorage.setItem("mihenk.studio.sidebar", String(collapsed)); } catch { /* local preference is optional */ }
  }, [collapsed]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(id);
  }, [toast]);

  const filteredTasks = useMemo(() => taskData.filter(item => {
    const query = searchText.trim().toLocaleLowerCase("tr-TR");
    const matchesText = !query || [item.title, item.number, item.authority].some(value => value.toLocaleLowerCase("tr-TR").includes(query));
    const matchesFilter = taskFilter === "Tümü" || (taskFilter === "Taslak" && item.status === "Taslak görev") || (taskFilter === "Devam eden" && item.status !== "Taslak görev") || (taskFilter === "Rapor kontrolü" && item.status === "Rapor kontrolü");
    return matchesText && matchesFilter;
  }), [searchText, taskFilter]);

  const filteredSegments = useMemo(() => segments.filter(item => {
    const query = segmentSearch.trim().toLocaleLowerCase("tr-TR");
    const matchesSearch = !query || [item.text, item.speaker, item.start].some(value => value.toLocaleLowerCase("tr-TR").includes(query));
    const matchesFilter = segmentFilter === "Tümü" || (segmentFilter === "Öncelikli" && item.priority && !item.reviewed) || (segmentFilter === "Kontrol edildi" && item.reviewed) || (segmentFilter === "Belirsizler" && item.priority);
    return matchesSearch && matchesFilter;
  }), [segments, segmentFilter, segmentSearch]);

  function navigate(next: Screen) {
    setScreen(next);
    if (next === "workspace") setWorkspaceTab("overview");
  }
  function openTask(id: string, tab: WorkspaceTab = "overview") {
    setActiveTaskId(id);
    setWorkspaceTab(tab);
    setScreen("workspace");
  }
  function notify(message: string) { setToast(message); }
  function selectSegment(segment: Segment) {
    setSelectedSegment(segment.id);
    setSegmentDraft(segment.text);
    setCurrentTime(timeToSeconds(segment.start));
  }
  function saveSegment() {
    setSegments(items => items.map(item => item.id === selectedSegment ? { ...item, text: segmentDraft, reviewed: true, priority: false, reason: "Uzman kontrolü tamamlandı" } : item));
    notify("Örnek transkript düzeltmesi çalışma görünümüne işlendi.");
  }
  function markReviewed(id: string) {
    setSegments(items => items.map(item => item.id === id ? { ...item, reviewed: true, priority: false, reason: "Uzman kontrolü tamamlandı" } : item));
    notify("Segment kontrol edildi olarak işaretlendi.");
  }
  function updateQuestion(index: number, value: string) {
    setQuestionAnswers(items => items.map((item, i) => i === index ? value : item));
  }
  function toggleEvidence(index: number) {
    setQuestionEvidence(items => items.map((item, i) => i === index ? !item : item));
  }
  function toggleReview(index: number) {
    setReportReview(items => items.map((item, i) => i === index ? (item === "done" ? "pending" : "done") : item));
  }

  const selectedDuration = timeToSeconds(selectedRecord.duration);
  const waveform = Array.from({ length: 144 }, (_, i) => {
    const envelope = 0.34 + 0.43 * Math.abs(Math.sin(i * 0.071)) + 0.18 * Math.abs(Math.sin(i * 0.29));
    const height = Math.max(5, Math.round(envelope * (19 + 17 * Math.abs(Math.sin(i * 0.43)))));
    return { x: 8 + i * 4.2, y: 28 - height / 2, height };
  });

  return <div className={"mihenk-studio" + (collapsed ? " sidebar-is-collapsed" : "")}>
    <aside className="st-sidebar">
      <div className="st-brand">
        <div className="st-brand-symbol"><span>M</span><i /></div>
        {!collapsed && <div className="st-brand-name"><strong>MİHENK</strong><small>BİLİRKİŞİ ÇALIŞMA ALANI</small></div>}
        <button className="st-collapse" type="button" onClick={() => setCollapsed(value => !value)} title={collapsed ? "Menüyü genişlet" : "Menüyü daralt"} aria-label={collapsed ? "Menüyü genişlet" : "Menüyü daralt"}><Icon name={collapsed ? "chevron" : "chevronLeft"} size={15} /></button>
      </div>
      <div className="st-nav-scroll">
        {navGroups.map(group => <div className="st-nav-group" key={group.label}>
          {!collapsed && <div className="st-nav-label">{group.label}</div>}
          {group.items.map(item => <button type="button" key={item.id} title={collapsed ? item.label : undefined} aria-label={item.label} className={"st-nav-item" + (screen === item.id || (item.id === "modules" && moduleScreen) ? " active" : "")} onClick={() => navigate(item.id)}>
            <Icon name={item.icon} size={18} />{!collapsed && <span>{item.label}</span>}
          </button>)}
          {group.label === "UZMANLIK" && !collapsed && moduleScreen && <div className="st-subnav">
            <button className={screen === "modules" ? "selected" : ""} onClick={() => navigate("modules")} type="button"><span className="st-subnav-dot" />56.12 Genel Bakış</button>
            <button className={screen === "engines" ? "selected" : ""} onClick={() => navigate("engines")} type="button"><span className="st-subnav-dot" />Motorlar ve Modeller</button>
            <button className={screen === "audio-tools" ? "selected" : ""} onClick={() => navigate("audio-tools")} type="button"><span className="st-subnav-dot" />Ses Araçları</button>
            <button className={screen === "language-tools" ? "selected" : ""} onClick={() => navigate("language-tools")} type="button"><span className="st-subnav-dot" />Dil ve Metin</button>
            <button className={screen === "test-history" ? "selected" : ""} onClick={() => navigate("test-history")} type="button"><span className="st-subnav-dot" />Test Geçmişi</button>
          </div>}
        </div>)}
      </div>
      <div className="st-sidebar-foot">
        <div className="st-vault-indicator"><span className="st-vault-dot" />{!collapsed && <div><strong>Yerel demo ortamı</strong><small>Sentetik içerik · çevrimdışı tasarım</small></div>}</div>
        {!collapsed && <div className="st-version">ÜRÜN TASARIM ÖNİZLEMESİ <span>v0.5</span></div>}
      </div>
    </aside>

    <div className="st-main">
      <header className="st-topbar">
        <div className="st-topbar-context"><span className="st-context-mark"><Icon name="layers" size={15} /></span><span>Çalışma alanı</span><Icon name="chevron" size={13} /><strong>{screenTitle[screen]}</strong></div>
        <div className="st-topbar-actions">
          <label className="st-global-search"><Icon name="search" size={16} /><input value={searchText} onChange={event => setSearchText(event.target.value)} placeholder="Görev, dosya veya dosya no. ara" aria-label="Genel arama" /><kbd>⌘ K</kbd></label>
          <span className="st-top-status"><i />SENTETİK ORTAM</span>
          <button className="st-icon-button" type="button" onClick={() => notify("Bu prototipte bildirim bulunmuyor.")} aria-label="Bildirimler"><Icon name="bell" size={18} /><i /></button>
          <button className="st-icon-button" type="button" onClick={() => notify("Yardım alanı tasarım önizlemesinde.")} aria-label="Yardım"><Icon name="help" size={18} /></button>
          <div className="st-user-chip"><span>ÖB</span><div><strong>Örnek Bilirkişi</strong><small>Yerel profil</small></div><Icon name="down" size={13} /></div>
        </div>
      </header>

      <main className="st-content">
        {screen === "overview" && <>
          <PageTitle eyebrow="ÇALIŞMA ALANI" title="Çalışma alanınıza hoş geldiniz" description="Görevlerinizin durumunu, öncelikli incelemeleri ve yaklaşan teslimleri tek yerden takip edin."
            action={<Button kind="primary" icon="plus" onClick={() => navigate("new-assignment")}>Yeni görevlendirme</Button>} />
          <div className="st-stat-grid">
            <StatCard label="Açık görev" value="3" detail="2 görev devam ediyor" icon="folder" tone="green" />
            <StatCard label="Kontrol bekleyen parça" value="12" detail="5 kayda dağılmış durumda" icon="audio" tone="amber" />
            <StatCard label="Yanıt bekleyen soru" value="2" detail="1 görevde" icon="list" tone="blue" />
            <StatCard label="Yaklaşan teslim" value="9 gün" detail="24 Kasım 2026 · 2026/184 E." icon="calendar" tone="red" />
          </div>
          <div className="st-overview-grid">
            <section className="st-panel st-focus-panel">
              <PanelHeading title="Öncelikli çalışma" description="Bir sonraki en faydalı adımınız" action={<Badge tone="amber">ÖNCELİKLİ</Badge>} />
              <div className="st-focus-content"><div className="st-focus-icon"><Icon name="audio" size={23} /></div><div className="st-focus-copy"><span>2026/184 E. · Ankara 12. Asliye Ceza Mahkemesi</span><h2>Ses kayıtlarında kontrol bekleyen bölümleri inceleyin</h2><p>12 parça, 5 kayıt içinde işaretlendi. Kontrol kuyruğu nedenlerini gösterir; tüm kayıtlarınız her zaman erişilebilir.</p><Button kind="primary" icon="arrow" onClick={() => openTask("demo-014", "audio")}>Ses tezgâhına geç</Button></div></div>
              <div className="st-focus-footer"><span><Icon name="clock" size={14} /> Son çalışma: bugün 10:42</span><span>Görev ilerlemesi <strong>%62</strong></span><Progress value={62} /></div>
            </section>
            <section className="st-panel st-due-panel">
              <PanelHeading title="Yaklaşan teslimler" description="Tarih sırasına göre" action={<button className="st-text-button" onClick={() => navigate("tasks")} type="button">Tüm görevler <Icon name="chevron" size={13} /></button>} />
              {taskData.map(item => <button key={item.id} type="button" className="st-due-row" onClick={() => openTask(item.id)}><span className="st-due-date"><strong>{item.due.split(" ")[0]}</strong><small>{item.due.split(" ")[1].slice(0, 3)}</small></span><span className="st-due-copy"><strong>{item.number}</strong><small>{item.authority}</small></span><Badge tone={item.tone}>{item.status}</Badge></button>)}
            </section>
            <section className="st-panel st-task-list-panel">
              <PanelHeading title="Son çalışılan görevler" description="En son güncellenen çalışma alanları" action={<button className="st-text-button" onClick={() => navigate("tasks")} type="button">Görev listesi <Icon name="chevron" size={13} /></button>} />
              <div className="st-table-wrap"><table className="st-table"><thead><tr><th>GÖREV</th><th>DURUM</th><th>İLERLEME</th><th>SON GÜNCELLEME</th><th /></tr></thead><tbody>{taskData.map(item => <tr key={item.id}><td><button className="st-table-link" onClick={() => openTask(item.id)} type="button"><strong>{item.title}</strong><small>{item.number} · {item.authority}</small></button></td><td><Badge tone={item.tone}>{item.status}</Badge></td><td><div className="st-progress-cell"><Progress value={item.progress} /><small>%{item.progress}</small></div></td><td className="st-muted-cell">{item.updated}</td><td><button className="st-row-action" onClick={() => openTask(item.id)} aria-label="Görevi aç" type="button"><Icon name="chevron" size={16} /></button></td></tr>)}</tbody></table></div>
            </section>
            <section className="st-panel st-activity-panel">
              <PanelHeading title="İşlem geçmişi" description="Örnek çalışma kayıtları" />
              <div className="st-timeline">
                <div><i className="green" /><span><strong>Transkript segmenti kontrol edildi</strong><small>2026/184 E. · 00:00:25.6 · Bugün 10:42</small></span></div>
                <div><i className="blue" /><span><strong>Görevlendirme alanları gözden geçirildi</strong><small>2026/184 E. · Bugün 09:18</small></span></div>
                <div><i className="amber" /><span><strong>Yeni taslak görev oluşturuldu</strong><small>2026/92 S. · Dün 16:18</small></span></div>
              </div>
            </section>
          </div>
        </>}

        {screen === "tasks" && <>
          <PageTitle eyebrow="ÇALIŞMA ALANI" title="Görevlerim" description="Açık görevlendirmelerinizi, taslaklarınızı ve rapor durumlarını yönetin."
            action={<Button kind="primary" icon="plus" onClick={() => navigate("new-assignment")}>Yeni görevlendirme</Button>} />
          <section className="st-panel">
            <div className="st-list-toolbar">
              <div className="st-filter-pills">{["Tümü", "Devam eden", "Taslak", "Rapor kontrolü"].map(item => <button type="button" className={taskFilter === item ? "active" : ""} onClick={() => setTaskFilter(item)} key={item}>{item}<span>{item === "Tümü" ? 3 : item === "Taslak" ? 1 : item === "Rapor kontrolü" ? 1 : 2}</span></button>)}</div>
              <div className="st-list-tools"><label className="st-inline-search"><Icon name="search" size={15} /><input value={searchText} onChange={event => setSearchText(event.target.value)} placeholder="Görevlerde ara" /></label><Button icon="filter" onClick={() => notify("Ek filtre seçenekleri tasarım önizlemesinde.")}>Filtrele</Button></div>
            </div>
            <div className="st-table-wrap"><table className="st-table st-task-table"><thead><tr><th>GÖREV / MERCİ</th><th>TESLİM</th><th>MATERYAL</th><th>İŞ DURUMU</th><th>İLERLEME</th><th>SON GÜNCELLEME</th><th /></tr></thead><tbody>{filteredTasks.map(item => <tr key={item.id}><td><button type="button" className="st-table-link" onClick={() => openTask(item.id)}><strong>{item.title}</strong><small>{item.authority} · {item.number}</small></button></td><td><strong className="st-date-strong">{item.due}</strong><small className="st-cell-sub">{item.kind}</small></td><td><span className="st-material-count"><Icon name="audio" size={14} />{item.records} kayıt</span><small className="st-cell-sub">{item.flagged} kontrol işareti</small></td><td><Badge tone={item.tone}>{item.status}</Badge></td><td><div className="st-progress-cell"><Progress value={item.progress} /><small>%{item.progress}</small></div></td><td className="st-muted-cell">{item.updated}</td><td><button className="st-row-action" onClick={() => openTask(item.id)} aria-label="Görevi aç" type="button"><Icon name="chevron" size={16} /></button></td></tr>)}</tbody></table></div>
            {filteredTasks.length === 0 && <div className="st-empty-state"><Icon name="search" size={24} /><strong>Aramanızla eşleşen görev bulunamadı</strong><span>Arama ifadesini veya filtreyi değiştirebilirsiniz.</span></div>}
            <div className="st-table-footer"><span>3 görevden {filteredTasks.length} tanesi gösteriliyor · Sentetik örnek veri</span><span>Son güncelleme: bugün 10:42</span></div>
          </section>
          <div className="st-callout"><Icon name="info" size={17} /><div><strong>Taslak görevlendirme akışı</strong><span>İlk görevlendirme belgesi eklendiğinde taslak görev oluşur. Materyallerin tamamını ilk ekranda yüklemeniz gerekmez; görev içinde daha sonra ekleyebilirsiniz.</span></div></div>
        </>}

        {screen === "new-assignment" && <>
          <div className="st-back-line"><button type="button" onClick={() => navigate("tasks")}><Icon name="chevronLeft" size={15} /> Görevlerime dön</button><Badge tone="green">Otomatik kayıt açık</Badge></div>
          <PageTitle eyebrow="YENİ GÖREVLENDİRME" title="Yeni çalışma alanı oluşturun" description="Görevlendirme belgesini ekleyin. MİHENK bir taslak oluşturur; belgedeki alanları ve beklenen materyalleri incelemeniz için hazırlar." />
          <div className="st-intake-progress">
            <div className="active"><span>1</span><div><strong>Belgeyi ekle</strong><small>Kaynak belge</small></div></div><i /><div className="active"><span>2</span><div><strong>Otomatik çıkarım</strong><small>Alanlar ve sorular</small></div></div><i /><div><span>3</span><div><strong>İstisnaları doğrula</strong><small>Gerekli teyitler</small></div></div><i /><div><span>4</span><div><strong>Görev alanı</strong><small>Her an erişilebilir</small></div></div>
          </div>
          <div className="st-intake-grid">
            <section className="st-panel st-upload-panel">
              <PanelHeading title="1. Görevlendirme belgesi" description="Kaynak belge korunur; belge içeriği bu demo sürümünde işlenmez." action={<Badge tone="blue">PDF · ÖRNEK</Badge>} />
              {sampleDocumentAdded ? <div className="st-uploaded-file"><div className="st-file-tile"><Icon name="file" size={26} /></div><div className="st-uploaded-copy"><strong>Ornek_Gorevlendirme_2026-184.pdf</strong><span>PDF belge · 2 sayfa · 428 KB · Sentetik örnek</span><div className="st-file-status"><Badge tone="green">Eklendi</Badge><span><Icon name="check" size={13} /> Taslak görev kaydı oluşturuldu</span></div></div><button type="button" className="st-row-action" onClick={() => setSampleDocumentAdded(false)} aria-label="Örnek belgeyi kaldır"><Icon name="close" size={16} /></button></div> : <div className="st-dropzone"><div className="st-drop-icon"><Icon name="download" size={24} /></div><strong>Görevlendirme belgesini buraya bırakın</strong><span>veya örnek belgeyi seçerek akışı görüntüleyin</span><Button kind="secondary" icon="file" onClick={() => setSampleDocumentAdded(true)}>Örnek belgeyi ekle</Button><small>Bu önizlemede gerçek belge yükleme veya OCR çalıştırılmaz.</small></div>}
              <div className="st-inline-note"><Icon name="lock" size={15} /><span>Kaynak belge, gerçek uygulamada değiştirilmeden saklanır. İlk belge eklendiğinde taslak açılır ve OCR/metin çıkarımı başlatılır.</span></div>
            </section>
            <section className="st-panel st-extraction-panel">
              <PanelHeading title="2. Belgeden çıkarılan alanlar" description="Örnek çıkarım sonucu · kaynağa bağlı alanlar" action={<Badge tone="amber">1 teyit gerekli</Badge>} />
              <div className="st-extraction-fields">
                <div><span>Görevlendiren merci</span><strong>Ankara 12. Asliye Ceza Mahkemesi</strong><small><Icon name="file" size={12} /> Sayfa 1 · üst başlık</small></div>
                <div><span>Dosya numarası</span><strong>2026/184 E.</strong><small><Icon name="file" size={12} /> Sayfa 1 · dosya bilgisi</small></div>
                <div><span>İnceleme konusu</span><strong>Ses kayıtlarının çözümlenmesi</strong><small><Icon name="file" size={12} /> Sayfa 1 · görevlendirme konusu</small></div>
                <div><span>Rapor teslim tarihi</span><strong>24 Kasım 2026</strong><small><Icon name="file" size={12} /> Sayfa 1 · süre bilgisi</small></div>
                <div className="needs-confirm"><span>3. sorunun kapsamı</span><strong>Belge görüntüsünden teyit edilmeli</strong><small><Icon name="alert" size={12} /> Okunabilirlik / kapsam istisnası</small></div>
              </div>
              <div className="st-extraction-footer"><span><i /> Alanların kaynağı görülebilir; emin olunmayan veri tahminle tamamlanmaz.</span><Button kind="ghost" icon="edit" size="small" onClick={() => notify("Alan düzenleme örnek görünümü açıldı.")}>Alanları gözden geçir</Button></div>
            </section>
            <section className="st-panel st-expected-panel">
              <PanelHeading title="3. Beklenen materyaller" description="Belgede tarif edilen materyaller; teslim alınanlarla karıştırılmaz." action={<Badge tone="amber">2 bekleniyor</Badge>} />
              <div className="st-expected-row"><span className="st-mini-file audio"><Icon name="audio" size={17} /></span><div><strong>Kayıt-01.wav</strong><small>Ses kaydı · görevlendirme belgesinden çıkarıldı</small></div><Badge tone="amber">Bekleniyor</Badge></div>
              <div className="st-expected-row"><span className="st-mini-file"><Icon name="folder" size={17} /></span><div><strong>USB bellek içeriği</strong><small>Dijital materyal · uzman teslimi bekleniyor</small></div><Badge tone="amber">Bekleniyor</Badge></div>
              <div className="st-expected-footer"><Icon name="info" size={15} /> Eksik materyaller görevi açmayı engellemez. Görev alanından daha sonra eklenebilir.</div>
            </section>
            <section className="st-panel st-intake-summary">
              <div className="st-intake-summary-icon"><Icon name="spark" size={20} /></div><div><strong>Çalışma alanınız hazır</strong><p>Belgeye ait taslak görev, çıkarılan alanlar ve beklenen materyal listesiyle birlikte açılabilir.</p><Button kind="primary" icon="arrow" onClick={() => openTask("demo-014")}>Taslağı görev alanında aç</Button></div>
            </section>
          </div>
          <div className="st-bottom-hint"><Icon name="corner-down-left" size={14} /> Görevlerim'e her zaman dönebilir, başka göreve geçebilir ve taslağınıza daha sonra geri dönebilirsiniz.</div>
        </>}

        {screen === "workspace" && <>
          <WorkspaceTop tab={workspaceTab} setTab={setWorkspaceTab} task={task} />
          {workspaceTab === "overview" && <div className="st-workspace-overview">
            <div className="st-next-actions">
              <div className="st-section-heading"><div><div className="st-eyebrow">GÖREV DURUMU</div><h2>Önünüzdeki işler</h2><p>İş akışındaki en yararlı sonraki adımlar</p></div><Badge tone="amber">3 işlem bekliyor</Badge></div>
              <div className="st-action-card priority"><div className="st-action-number">01</div><div className="st-action-content"><Badge tone="amber">ÖNCELİKLİ</Badge><h3>Ses kayıtlarında kontrol bekleyen bölümleri inceleyin</h3><p>12 parça · 4 kayıtta · düşük güven, üst üste konuşma ve ses kalitesi işaretleri</p><button type="button" className="st-text-button" onClick={() => setWorkspaceTab("audio")}>Ses tezgâhına git <Icon name="arrow" size={14} /></button></div><div className="st-action-stat"><strong>12</strong><small>parça</small></div></div>
              <div className="st-action-card"><div className="st-action-number">02</div><div className="st-action-content"><Badge tone="blue">GÖREVLENDİRME</Badge><h3>Görevlendirmedeki 1 alanı doğrulayın</h3><p>3. sorunun kapsamı kaynak belge görüntüsünden teyit bekliyor.</p><button type="button" className="st-text-button" onClick={() => setWorkspaceTab("assignment")}>Görevlendirmeyi aç <Icon name="arrow" size={14} /></button></div><div className="st-action-stat"><strong>1</strong><small>teyit</small></div></div>
              <div className="st-action-card"><div className="st-action-number">03</div><div className="st-action-content"><Badge tone="gray">SORU VE BULGU</Badge><h3>3 sorudan 2'sinin yanıtını tamamlayın</h3><p>Her yanıtın dayanağı ilgili kayıt ve transkript aralığına bağlanmalıdır.</p><button type="button" className="st-text-button" onClick={() => setWorkspaceTab("questions")}>Sorulara geç <Icon name="arrow" size={14} /></button></div><div className="st-action-stat"><strong>2</strong><small>yanıt</small></div></div>
            </div>
            <div className="st-workflow-side">
              <section className="st-panel"><PanelHeading title="Görev ilerlemesi" description="Tek raporun tamamlanma görünümü" /><div className="st-overall-progress"><strong>%62</strong><span>Genel ilerleme</span><Progress value={62} /></div><div className="st-checklist"><div><i className="done"><Icon name="check" size={12} /></i><span><strong>Görev ve merci bilgileri</strong><small>Kaynak belgeyle eşleştirildi</small></span></div><div><i className="done"><Icon name="check" size={12} /></i><span><strong>Materyal envanteri</strong><small>3 teslim · 2 beklenen</small></span></div><div><i className="pending">!</i><span><strong>Transkript kontrolü</strong><small>12 bölüm uzman incelemesi bekliyor</small></span></div><div><i className="pending">!</i><span><strong>Soru yanıtları</strong><small>2 yanıt eksik veya tamamlanmamış</small></span></div><div><i className="pending">!</i><span><strong>Tek rapor</strong><small>İmzasız taslak · kalite kontrolü bekliyor</small></span></div></div></section>
              <section className="st-panel"><PanelHeading title="Görevdeki materyaller" description="Bütün kayıtlar aynı görev altında erişilebilir." action={<button className="st-text-button" type="button" onClick={() => setWorkspaceTab("materials")}>Tümünü gör <Icon name="chevron" size={13} /></button>} />
                {recordingData.slice(0, 3).map(record => <div className="st-compact-record" key={record.id}><span className="st-mini-file audio"><Icon name="audio" size={15} /></span><div><strong>{record.name}</strong><small>{record.duration} · {record.markers} kontrol işareti</small></div><Badge tone={record.tone}>{record.status}</Badge></div>)}
                <Button kind="secondary" icon="plus" size="small" onClick={() => setWorkspaceTab("materials")}>Materyal ekle</Button>
              </section>
            </div>
          </div>}

          {workspaceTab === "assignment" && <div className="st-assignment-grid">
            <section className="st-panel"><PanelHeading title="Görevlendirme bilgileri" description="Kaynak belgeden çıkarılan ve gerektiğinde uzman tarafından doğrulanan alanlar." action={<Button size="small" icon="edit" onClick={() => notify("Görevlendirme alanı düzenleme görünümü açıldı.")}>Düzenle</Button>} />
              <div className="st-detail-grid"><div><span>Görevlendiren merci</span><strong>{task.authority}</strong><small><Icon name="file" size={12} /> Görevlendirme belgesi · s.1</small></div><div><span>Dosya numarası</span><strong>{task.number}</strong><small><Icon name="file" size={12} /> Görevlendirme belgesi · s.1</small></div><div><span>Görevlendirme türü</span><strong>{task.kind}</strong><small>Örnek sınıflandırma</small></div><div><span>Görevlendirme tarihi</span><strong>10 Kasım 2026</strong><small><Icon name="file" size={12} /> Görevlendirme belgesi · s.1</small></div><div><span>Rapor teslim tarihi</span><strong>{task.due}</strong><small><Icon name="calendar" size={12} /> Süre alanı</small></div><div><span>İnceleme konusu</span><strong>Ses kayıtlarının çözümlenmesi</strong><small><Icon name="file" size={12} /> Görevlendirme belgesi · s.1</small></div></div>
              <div className="st-scope-box"><span>İnceleme kapsamı</span><p>Dosyada bulunan ses kayıtlarının konuşma içeriğinin yazıya aktarılması, konuşmacıların kayıt içi anonim etiketlerle ayrılması ve anlaşılamayan bölümlerin belirtilmesi.</p></div>
              <div className="st-confirm-row"><span><Badge tone="amber">TEYİT GEREKLİ</Badge><strong>3. sorunun kapsamı</strong><small>Belge görüntüsünden kapsam doğrulanmalı.</small></span><Button size="small" onClick={() => notify("Kaynak sayfa önizlemesi tasarımda açıldı.")}>Kaynak sayfayı gör</Button></div>
            </section>
            <section className="st-panel st-source-panel"><PanelHeading title="Kaynak belge" description="Çıkarılan alanlar belge sayfasına bağlıdır." action={<Badge tone="green">2 SAYFA</Badge>} />
              <div className="st-document-preview"><div className="st-doc-topline">T.C. · ADALET BAKANLIĞI</div><strong>ANKARA 12. ASLİYE CEZA MAHKEMESİ</strong><span>GÖREVLENDİRME YAZISI</span><hr /><div>Dosya No: 2026/184 E.</div><div>Konu: Ses kayıtlarının incelenmesi</div><div className="st-doc-paragraph">İlgili dosyada bulunan dijital ses kayıtlarının konuşma içeriğinin yazıya aktarılması ve görevlendirme sorularının cevaplandırılması...</div><div className="st-doc-highlight">3. Soru — kaynak görüntüden teyit gerekli</div><div className="st-doc-sign">İmza alanı · DEMO</div></div>
              <div className="st-source-foot"><span><Icon name="file" size={14} /> Ornek_Gorevlendirme_2026-184.pdf</span><button type="button" onClick={() => notify("Kaynak belge yalnızca örnek önizlemedir.")}>Belgeyi aç <Icon name="arrow" size={13} /></button></div>
            </section>
          </div>}

          {workspaceTab === "materials" && <section className="st-panel">
            <PanelHeading title="Materyal envanteri" description="Beklenen materyaller, teslim alınan dosyalar ve dosya bütünlüğü bilgileri ayrı izlenir."
              action={<Button icon="plus" onClick={() => notify("Materyal ekleme paneli demo için hazırlandı; dosya aktarımı yapılmaz.")}>Materyal ekle</Button>} />
            <div className="st-material-stats"><div><span>Beklenen materyal</span><strong>5</strong></div><div><span>Teslim alınan</span><strong>3</strong></div><div><span>Eksik / beklenen</span><strong>2</strong></div><div><span>İnceleme kuyruğunda</span><strong>12</strong></div></div>
            <div className="st-material-toolbar"><div className="st-filter-pills"><button className="active" type="button">Tümü <span>5</span></button><button type="button" onClick={() => notify("Teslim alınan materyaller filtresi.")}>Teslim alındı <span>3</span></button><button type="button" onClick={() => notify("Beklenen materyaller filtresi.")}>Bekleniyor <span>2</span></button></div><span className="st-subtle-label">Kaynak materyal değiştirilmez · çalışma kopyaları ayrı tutulur</span></div>
            <div className="st-material-table"><div className="st-material-head"><span>MATERYAL</span><span>TÜR / TEKNİK ÖZELLİK</span><span>DURUM</span><span>BÜTÜNLÜK / KAYNAK</span><span /></div>
              {recordingData.slice(0, 3).map(record => <div className="st-material-entry" key={record.id}><span className="st-material-name"><i className="audio"><Icon name="audio" size={17} /></i><span><strong>{record.name}</strong><small>Orijinal kayıt · {record.size}</small></span></span><span><strong>Ses kaydı</strong><small>{record.format}</small></span><span><Badge tone={record.tone}>{record.status}</Badge></span><span><strong className="st-hash-label">SHA-256</strong><small>Örnek tanımlayıcı · gerçek hash değil</small></span><button className="st-row-action" onClick={() => setWorkspaceTab("audio")} aria-label="Ses kaydına geç" type="button"><Icon name="chevron" size={16} /></button></div>)}
              <div className="st-material-entry missing"><span className="st-material-name"><i><Icon name="file" size={17} /></i><span><strong>Ek-1 · Beklenen kayıt</strong><small>Görevlendirme belgesinde tarif edilen ek</small></span></span><span><strong>Ses kaydı</strong><small>Teknik özellik henüz alınmadı</small></span><span><Badge tone="amber">Bekleniyor</Badge></span><span><strong className="st-hash-label">Henüz teslim alınmadı</strong><small>Kaynak: görev yazısı · s.2</small></span><button className="st-row-action" aria-label="Materyal bilgisi" onClick={() => notify("Beklenen materyal bilgisi.")} type="button"><Icon name="more" size={16} /></button></div>
              <div className="st-material-entry missing"><span className="st-material-name"><i><Icon name="folder" size={17} /></i><span><strong>USB bellek içeriği</strong><small>Dijital taşıyıcı · teslim bekleniyor</small></span></span><span><strong>Dijital materyal</strong><small>İçerik envanteri daha sonra çıkarılır</small></span><span><Badge tone="amber">Bekleniyor</Badge></span><span><strong className="st-hash-label">Henüz teslim alınmadı</strong><small>Kaynak: görev yazısı · s.2</small></span><button className="st-row-action" aria-label="Materyal bilgisi" onClick={() => notify("Beklenen materyal bilgisi.")} type="button"><Icon name="more" size={16} /></button></div>
            </div>
            <div className="st-callout compact"><Icon name="shield" size={16} /><div><strong>Kanıt bütünlüğü</strong><span>Gerçek uygulamada orijinal dosyanın hash değeri, teknik metadata ve işlem geçmişi kayıt altına alınır. Bu ekrandaki etiketler örnek veridir.</span></div></div>
          </section>}

          {workspaceTab === "audio" && <div className="st-audio-screen">
            <div className="st-audio-toolbar"><div><div className="st-eyebrow">SES İNCELEME TEZGÂHI</div><h2>Tüm kayıtlar ve transkript</h2><p>Kontrol kuyruğu öncelik verir; bütün sesler ve metin her zaman erişilebilir.</p></div><div className="st-audio-toolbar-metrics"><span><strong>5</strong> kayıt</span><span><strong>2 sa 14 dk</strong> toplam süre</span><Badge tone="amber">12 kontrol işareti</Badge></div></div>
            <div className="st-audio-filterbar"><div className="st-filter-pills">{["Öncelikli", "Tümü", "Kontrol edildi", "Belirsizler"].map(item => <button type="button" key={item} className={segmentFilter === item ? "active" : ""} onClick={() => setSegmentFilter(item)}>{item}{item === "Öncelikli" && <span>{segments.filter(s => s.priority && !s.reviewed).length}</span>}</button>)}</div><label className="st-inline-search"><Icon name="search" size={15} /><input placeholder="Metin, zaman veya konuşmacı ara" value={segmentSearch} onChange={event => setSegmentSearch(event.target.value)} /></label></div>
            <div className="st-audio-grid">
              <section className="st-panel st-recording-list"><div className="st-audio-panel-title"><div><h3>Kayıtlar</h3><span>5 materyal · toplam 2:14:16</span></div><button className="st-icon-button small" onClick={() => notify("Kayıt sıralama seçenekleri.")} type="button" aria-label="Kayıt listesi ayarları"><Icon name="sliders" size={16} /></button></div>
                {recordingData.map((record, index) => <button type="button" key={record.id} className={"st-recording-row" + (selectedRecording === record.id ? " selected" : "")} onClick={() => {
          setSelectedRecording(record.id);
          const nextSegments = segmentsForRecording(record.id);
          setSegments(nextSegments);
          setSelectedSegment(nextSegments[0].id);
          setSegmentDraft(nextSegments[0].text);
          setSegmentFilter("Öncelikli");
          setSegmentSearch("");
          setCurrentTime(timeToSeconds(nextSegments[0].start));
        }}><span className="st-recording-number">{String(index + 1).padStart(2, "0")}</span><span className="st-recording-main"><strong>{record.name}</strong><small>{record.duration} · {record.size}</small><Badge tone={record.tone}>{record.status}</Badge></span><span className="st-recording-markers">{record.markers > 0 ? record.markers + " işaret" : "✓"}</span></button>)}
                <div className="st-recording-legend"><span><i className="amber" /> Kontrol gerektiriyor</span><span><i className="green" /> Kontrol edildi</span></div>
              </section>

              <section className="st-panel st-audio-workbench">
                <div className="st-audio-file-heading"><div><div className="st-eyebrow">ORİJİNAL KAYIT</div><h3>{selectedRecord.name}</h3><span>{selectedRecord.duration} · {selectedRecord.format} · {selectedRecord.size}</span></div><button type="button" className="st-icon-button" onClick={() => notify("Teknik dosya ayrıntıları örnek görünümde.")} aria-label="Teknik ayrıntılar"><Icon name="more" size={18} /></button></div>
                <div className="st-wave-label"><span>DALGA BİÇİMİ</span><span><i /> Seçili aralık {activeSegment.start}–{activeSegment.end}</span></div>
                <div className={"st-wave-stage" + (showSpectrogram ? " spectrogram" : "")} onClick={event => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
                  const index = Math.min(segments.length - 1, Math.floor(ratio * segments.length));
                  selectSegment(segments[index]);
                }} role="button" tabIndex={0} aria-label="Dalga biçimi üzerinde zaman aralığı seç">
                  <div className="st-wave-time"><span>00:00:00</span><span>00:04:21</span><span>00:08:42</span></div>
                  <svg viewBox="0 0 620 56" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="28" x2="620" y2="28" className="wave-axis" />{waveform.map((bar, index) => <line key={index} x1={bar.x} y1={bar.y} x2={bar.x} y2={bar.y + bar.height} className={index > 42 && index < 61 ? "wave-bar selected" : "wave-bar"} />)}<rect x="182" y="3" width="76" height="50" rx="4" className="wave-selection" /></svg><div className="st-wave-playhead" style={{ left: Math.min(96, currentTime / Math.max(1, selectedDuration) * 100) + "%" }} />
                </div>
                <div className="st-player-controls"><button type="button" className="st-player-main" onClick={() => setPlaying(value => !value)} aria-label={playing ? "Duraklat" : "Oynat"}><Icon name={playing ? "pause" : "play"} size={17} /></button><button type="button" className="st-player-skip" onClick={() => setCurrentTime(Math.max(0, currentTime - 5))}>−5 sn</button><button type="button" className="st-player-skip" onClick={() => setCurrentTime(currentTime + 5)}>+5 sn</button><div className="st-player-time"><strong>{formatClock(currentTime)}</strong><span>/ {formatClock(selectedDuration)}</span></div><select value={playbackRate} onChange={event => setPlaybackRate(event.target.value)} aria-label="Oynatma hızı"><option>0.75×</option><option>0.85×</option><option>1.0×</option><option>1.25×</option><option>1.5×</option></select><button type="button" className={"st-loop-button" + (loopAB ? " active" : "")} onClick={() => setLoopAB(value => !value)}><Icon name="rotate" size={14} />A–B</button></div>
                <div className="st-transcript-head"><div><h3>Transkript</h3><span>Tüm metin · zaman bağlantılı · uzman düzeltmesi</span></div><div className="st-transcript-tools"><button type="button" onClick={() => notify("Transkriptte arama alanı yukarıda kullanılabilir.")}><Icon name="search" size={14} /> Ara</button><button type="button" onClick={() => notify("Konuşmacı görünüm filtresi.")}><Icon name="users" size={14} /> Konuşmacılar</button></div></div>
                <div className="st-segment-list">{filteredSegments.map(segment => <button type="button" key={segment.id} className={"st-segment-row" + (selectedSegment === segment.id ? " selected" : "") + (segment.reviewed ? " reviewed" : "")} onClick={() => selectSegment(segment)}><span className="st-segment-time">{segment.start}<small>{segment.end}</small></span><span className="st-segment-copy"><strong>{segment.speaker}</strong><span>{segment.text}</span>{segment.priority && !segment.reviewed && <em><Icon name="alert" size={12} /> {segment.reason}</em>}</span><span className={"st-segment-status " + (segment.reviewed ? "done" : "pending")}>{segment.reviewed ? <Icon name="check" size={14} /> : "!"}</span></button>)}
                  {filteredSegments.length === 0 && <div className="st-empty-mini">Bu filtrede segment yok. Tüm segmentleri seçerek tam metne dönebilirsiniz.</div>}
                </div>
                <div className="st-transcript-editor"><div className="st-editor-heading"><div><strong>Uzman düzeltmesi</strong><span>{activeSegment.start} · {activeSegment.speaker}</span></div><Badge tone={activeSegment.reviewed ? "green" : "amber"}>{activeSegment.reviewed ? "Kontrol edildi" : "Kontrol bekliyor"}</Badge></div><textarea value={segmentDraft} onChange={event => setSegmentDraft(event.target.value)} rows={2} aria-label="Seçili transkript segmentini düzenle" /><div className="st-editor-footer"><span>Ham ASR metni ve uzman revizyonu gerçek uygulamada ayrı saklanır.</span><div><Button size="small" kind="ghost" onClick={() => setSegmentDraft(activeSegment.text)}>Değişiklikleri geri al</Button><Button size="small" kind="primary" icon="check" onClick={saveSegment}>Düzeltmeyi kaydet</Button></div></div></div>
              </section>

              <aside className="st-audio-side">
                <section className="st-panel"><PanelHeading title="Dinleme araçları" description="Geri alınabilir çalışma kopyası" />
                  <div className="st-source-switch"><button className={listeningSource === "Orijinal" ? "active" : ""} type="button" onClick={() => setListeningSource("Orijinal")}>Orijinal</button><button className={listeningSource === "İşlenmiş" ? "active" : ""} type="button" onClick={() => setListeningSource("İşlenmiş")}>İşlenmiş kopya</button></div>
                  <div className="st-tool-option"><div><strong>Gürültü azaltma</strong><small>Yalnız çalışma kopyasında</small></div><button type="button" className={"st-toggle" + (noiseReduction ? " on" : "")} onClick={() => { setNoiseReduction(value => !value); setListeningSource("İşlenmiş"); }} aria-label="Gürültü azaltmayı değiştir"><i /></button></div>
                  <div className="st-tool-option"><div><strong>Tek kanalı dinle</strong><small>Sol / sağ kanal seçimi</small></div><select aria-label="Ses kanalı"><option>Tüm kanallar</option><option>Sol kanal</option><option>Sağ kanal</option></select></div>
                  <button type="button" className={"st-tool-link" + (showSpectrogram ? " selected" : "")} onClick={() => setShowSpectrogram(value => !value)}><Icon name="audio" size={16} /><span><strong>Spektrogram görünümü</strong><small>{showSpectrogram ? "Açık · görsel örnek" : "Kapalı · dalga biçimi"}</small></span><Icon name="chevron" size={14} /></button>
                  <div className="st-tool-disclaimer"><Icon name="shield" size={14} /> Orijinal kanıt dosyası korunur. Bu ekrandaki araçlar gerçek ses işlemez.</div>
                </section>
                <section className="st-panel"><PanelHeading title="Kontrol nedeni" description="Öncelik işaretleri doğruluk oranı değildir." />
                  <div className="st-reason-list"><span><i className="reason amber" />Düşük model güveni</span><span><i className="reason blue" />Üst üste konuşma</span><span><i className="reason red" />Düşük ses / kesilme</span><span><i className="reason gray" />Elle işaretlenen bölüm</span></div>
                  <div className="st-active-reason"><Badge tone={activeSegment.reviewed ? "green" : "amber"}>{activeSegment.reviewed ? "Kontrol edildi" : "Seçili bölüm"}</Badge><strong>{activeSegment.reason}</strong><small>{activeSegment.start} · {activeSegment.speaker}</small><Button kind="secondary" size="small" onClick={() => markReviewed(activeSegment.id)} disabled={activeSegment.reviewed}>Kontrol edildi olarak işaretle</Button></div>
                </section>
                <section className="st-panel st-speaker-panel"><PanelHeading title="Konuşmacı grupları" description="Kayıt içi anonim etiketler" /><div className="st-speaker-row"><span>A</span><div><strong>Konuşmacı A</strong><small>4 segment · örnek</small></div><button type="button" onClick={() => notify("Konuşmacı grubu düzenleme örneği.")}><Icon name="edit" size={14} /></button></div><div className="st-speaker-row"><span>B</span><div><strong>Konuşmacı B</strong><small>2 segment · örnek</small></div><button type="button" onClick={() => notify("Konuşmacı grubu düzenleme örneği.")}><Icon name="edit" size={14} /></button></div><small className="st-speaker-note">Etiketler gerçek kişi kimliğini belirlemez.</small></section>
              </aside>
            </div>
            <div className="st-audio-legal"><Icon name="info" size={14} /> Ses oynatma, ASR, gürültü azaltma, kanal işleme ve spektrogram bu görsel prototipte bağlı değildir. Dalga biçimi ve transkript yalnızca sentetik örnek içerir.</div>
          </div>}

          {workspaceTab === "questions" && <div className="st-questions-grid">
            <section className="st-panel"><PanelHeading title="Görevlendirme soruları" description="Soruların sırası kaynaktaki sırayla korunur. Her yanıt dayanağıyla ilişkilendirilir." action={<Badge tone="amber">2 yanıt tamamlanmadı</Badge>} />
              {questionsData.map((question, index) => <div className={"st-question-item" + (index === 0 ? " focused" : "")} key={question}><div className="st-question-number">SORU {String(index + 1).padStart(2, "0")}</div><h3>{question}</h3><textarea value={questionAnswers[index]} onChange={event => updateQuestion(index, event.target.value)} rows={index === 0 ? 4 : 3} placeholder="Uzman yanıtını buraya girin. Otomatik kanaat veya tahmin üretilmez." /><div className="st-question-foot"><label><input type="checkbox" checked={questionEvidence[index]} onChange={() => toggleEvidence(index)} /> Kaynak dayanağı bağlı</label><span>{questionAnswers[index].trim().length > 0 ? "Yanıt taslağı mevcut" : "Yanıt bekliyor"}</span></div></div>)}
              <div className="st-question-actions"><span>Yanıtlar bu önizlemede yerel ekran durumunda tutulur.</span><Button kind="primary" icon="check" onClick={() => notify("Örnek soru yanıtları çalışma görünümüne kaydedildi.")}>Yanıtları kaydet</Button></div>
            </section>
            <aside className="st-question-aside">
              <section className="st-panel"><PanelHeading title="Bulgular ve kaynak izi" description="Dayanaklar ilgili görev materyaline bağlanır." />
                <div className="st-finding"><span>01</span><div><strong>Örnek bulgu kaydı</strong><p>00:00:12.4 zamanında Konuşmacı A etiketiyle bir metin segmenti bulunur.</p><small><Icon name="audio" size={12} /> Telefon_gorusmesi_A.wav · {activeSegment.start}</small></div></div>
                <div className="st-finding"><span>02</span><div><strong>İkinci bulgu alanı</strong><p>Uzman incelemesi sonrasında gerekçeli bulgu eklenecek.</p><small>Kaynak bağlantısı bekleniyor</small></div></div>
              </section>
              <section className="st-panel"><PanelHeading title="Dayanak bağlantıları" description="Seçili soru için kaynaklar" />
                {questionEvidence.map((linked, index) => <div className="st-evidence-row" key={index}><span className="st-mini-file audio"><Icon name="audio" size={14} /></span><div><strong>{index === 0 ? "Telefon_gorusmesi_A.wav" : "Ortam_kaydi_B.wav"}</strong><small>{index === 0 ? "00:00:12.4–00:00:16.8" : "00:02:18.0–00:02:21.2"}</small></div><Badge tone={linked ? "green" : "gray"}>{linked ? "Bağlı" : "Bekliyor"}</Badge></div>)}
                <Button kind="secondary" size="small" icon="plus" onClick={() => notify("Dayanak seçici açma örneği.")}>Dayanak ekle</Button>
              </section>
              <div className="st-callout compact"><Icon name="info" size={15} /><div><strong>Uzman değerlendirmesi</strong><span>Konuşmacı A/B etiketleri kayıt içi gruplamadır. Kişi kimliği veya ses karşılaştırması anlamına gelmez.</span></div></div>
            </aside>
          </div>}

          {workspaceTab === "report" && <div className="st-report-layout">
            <section className="st-panel st-report-outline"><PanelHeading title="Rapor bölümleri" description="Tek ana rapor + ilgili ekler" />
              {["Üst bilgi ve merci", "Görev ve inceleme kapsamı", "İncelenen materyaller", "Yöntem ve teknik araçlar", "İnceleme bulguları", "Sorular ve yanıtlar", "Sonuç", "Ek-1 · Ses çözüm dökümü", "Ek-2 · Teknik kayıt"].map((item, index) => <button className={"st-outline-item" + (reportPage === (index < 5 ? 1 : 2) ? " active" : "")} key={item} type="button" onClick={() => setReportPage(index < 5 ? 1 : 2)}><span>{String(index + 1).padStart(2, "0")}</span>{item}</button>)}
              <div className="st-template-note"><span>ŞABLON REFERANSI</span><strong>Merci türüne göre örnek iskelet</strong><small>Tek ve evrensel zorunlu şablon iddiası yoktur. Belirsizlik teyit edilir.</small></div>
            </section>
            <section className="st-paper-column"><div className="st-paper-toolbar"><span><Icon name="file" size={14} /> A4 ÖNİZLEME <Badge tone="blue">TASLAK</Badge></span><div><button type="button" disabled>−</button><b>100%</b><button type="button" disabled>＋</button></div></div>
              <article className="st-paper">
                <header><span>T.C.</span><strong>{task.authority.toLocaleUpperCase("tr-TR")}</strong><b>BİLİRKİŞİ RAPORU</b><small>Dosya No: {task.number}</small></header>
                {reportPage === 1 ? <>
                  <h4>I. GÖREVLENDİRME VE İNCELEME KONUSU</h4><p>Görevlendirme yazısında yer alan inceleme kapsamı ve bilirkişiye yöneltilen sorular kaynak belgeye bağlı olarak bu bölümde gösterilir.</p>
                  <h4>II. İNCELENEN MATERYALLER</h4><p>1. Telefon_gorusmesi_A.wav · 08:42 · WAV · 16 kHz · Mono</p><p>2. Ortam_kaydi_B.wav · 17:05 · WAV · 48 kHz · Stereo</p><p>3. Telefon_gorusmesi_C.m4a · 03:16 · M4A · 44.1 kHz</p>
                  <h4>III. YÖNTEM VE TEKNİK ARAÇLAR</h4><p>Yerel ASR taslağı, ilgili ses aralıkları dinlenerek bilirkişi tarafından kontrol edilmiştir. Kullanılan motor, model ve sürüm bilgisi gerçek çalışma kaydından otomatik aktarılmalıdır.</p>
                  <h4>IV. İNCELEME BULGULARI</h4><p>Örnek kayıt üzerinde zaman damgalı transkript ve kontrol notları bulunmaktadır. Nihai bulgular uzman doğrulaması sonrasında bu bölümde yer alır.</p>
                </> : <>
                  <h4>V. GÖREVLENDİRME SORULARININ YANITLANMASI</h4><p><b>1. Soru:</b> Sunulan kayıtların konuşma içeriğini zaman damgalarıyla aktarınız.</p><p>Yanıt, kayıt bazında oluşturulan döküm ve ilgili zaman aralıklarına atıfla açıklanır.</p><p><b>2. Soru:</b> Kayıtta birden fazla konuşmacı bulunup bulunmadığını belirtiniz.</p><p>Kayıt içi anonim etiketler kullanılır; gerçek kişi kimliğine ilişkin çıkarım yapılmaz.</p>
                  <h4>VI. SONUÇ</h4><p>Sonuç bölümü, yalnızca görevlendirme kapsamı ve uzman tarafından doğrulanmış bulgularla sınırlıdır. Eksik veya duyulmayan içerik tahminle tamamlanmaz.</p>
                  <div className="st-signature"><span>Saygıyla arz olunur.</span><strong>Bilirkişi</strong><small>Ad Soyad · Sicil No</small><div>İMZA ALANI · TASLAK</div></div>
                  <h4>EKLER</h4><p>Ek-1 · Zaman damgalı ses çözüm dökümü</p><p>Ek-2 · Teknik materyal envanteri</p>
                </>}
                <footer><span>{task.number} · SENTETİK ÖRNEK</span><span>Sayfa {reportPage} / 2</span></footer>
              </article>
              <div className="st-paper-pagination"><Button kind="ghost" size="small" disabled={reportPage === 1} onClick={() => setReportPage(1)}><Icon name="chevronLeft" size={14} /> Önceki</Button><span>Sayfa {reportPage} / 2</span><Button kind="ghost" size="small" disabled={reportPage === 2} onClick={() => setReportPage(2)}>Sonraki <Icon name="chevron" size={14} /></Button></div>
            </section>
            <aside className="st-report-check">
              <section className="st-panel"><PanelHeading title="Rapor kontrolü" description="Uzman incelemesi öncesi durum" action={<Badge tone="amber">Taslak</Badge>} />
                <div className="st-report-blockers"><strong>{reportReview.filter(item => item !== "done").length} kontrol</strong><span>tamamlanmayı bekliyor</span></div>
                <div className="st-report-checklist">{["Görevlendirme kapsamı", "Tüm sorulara yanıt", "Yanıt-dayanak bağlantısı", "Transkript uzman kontrolü", "Kaynak envanteri", "Tüm A4 sayfalarının incelenmesi"].map((item, index) => <button type="button" className="st-report-check-row" key={item} onClick={() => toggleReview(index)}><i className={reportReview[index] === "done" ? "done" : "pending"}>{reportReview[index] === "done" ? <Icon name="check" size={11} /> : "!"}</i><span><strong>{item}</strong><small>{reportReview[index] === "done" ? "Kontrol edildi (örnek)" : "Uzman kontrolü bekliyor"}</small></span></button>)}</div>
                <div className="st-report-warning"><Icon name="alert" size={15} /><div><strong>Nihai insan onayı yok</strong><span>İmza, resmî teslim ve UYAP işlemi yapılmaz.</span></div></div>
                <Button kind="secondary" icon="download" disabled>DOCX / ODT dışa aktar</Button>
              </section>
              <section className="st-panel"><PanelHeading title="Revizyon geçmişi" description="Kim, neyi, ne zaman değiştirdi?" />
                <div className="st-revision"><i /><div><strong>Rapor taslağı oluşturuldu</strong><small>Otomatik · görev verilerinden</small></div></div>
                <div className="st-revision"><i /><div><strong>Transkript düzeltmesi</strong><small>Örnek revizyon · henüz imzalanmadı</small></div></div>
                <div className="st-revision"><i className="muted" /><div><strong>Nihai onay</strong><small>Henüz yapılmadı</small></div></div>
              </section>
            </aside>
          </div>}
        </>}

        {screen === "profile" && <>
          <PageTitle eyebrow="KİŞİSEL BİLGİLER" title="Bilirkişi Profilim" description="Meslekî uzmanlık, sicil ve yetkinlik bilgileriniz. Bu bilgiler MİHENK yazılım modüllerinden bağımsızdır."
            action={<Button icon="edit" onClick={() => setProfileEditing(value => !value)}>{profileEditing ? "Düzenlemeyi kapat" : "Profili düzenle"}</Button>} />
          <div className="st-profile-grid">
            <section className="st-panel st-profile-card"><div className="st-profile-person"><span>ÖB</span><div><strong>Örnek Bilirkişi</strong><small>Sentetik profil · gerçek kişi bilgisi içermez</small><Badge tone="green">Yerel profil</Badge></div></div><div className="st-profile-fields"><div><span>Meslek</span><strong>Adli bilişim uzmanı · örnek</strong></div><div><span>Uzmanlık sicili</span><strong>DEMO-SİCİL-0000</strong></div><div><span>Çalışma dili</span><strong>Türkçe</strong></div><div><span>Profil durumu</span><strong>Örnek / doğrulanmamış</strong></div></div>{profileEditing && <div className="st-callout compact"><Icon name="edit" size={15} /><div><strong>Profil düzenleme</strong><span>Bu prototipte bilgiler kaydedilmez; gerçek profil verisi mevcut uygulamada korunur.</span></div></div>}</section>
            <section className="st-panel"><PanelHeading title="Uzmanlık Alanlarım" description="Meslekî yetkinlik ve çalışma kapsamı" action={<Button size="small" icon="plus" onClick={() => notify("Uzmanlık alanı ekleme görünümü.")}>Alan ekle</Button>} />
              <div className="st-expertise"><span>01</span><div><strong>Ses kayıtlarının incelenmesi</strong><small>Meslekî uzmanlık alanı · doğrulama gerekir</small></div><Badge tone="blue">Profil alanı</Badge></div>
              <div className="st-expertise"><span>02</span><div><strong>Dijital materyal incelemesi</strong><small>Meslekî uzmanlık alanı · doğrulama gerekir</small></div><Badge tone="blue">Profil alanı</Badge></div>
              <div className="st-profile-note"><Icon name="info" size={15} /> Uzmanlık alanı, MİHENK modülünün kurulu veya kabul edilmiş olduğu anlamına gelmez.</div>
            </section>
          </div>
          <section className="st-panel st-profile-lower"><PanelHeading title="Yetkinlik ve belgeler" description="Kullanıcı tarafından tanımlanan meslekî kayıtlar" />
            <div className="st-credential-grid"><div><span className="st-credential-icon"><Icon name="file" size={18} /></span><div><strong>Meslekî eğitim kayıtları</strong><small>Henüz örnek belge eklenmedi</small></div><Badge tone="gray">Boş</Badge></div><div><span className="st-credential-icon"><Icon name="shield" size={18} /></span><div><strong>Uzmanlık / sicil doğrulaması</strong><small>Gerçek kullanıcı hesabında tanımlanır</small></div><Badge tone="amber">Doğrulama gerekir</Badge></div><div><span className="st-credential-icon"><Icon name="calendar" size={18} /></span><div><strong>Profil güncelleme</strong><small>Yerel profil kaydı örneği</small></div><Badge tone="gray">Demo</Badge></div></div>
          </section>
        </>}

        {screen === "modules" && <>
          <PageTitle eyebrow="MODÜL KATALOĞU" title="Uzmanlık Modülleri" description="MİHENK'in sunduğu iş akışları. Yazılım modülleri, kişisel uzmanlık alanlarından ayrı yönetilir." />
          <div className="st-module-feature">
            <div className="st-module-feature-head"><div className="st-module-emblem"><Icon name="audio" size={27} /></div><div><Badge tone="green">İLK AKTİF MODÜL</Badge><h2>56.12 · Ses Kayıtlarının Metne Dönüştürülmesi</h2><p>Görevlendirme içindeki sesleri yerel olarak yazıya dönüştürme, uzman kontrolü ve tek rapor akışı.</p></div></div>
            <div className="st-module-flow"><div><span>01</span><strong>Materyal kabulü</strong><small>Orijinal dosya ve envanter</small></div><i /><div><span>02</span><strong>Konuşma algılama</strong><small>VAD / sessizlik ayrımı</small></div><i /><div><span>03</span><strong>ASR taslağı</strong><small>Ham metin ve zaman izi</small></div><i /><div><span>04</span><strong>Uzman kontrolü</strong><small>Dinle, düzelt, doğrula</small></div><i /><div><span>05</span><strong>Tek rapor</strong><small>Dayanak ve ekler</small></div></div>
            <div className="st-module-feature-footer"><span><Icon name="shield" size={15} /> Görevde motor seçimi yapılmaz. Onaylı yerel profil otomatik kullanılır.</span><Button kind="primary" icon="arrow" onClick={() => navigate("engines")}>56.12 modülünü yönet</Button></div>
          </div>
          <div className="st-module-settings-grid">
            <button type="button" className="st-panel st-module-setting" onClick={() => navigate("engines")}><span className="st-setting-icon"><Icon name="layers" size={19} /></span><span><strong>Motorlar ve Modeller</strong><small>ASR adayları, yerel çalışma profili, sürüm, lisans ve benchmark.</small><em>Modül ayarları <Icon name="arrow" size={13} /></em></span></button>
            <button type="button" className="st-panel st-module-setting" onClick={() => navigate("audio-tools")}><span className="st-setting-icon"><Icon name="audio" size={19} /></span><span><strong>Ses Araçları</strong><small>Dinleme, kanal seçimi, A/B karşılaştırma ve çalışma kopyaları.</small><em>Dinleme ayarları <Icon name="arrow" size={13} /></em></span></button>
            <button type="button" className="st-panel st-module-setting" onClick={() => navigate("language-tools")}><span className="st-setting-icon"><Icon name="list" size={19} /></span><span><strong>Dil ve Metin</strong><small>VAD, isteğe bağlı konuşmacı gruplama ve noktalama yardımcıları.</small><em>Yardımcı bileşenler <Icon name="arrow" size={13} /></em></span></button>
            <button type="button" className="st-panel st-module-setting" onClick={() => navigate("test-history")}><span className="st-setting-icon"><Icon name="clock" size={19} /></span><span><strong>Test Geçmişi</strong><small>Benchmark karşılaştırmaları, sürüm ve kabul kayıtları.</small><em>Test sonuçları <Icon name="arrow" size={13} /></em></span></button>
          </div>
          <div className="st-inline-note module-note"><Icon name="info" size={15} /><span>Diğer uzmanlık modülleri, bağımsız kapsamları ve kabul kriterleri tanımlandığında kataloğa eklenir.</span></div>
        </>}

        {screen === "engines" && <>
          <div className="st-back-line"><button type="button" onClick={() => navigate("modules")}><Icon name="chevronLeft" size={15} /> Uzmanlık Modülleri</button><Badge tone="amber">Pilot profili doğrulanmadı</Badge></div>
          <PageTitle eyebrow="UZMANLIK MODÜLLERİ / 56.12" title="Motorlar ve Modeller" description="Yerel ASR motorları ve yardımcı bileşenlerin kurulum, sürüm, lisans, donanım ve test durumları." />
          <div className="st-engine-summary"><div><span>Etkin yerel profil</span><strong>Henüz doğrulanmadı</strong><small>Görevlerde otomatik uygulanacak profil yok.</small></div><div><span>Çalışma modu</span><strong>Çevrimdışı hedef</strong><small>Model kurulumundan sonra ağsız işleme.</small></div><div><span>Benchmark durumu</span><strong>Test bekliyor</strong><small>WER/CER ve kritik hata incelemesi gerekir.</small></div></div>
          <div className="st-engine-grid">
            <section className="st-panel"><PanelHeading title="Aday ASR motorları" description="Aday olmak, pilot için onaylanmış olmak değildir." action={<Badge tone="amber">Etkin profil yok</Badge>} />
              <div className="st-engine-card"><span className="st-engine-logo">S</span><div><Badge tone="amber">DENEYSEL ADAY</Badge><h3>SEDA · Yerel ASR</h3><p>Mevcut yerel deneme bileşeni. Türkçe veri seti, gerçek dosyalar ve uzman kontrolüyle karşılaştırmalı test gerekir.</p><div className="st-engine-meta"><span>Yerel çalışma</span><span>Test bekliyor</span><span>Sürüm doğrulaması gerekli</span></div></div><Button kind="secondary" size="small" onClick={() => navigate("test-history")}>Test kayıtları</Button></div>
              <div className="st-engine-card"><span className="st-engine-logo whisper">W</span><div><Badge tone="gray">KARŞILAŞTIRMA ADAYI</Badge><h3>Whisper ailesi</h3><p>Model boyutu, lisans, Türkçe performansı ve donanım gereksinimleri ölçülmeden etkinleştirilmez.</p><div className="st-engine-meta"><span>Model ailesi</span><span>Lisans incelemesi</span><span>Benchmark gerekli</span></div></div><Button kind="secondary" size="small" onClick={() => notify("Model ayrıntıları yalnızca tasarım örneğidir.")}>Ayrıntılar</Button></div>
            </section>
            <section className="st-panel"><PanelHeading title="Çalışma profili" description="Gerçek testle doğrulanıp sabitlenen bileşenler" />
              <div className="st-empty-engine"><span><Icon name="cpu" size={25} /></span><strong>Etkin yerel çalışma profili yok</strong><p>Bir motor; sürüm, lisans, donanım, veri seti ve uzman kabul testleri tamamlandıktan sonra etkin profile alınabilir.</p><Button kind="secondary" size="small" onClick={() => navigate("test-history")}>Kabul ölçütlerini görüntüle</Button></div>
              <div className="st-engine-chain"><span>Ses ön kontrol</span><Icon name="arrow" size={13} /><span>VAD</span><Icon name="arrow" size={13} /><span>ASR taslağı</span><Icon name="arrow" size={13} /><span>Uzman doğrulaması</span></div>
            </section>
          </div>
          <section className="st-panel st-aux-components"><PanelHeading title="Yardımcı bileşenler" description="Nihai kelime kaynağı ASR çıktısı ve uzman kontrolüdür." />
            <div><span><strong>VAD</strong><small>Konuşma / sessizlik tespiti</small></span><Badge tone="amber">Test gerekli</Badge></div><div><span><strong>Konuşmacı gruplama</strong><small>Anonim A/B etiketleri</small></span><Badge tone="gray">İsteğe bağlı</Badge></div><div><span><strong>Noktalama</strong><small>Sınırlı metin biçimlendirme</small></span><Badge tone="gray">İsteğe bağlı</Badge></div><div><span><strong>LLM / serbest metin</strong><small>Transkripsiyonun kelime kaynağı değildir</small></span><Badge tone="blue">Varsayılan dışı</Badge></div>
          </section>
        </>}

        {screen === "audio-tools" && <>
          <div className="st-back-line"><button type="button" onClick={() => navigate("modules")}><Icon name="chevronLeft" size={15} /> 56.12 Genel Bakış</button></div>
          <PageTitle eyebrow="UZMANLIK MODÜLLERİ / 56.12" title="Ses Araçları" description="Dinleme ve teknik inceleme araçları. Her işlem, orijinal dosyadan ayrı ve geri alınabilir bir çalışma kopyasında yürütülür." />
          <div className="st-tool-catalog">
            <section className="st-panel"><div className="st-tool-catalog-icon"><Icon name="audio" size={21} /></div><h3>Dinleme ve oynatma</h3><p>Hız ayarı, kısa geri/ileri sarma, A–B aralığı ve segment tekrar dinleme.</p><Badge tone="green">Temel iş akışı</Badge></section>
            <section className="st-panel"><div className="st-tool-catalog-icon"><Icon name="sliders" size={21} /></div><h3>Kanal seçimi</h3><p>Sol/sağ kanalı ayrı dinleme ve kanal karşılaştırma görünümü.</p><Badge tone="blue">Teknik araç</Badge></section>
            <section className="st-panel"><div className="st-tool-catalog-icon"><Icon name="spark" size={21} /></div><h3>Gürültü azaltma</h3><p>Yalnızca ayrı çalışma kopyasında; öncesi/sonrası karşılaştırmalı değerlendirme.</p><Badge tone="amber">Motor / kalite testi gerekli</Badge></section>
            <section className="st-panel"><div className="st-tool-catalog-icon"><Icon name="eye" size={21} /></div><h3>Spektrogram</h3><p>Frekans-zaman görünümü ve seçili zaman aralığını inceleme.</p><Badge tone="amber">Sonraki teknik kabul</Badge></section>
            <section className="st-panel"><div className="st-tool-catalog-icon"><Icon name="rotate" size={21} /></div><h3>Orijinal / işlenmiş kopya</h3><p>Kaynak dosya değiştirilmez; her türetilmiş kopyanın aracı ve ayarı kayıt altında tutulur.</p><Badge tone="green">İlke</Badge></section>
            <section className="st-panel"><div className="st-tool-catalog-icon"><Icon name="shield" size={21} /></div><h3>İşlem geçmişi</h3><p>Uygulanan araç, sürüm, parametre, tarih ve kaynak kopya ilişkisi.</p><Badge tone="green">Denetlenebilirlik</Badge></section>
          </div>
          <div className="st-callout"><Icon name="alert" size={16} /><div><strong>Adli ses ilkesi</strong><span>Ses iyileştirme, duyulmayan kelimeyi üretmek veya kayıtta olmayan bilgiyi eklemek için kullanılmaz. İyileştirme konuşmayı daha anlaşılır kılmıyorsa orijinal kayda dönülür.</span></div></div>
        </>}

        {screen === "language-tools" && <>
          <div className="st-back-line"><button type="button" onClick={() => navigate("modules")}><Icon name="chevronLeft" size={15} /> 56.12 Genel Bakış</button></div>
          <PageTitle eyebrow="UZMANLIK MODÜLLERİ / 56.12" title="Dil ve Metin" description="Konuşma algılama ve sınırlı metin yardımcıları. Serbest metin üreten dil modeli nihai transkripsiyon kaynağı değildir." />
          <section className="st-panel st-language-panel"><PanelHeading title="Yardımcı bileşenler" description="Bileşenler test edilip uzman tarafından kabul edilmeden etkinleştirilmez." />
            <div className="st-language-row"><span className="st-language-mark">V</span><div><strong>VAD · Konuşma / sessizlik algılama</strong><small>Konuşma aralıklarını belirler; metin veya sözcük üretmez.</small></div><Badge tone="amber">Test gerekli</Badge><Button size="small" onClick={() => notify("VAD ayar görünümü.")}>Ayrıntılar</Button></div>
            <div className="st-language-row"><span className="st-language-mark">A/B</span><div><strong>Konuşmacı gruplama</strong><small>Kayıt içi anonim gruplar; gerçek kişi kimliği belirlemez.</small></div><Badge tone="gray">İsteğe bağlı</Badge><Button size="small" onClick={() => notify("Konuşmacı gruplama ayar görünümü.")}>Ayrıntılar</Button></div>
            <div className="st-language-row"><span className="st-language-mark">¶</span><div><strong>Noktalama ve metin biçimlendirme</strong><small>ASR sözcüklerini yeniden yazmadan okunabilir biçim.</small></div><Badge tone="gray">İsteğe bağlı</Badge><Button size="small" onClick={() => notify("Noktalama ayar görünümü.")}>Ayrıntılar</Button></div>
            <div className="st-language-row"><span className="st-language-mark">LLM</span><div><strong>Serbest metin / LLM</strong><small>Transkripsiyon kelimelerini bağlamdan tahmin ederek tamamlamaz.</small></div><Badge tone="blue">Varsayılan dışı</Badge><Button size="small" onClick={() => notify("Serbest metin işlevi transkripsiyon zincirine dahil değildir.")}>Politikayı gör</Button></div>
          </section>
          <div className="st-callout"><Icon name="shield" size={16} /><div><strong>Metin kaynağı ve izlenebilirlik</strong><span>Ham ASR çıktısı, uzman düzeltmesi ve yardımcı biçimlendirme ayrı tutulur. Her metin parçası kaynak ses zamanına geri bağlanabilir.</span></div></div>
        </>}

        {screen === "test-history" && <>
          <div className="st-back-line"><button type="button" onClick={() => navigate("modules")}><Icon name="chevronLeft" size={15} /> 56.12 Genel Bakış</button><Badge tone="amber">Pilot kabulü yok</Badge></div>
          <PageTitle eyebrow="UZMANLIK MODÜLLERİ / 56.12" title="Test Geçmişi" description="ASR adaylarının karşılaştırmalı değerlendirmeleri ve etkin yerel profilin kabul kayıtları." />
          <div className="st-test-summary"><div><span>Benchmark çalışması</span><strong>Henüz başlatılmadı</strong></div><div><span>Karşılaştırılan aday</span><strong>2</strong></div><div><span>Uzman kabulü</span><strong>Bekliyor</strong></div></div>
          <section className="st-panel"><PanelHeading title="Değerlendirme kapıları" description="Üretim profili etkinleştirilmeden önce tamamlanması gereken kayıtlar." />
            <div className="st-test-gate"><span>01</span><div><strong>Türkçe referans veri seti</strong><small>Çeşitli kayıt koşulları ve insan tarafından doğrulanmış referans metin.</small></div><Badge tone="amber">Bekliyor</Badge></div>
            <div className="st-test-gate"><span>02</span><div><strong>WER / CER ve kritik hata incelemesi</strong><small>Genel hata oranına ek olarak özel isim, sayı, olumsuzluk ve konuşmacı karışması kontrolü.</small></div><Badge tone="amber">Bekliyor</Badge></div>
            <div className="st-test-gate"><span>03</span><div><strong>Donanım, süre ve çevrimdışı çalışma</strong><small>İşlem süresi, bellek, GPU/CPU, ağsız kurulum ve kararlılık.</small></div><Badge tone="amber">Bekliyor</Badge></div>
            <div className="st-test-gate"><span>04</span><div><strong>Lisans ve sürüm sabitleme</strong><small>Dağıtım koşulları, model hash'i, sürüm bilgisi ve yeniden üretilebilir kurulum.</small></div><Badge tone="amber">Bekliyor</Badge></div>
            <div className="st-test-gate"><span>05</span><div><strong>Alan uzmanı kabulü</strong><small>Bağımsız dinleme ve örneklem kontrolü; görev motor seçimi yapılmaz.</small></div><Badge tone="amber">Bekliyor</Badge></div>
          </section>
          <div className="st-callout"><Icon name="info" size={16} /><div><strong>SEDA ve Whisper aday konumundadır</strong><span>Bu ekran motorların doğruluğunu veya pilot kabulünü iddia etmez; test sonuçları oluştuğunda karşılaştırma kaydı burada gösterilir.</span></div></div>
        </>}

        {screen === "vault" && <>
          <PageTitle eyebrow="GİZLİLİK VE VERİ GÜVENLİĞİ" title="Kasa ve Güvenlik" description="Görev materyalleri için yerel saklama, erişim ve bütünlük yaklaşımı. Bu ekran demo durumlarını gösterir." action={<Badge tone="green">Yerel çalışma ilkesi</Badge>} />
          <div className="st-vault-grid"><section className="st-panel st-vault-hero"><div className="st-vault-large-icon"><Icon name="shield" size={27} /></div><Badge tone="amber">DEMO KİLİDİ AÇIK</Badge><h2>Yerel kasa çalışma alanı</h2><p>Gerçek uygulamada görev dosyaları, ses materyalleri ve çalışma kopyaları şifreli yerel kasa içinde tutulur. Prototip gerçek dosya saklamaz.</p><Button kind="secondary" icon="lock" onClick={() => notify("Kasa kilitleme yalnız görsel demo durumudur.")}>Kasayı kilitle · demo</Button></section>
            <section className="st-panel"><PanelHeading title="Güvenlik durumu" description="Örnek yapılandırma" /><div className="st-security-list"><div><span>Yerel saklama</span><Badge tone="green">Tasarım ilkesi</Badge></div><div><span>Şifreleme anahtarı</span><Badge tone="amber">Kurulum gerekir</Badge></div><div><span>Dosya bütünlüğü</span><Badge tone="blue">Hash kaydı</Badge></div><div><span>Yedekleme</span><Badge tone="gray">Yapılandırılmadı</Badge></div><div><span>Oturum kilidi</span><Badge tone="amber">Demo durumu</Badge></div></div></section>
            <section className="st-panel"><PanelHeading title="Denetim kaydı" description="Örnek olay kayıtları" /><div className="st-timeline"><div><i className="green" /><span><strong>Yerel demo oturumu açıldı</strong><small>Bugün · örnek kayıt</small></span></div><div><i className="blue" /><span><strong>Görev çalışma alanı görüntülendi</strong><small>2026/184 E. · örnek kayıt</small></span></div><div><i className="amber" /><span><strong>Güvenli kasa yapılandırması bekleniyor</strong><small>Gerçek uygulama doğrulaması gerekli</small></span></div></div></section>
          </div>
        </>}

        {screen === "settings" && <>
          <PageTitle eyebrow="UYGULAMA" title="Uygulama Ayarları" description="Kullanıcı arayüzü, erişilebilirlik ve yerel çalışma tercihleri. Bu prototipte tercihler örnek gösterim içindir." />
          <div className="st-settings-grid">
            <section className="st-panel"><PanelHeading title="Görünüm ve erişilebilirlik" description="Arayüz tercihleri" /><div className="st-setting-row"><span><strong>Menüyü daralt</strong><small>Sol gezinme menüsünü daha kompakt gösterin.</small></span><button type="button" className={"st-toggle" + (collapsed ? " on" : "")} onClick={() => setCollapsed(value => !value)}><i /></button></div><div className="st-setting-row"><span><strong>Yüksek kontrastlı metin</strong><small>Metin ve arka plan farkını artırın.</small></span><button type="button" className="st-toggle" onClick={() => notify("Kontrast tercihi bu prototipte uygulanmadı.")}><i /></button></div><div className="st-setting-row"><span><strong>Animasyonları azalt</strong><small>Geçiş hareketlerini sınırlandırın.</small></span><button type="button" className="st-toggle" onClick={() => notify("Animasyon tercihi bu prototipte uygulanmadı.")}><i /></button></div></section>
            <section className="st-panel"><PanelHeading title="Yerel çalışma" description="İşleme ve veri tercihi" /><div className="st-setting-row"><span><strong>Çevrimdışı çalışma modu</strong><small>Üretim profilinde ağsız işleme hedefi.</small></span><Badge tone="blue">Tasarım hedefi</Badge></div><div className="st-setting-row"><span><strong>Otomatik taslak kaydı</strong><small>Yeni görevlendirme ilk belgeden itibaren taslak oluşturur.</small></span><Badge tone="green">Akış ilkesi</Badge></div><div className="st-setting-row"><span><strong>Örnek veri görünümü</strong><small>Bu tasarım incelemesinde tüm içerikler sentetiktir.</small></span><Badge tone="amber">Açık</Badge></div></section>
          </div>
          <div className="st-callout"><Icon name="info" size={16} /><div><strong>Gerçek uygulama ayarları korunur</strong><span>V0.5 görsel prototipi bağımsız bir önizlemedir; buradaki tercih değişiklikleri mevcut uygulamanın kasasını veya kullanıcı ayarlarını etkilemez.</span></div></div>
        </>}
      </main>
    </div>
    {toast && <div className="st-toast"><Icon name="check" size={16} />{toast}</div>}
    <div className="st-demo-footer"><span><i /> TASARIM İNCELEME MODU</span><span>Gerçek dosya, ses veya kişisel veri kullanılmaz</span><span>v0.5 · HIGH-FIDELITY UI</span></div>
  </div>;
}
