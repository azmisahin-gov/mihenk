import { useMemo, useState, type ReactNode } from "react";
import "./wireframe.css";

type Screen = "tasks" | "new-assignment" | "workspace" | "profile" | "modules" | "engines";
type WorkspaceTab = "overview" | "assignment" | "materials" | "audio" | "questions" | "report";

type DemoTask = {
  id: string;
  label: string;
  reference: string;
  authority: string;
  due: string;
  status: string;
  records: number;
  review: number;
  questions: number;
  updated: string;
};

const initialTasks: DemoTask[] = [
  { id: "demo-014", label: "Ses inceleme · Örnek görev A", reference: "DEMO-2026-014", authority: "Örnek Ceza Mahkemesi", due: "24.11.2026", status: "İnceleme sürüyor", records: 3, review: 7, questions: 2, updated: "Bugün, 10:42" },
  { id: "demo-013", label: "Çoklu kayıt · Örnek görev B", reference: "DEMO-2026-013", authority: "Örnek Cumhuriyet Başsavcılığı", due: "28.11.2026", status: "Görev taslağı", records: 2, review: 0, questions: 3, updated: "Dün, 16:18" },
  { id: "demo-011", label: "Transkript kontrolü · Örnek görev C", reference: "DEMO-2026-011", authority: "Örnek Hukuk Mahkemesi", due: "02.12.2026", status: "Rapor kontrolü", records: 1, review: 2, questions: 1, updated: "12.11.2026" },
];

const recordings = [
  { id: "rec-a", name: "Kayit_A_demo.wav", duration: "00:18:42", size: "18,4 MB", status: "Kontrol bekliyor" },
  { id: "rec-b", name: "Kayit_B_demo.m4a", duration: "00:07:16", size: "6,2 MB", status: "Transkript taslağı" },
  { id: "rec-c", name: "Kayit_C_demo.wav", duration: "00:03:51", size: "4,1 MB", status: "Uzman kontrolünde" },
];

const transcriptSegments = [
  { id: "seg-01", time: "00:00:12.4", speaker: "Konuşmacı A", text: "Toplantının başlangıcında gündem maddelerini birlikte değerlendirelim.", flag: "Düşük ses seviyesi", priority: "Öncelikli kontrol" },
  { id: "seg-02", time: "00:00:28.8", speaker: "Konuşmacı B", text: "İlk belgeyi geçen hafta teslim aldığımızı teyit ediyorum.", flag: "Olası örtüşen konuşma", priority: "Kontrol et" },
  { id: "seg-03", time: "00:00:41.2", speaker: "Konuşmacı A", text: "Bu bölümde tarih bilgisini kayıttan ayrıca doğrulamamız gerekiyor.", flag: "Elle işaretlendi", priority: "Kontrol et" },
  { id: "seg-04", time: "00:01:06.0", speaker: "Konuşmacı B", text: "Belgenin ikinci sayfasında yer alan açıklamaya bakabiliriz.", flag: "Belirsizlik işareti yok", priority: "Normal" },
  { id: "seg-05", time: "00:01:34.6", speaker: "Konuşmacı A", text: "Sonuç bölümünü hazırlarken bu ayrımı açıkça belirtelim.", flag: "Düşük model güveni", priority: "Öncelikli kontrol" },
];

const waveformBars = [18,24,31,22,40,56,34,27,45,62,48,30,21,38,52,66,42,29,35,58,72,47,31,22,43,60,37,28,51,68,42,25,33,55,74,49,31,20,39,58,45,27,36,64,51,29,43,70,48,32,22,39,61,46,28,37,56,73,41,25,34,52,65,38,27,44,59,31,21,47,68,42,30,55,72,39,24,33,58,46,28,40,63,50,26,35,57,69,43,29,38,61,48,22,34,54,67,40];

const workspaceTabs: { id: WorkspaceTab; label: string; icon: string }[] = [
  { id: "overview", label: "Görev Özeti", icon: "▦" },
  { id: "assignment", label: "Görevlendirme", icon: "▤" },
  { id: "materials", label: "Materyaller", icon: "▧" },
  { id: "audio", label: "Ses ve Transkript", icon: "◖" },
  { id: "questions", label: "Sorular ve Bulgular", icon: "☷" },
  { id: "report", label: "Tek Rapor", icon: "▥" },
];

function StatusPill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "green" | "amber" | "blue" }) {
  return <span className={"wf-status wf-status-" + tone}><i />{children}</span>;
}

function PrototypeNotice({ children }: { children: ReactNode }) {
  return <div className="wf-prototype-note"><span className="wf-note-icon">i</span><div>{children}</div></div>;
}

export default function WireframePrototype() {
  const [screen, setScreen] = useState<Screen>("tasks");
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("overview");
  const [collapsed, setCollapsed] = useState(false);
  const [tasks, setTasks] = useState(initialTasks);
  const [activeTaskId, setActiveTaskId] = useState("demo-014");
  const [searchText, setSearchText] = useState("");
  const [showSampleDocument, setShowSampleDocument] = useState(false);
  const [draftTitle, setDraftTitle] = useState("Ses inceleme · Yeni örnek görev");
  const [selectedRecording, setSelectedRecording] = useState("rec-a");
  const [selectedSegment, setSelectedSegment] = useState("seg-01");
  const [transcriptDraft, setTranscriptDraft] = useState(transcriptSegments[0].text);
  const [questionAnswer, setQuestionAnswer] = useState("Örnek kayıtta toplantı gündemine ilişkin bir değerlendirme yapıldığı görülmektedir. Bu ifade, yalnızca ilgili zaman aralığındaki ses kaydının uzman kontrolü sonrasında raporlanmalıdır.");
  const [supportLinked, setSupportLinked] = useState(true);
  const [reportPage, setReportPage] = useState(1);
  const [profileEditing, setProfileEditing] = useState(false);
  const [notice, setNotice] = useState("Bu prototip yalnızca sentetik örnek veri içerir. Gerçek vaka dosyası eklemeyin.");

  const activeTask = tasks.find((task) => task.id === activeTaskId) ?? tasks[0];
  const filteredTasks = useMemo(() => tasks.filter((task) =>
    (task.label + " " + task.reference + " " + task.authority).toLocaleLowerCase("tr-TR").includes(searchText.toLocaleLowerCase("tr-TR"))
  ), [tasks, searchText]);
  const activeRecording = recordings.find((record) => record.id === selectedRecording) ?? recordings[0];
  const activeSegment = transcriptSegments.find((segment) => segment.id === selectedSegment) ?? transcriptSegments[0];

  function openTask(taskId: string, tab: WorkspaceTab = "overview") {
    setActiveTaskId(taskId);
    setWorkspaceTab(tab);
    setScreen("workspace");
  }

  function createDraftTask() {
    const created: DemoTask = {
      id: "demo-new-" + (tasks.length + 1),
      label: draftTitle.trim() || "Yeni örnek görevlendirme",
      reference: "DEMO-2026-" + String(15 + tasks.length).padStart(3, "0"),
      authority: "Örnek merci · henüz doğrulanmadı",
      due: "Belirtilmedi",
      status: "Görev taslağı",
      records: 0,
      review: 0,
      questions: 0,
      updated: "Az önce",
    };
    setTasks((current) => [created, ...current]);
    setActiveTaskId(created.id);
    setWorkspaceTab("assignment");
    setScreen("workspace");
    setShowSampleDocument(false);
    setNotice("Örnek görev taslağı açıldı. Belge çıkarımı/OCR bu ekranda gerçek bir işlem değildir.");
  }

  function navigate(next: Screen) {
    setScreen(next);
    if (next !== "workspace") setNotice("");
  }

  return (
    <div className="mihenk-wf">
      <aside className={"wf-sidebar" + (collapsed ? " is-collapsed" : "")}>
        <div className="wf-brand">
          <div className="wf-brand-mark">M</div>
          {!collapsed && <div className="wf-brand-copy"><strong>MİHENK</strong><span>Bilirkişi çalışma alanı</span></div>}
          <button className="wf-collapse" type="button" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? "Menüyü genişlet" : "Menüyü daralt"} title={collapsed ? "Menüyü genişlet" : "Menüyü daralt"}>{collapsed ? "»" : "«"}</button>
        </div>
        {!collapsed && <div className="wf-nav-label">ÇALIŞMA ALANI</div>}
        <nav className="wf-nav" aria-label="Ana menü">
          <button type="button" className={screen === "tasks" || screen === "new-assignment" || screen === "workspace" ? "active" : ""} onClick={() => navigate("tasks")} title="Görevlerim"><span>▦</span>{!collapsed && "Görevlerim"}</button>
          <button type="button" className={screen === "profile" ? "active" : ""} onClick={() => navigate("profile")} title="Bilirkişi Profilim"><span>◎</span>{!collapsed && "Bilirkişi Profilim"}</button>
          <button type="button" className={screen === "modules" || screen === "engines" ? "active" : ""} onClick={() => navigate("modules")} title="Uzmanlık Modülleri"><span>▧</span>{!collapsed && "Uzmanlık Modülleri"}</button>
          {screen === "engines" && <button type="button" className="wf-subnav-active" onClick={() => navigate("engines")} title="Motorlar ve Modeller"><span>⌁</span>{!collapsed && "Motorlar ve Modeller"}</button>}
        </nav>
        <div className="wf-sidebar-bottom">
          <div className="wf-sidebar-indicator"><span className="wf-indicator-dot" />{!collapsed && <div><strong>Prototip ortamı</strong><small>Sentetik veriler · gerçek işlem yok</small></div>}</div>
          {!collapsed && <div className="wf-sidebar-version">v0.5 TASARIM ÖNİZLEMESİ</div>}
        </div>
      </aside>

      <main className="wf-main">
        <header className="wf-topbar">
          <div className="wf-breadcrumb">
            <span>MİHENK</span><b>/</b>
            {screen === "workspace" ? <><button type="button" onClick={() => navigate("tasks")}>Görevlerim</button><b>/</b><strong>{activeTask.label}</strong></>
              : <strong>{screen === "tasks" || screen === "new-assignment" ? "Görevlerim" : screen === "profile" ? "Bilirkişi Profilim" : screen === "modules" ? "Uzmanlık Modülleri" : "56.12 · Motorlar ve Modeller"}</strong>}
          </div>
          <div className="wf-top-actions">
            <span className="wf-preview-chip"><i /> UI PROTOTİPİ</span>
            <button className="wf-top-button" type="button" onClick={() => { navigate("new-assignment"); setShowSampleDocument(false); }}>＋ Yeni görevlendirme</button>
          </div>
        </header>

        <div className="wf-content">
          <div className="wf-demo-banner">
            <span className="wf-demo-banner-icon">◇</span>
            <div><strong>TASARIM ÖNİZLEMESİ · SENTETİK VERİ</strong><p>Bu sürüm v0.5 ekran ve gezinme değerlendirmesi içindir. Gerçek dosya, ses, OCR, ASR, rapor üretimi veya kasa işlemi yapılmaz.</p></div>
            <span className="wf-demo-banner-tag">GERÇEK VAKA KULLANMAYIN</span>
          </div>

          {notice && <div className="wf-toast" role="status"><span>✓</span>{notice}<button type="button" aria-label="Bildirimi kapat" onClick={() => setNotice("")}>×</button></div>}

          {screen === "tasks" && (
            <>
              <section className="wf-page-heading">
                <div><div className="wf-eyebrow">ÇALIŞMA ALANIM</div><h1>Görevlerim</h1><p>Görevlendirmelerinizi, sıradaki işleri ve rapor durumlarını tek yerden takip edin.</p></div>
                <button className="wf-primary" type="button" onClick={() => { navigate("new-assignment"); setShowSampleDocument(false); }}>＋ Yeni görevlendirme</button>
              </section>
              <div className="wf-metric-grid">
                <div className="wf-metric"><span>Toplam görev</span><strong>{tasks.length.toString().padStart(2, "0")}</strong><small>Bu cihazdaki örnek çalışma alanı</small></div>
                <div className="wf-metric"><span>Kontrol bekleyen bölüm</span><strong>09</strong><small>Öncelik sırasına göre listelenir</small></div>
                <div className="wf-metric"><span>Yanıt bekleyen soru</span><strong>03</strong><small>Görevlendirme sırası korunur</small></div>
                <div className="wf-metric"><span>Rapor durumu</span><strong className="wf-metric-word">2 taslak</strong><small>Nihai uzman onayı bekliyor</small></div>
              </div>
              <section className="wf-panel">
                <div className="wf-panel-heading"><div><h2>Görev listesi</h2><p>Bir görevi açarak kendi materyal ve soru alanına geçin.</p></div><div className="wf-search"><span>⌕</span><input value={searchText} onChange={(event) => setSearchText(event.currentTarget.value)} placeholder="Görev ara…" aria-label="Görev ara" /></div></div>
                <div className="wf-table-wrap">
                  <table className="wf-task-table">
                    <thead><tr><th>Görevlendirme</th><th>Merci</th><th>Son tarih</th><th>Durum</th><th>Kontrol</th><th /></tr></thead>
                    <tbody>{filteredTasks.map((task) => (
                      <tr key={task.id} onClick={() => openTask(task.id)} tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") openTask(task.id); }}>
                        <td><strong>{task.label}</strong><small>{task.reference}</small></td><td>{task.authority}</td><td>{task.due}</td>
                        <td><StatusPill tone={task.status === "İnceleme sürüyor" ? "green" : task.status === "Rapor kontrolü" ? "blue" : "amber"}>{task.status}</StatusPill></td>
                        <td><span className="wf-count">{task.review} bölüm</span></td><td><button type="button" className="wf-row-open" onClick={(event) => { event.stopPropagation(); openTask(task.id); }}>Aç <span>→</span></button></td>
                      </tr>
                    ))}</tbody>
                  </table>
                  {filteredTasks.length === 0 && <div className="wf-empty">Aramanızla eşleşen görev bulunamadı.</div>}
                </div>
              </section>
              <div className="wf-bottom-grid">
                <div className="wf-info-card"><div className="wf-info-icon">◖</div><div><strong>Öncelikli ses kontrolü</strong><p>İlk sırada dinlenmesi önerilen bölümleri açın; tüm kayıtlar ve transkript erişilebilir kalır.</p><button type="button" onClick={() => openTask("demo-014", "audio")}>Ses inceleme tezgâhına git →</button></div></div>
                <div className="wf-info-card"><div className="wf-info-icon">▥</div><div><strong>Tek rapor yaklaşımı</strong><p>Her görev tek ana rapor ve aynı paketteki ilgili eklerle ilerler.</p><button type="button" onClick={() => openTask("demo-014", "report")}>Rapor görünümünü aç →</button></div></div>
              </div>
            </>
          )}

          {screen === "new-assignment" && (
            <>
              <section className="wf-page-heading">
                <div><div className="wf-eyebrow">GÖREVLERİM / YENİ</div><h1>Yeni görevlendirme</h1><p>İlk belge görev taslağını başlatır. Materyalleri şimdi veya görev içinden daha sonra ekleyebilirsiniz.</p></div>
                <button className="wf-secondary" type="button" onClick={() => navigate("tasks")}>← Görevlerime dön</button>
              </section>
              <div className="wf-flow-steps"><div className="current"><i>1</i><span>Görevlendirme belgesi</span></div><b /><div><i>2</i><span>Alanları doğrula</span></div><b /><div><i>3</i><span>Materyaller</span></div><b /><div><i>4</i><span>Çalışma alanı</span></div></div>
              <div className="wf-two-column">
                <section className="wf-panel">
                  <div className="wf-panel-heading"><div><h2>Görevlendirme yazısı</h2><p>PDF veya taranmış belge bu alana bırakılacak şekilde tasarlanmıştır.</p></div><StatusPill tone="amber">Taslak başlangıcı</StatusPill></div>
                  <div className={"wf-dropzone" + (showSampleDocument ? " has-file" : "")}>
                    <div className="wf-drop-icon">{showSampleDocument ? "✓" : "⇧"}</div>
                    <strong>{showSampleDocument ? "ornek-gorevlendirme-demo.pdf" : "Belgeyi buraya bırakın"}</strong>
                    <p>{showSampleDocument ? "Örnek belge eklendi · sentetik veri" : "PDF, DOCX veya taranmış görüntü · tasarım örneği"}</p>
                    <button className="wf-secondary" type="button" onClick={() => setShowSampleDocument((value) => !value)}>{showSampleDocument ? "Örnek belgeyi kaldır" : "Örnek belgeyi göster"}</button>
                  </div>
                  <PrototypeNotice>Bu prototip dosya seçmez veya yüklemez. OCR/metin çıkarımı, görev alanı tespiti ve kaynak bağlantısı gerçek uygulama aşamasında bağlanacaktır.</PrototypeNotice>
                  <div className="wf-form-field"><label>Görev etiketi</label><input value={draftTitle} onChange={(event) => setDraftTitle(event.currentTarget.value)} maxLength={100} /></div>
                  <div className="wf-inline-actions"><button className="wf-secondary" type="button" onClick={() => navigate("tasks")}>İptal</button><button className="wf-primary" type="button" disabled={!showSampleDocument} onClick={createDraftTask}>Örnek taslak oluştur →</button></div>
                </section>
                <section className="wf-panel">
                  <div className="wf-panel-heading"><div><h2>İş akışı nasıl ilerler?</h2><p>Sabit adımlı sihirbaz değil, geri dönülebilir görev kabulü.</p></div></div>
                  <div className="wf-process-list">
                    <div><i>01</i><span><strong>Taslak anında kaydolur</strong><small>İlk belge alındığında görev kaydı oluşur.</small></span><em>Otomatik</em></div>
                    <div><i>02</i><span><strong>Alanlar kaynağıyla çıkarılır</strong><small>Merci, tarih, kapsam ve sorular uzman kontrolüne sunulur.</small></span><em>İnceleme</em></div>
                    <div><i>03</i><span><strong>Materyal kabulü sürer</strong><small>Beklenen ve teslim alınan materyal ayrı izlenir.</small></span><em>Esnek</em></div>
                    <div><i>04</i><span><strong>Görevlerime her zaman dönülür</strong><small>Taslağı sonra açıp çalışmaya devam edebilirsiniz.</small></span><em>Her zaman</em></div>
                  </div>
                  <div className="wf-inline-callout"><strong>Motor seçimi gerekmez.</strong><span>Görev içinde motor/model seçilmez. Etkinleştirilmiş ve doğrulanmış yerel çalışma profili varsa sistem otomatik uygular.</span></div>
                </section>
              </div>
            </>
          )}

          {screen === "workspace" && (
            <>
              <section className="wf-workspace-heading">
                <div><button className="wf-back-link" type="button" onClick={() => navigate("tasks")}>← Görevlerim</button><div className="wf-eyebrow">{activeTask.reference} · 56.12 SES KAYITLARI</div><h1>{activeTask.label}</h1><p>{activeTask.authority} <span>·</span> Son tarih: {activeTask.due}</p></div>
                <StatusPill tone="amber">{activeTask.status}</StatusPill>
              </section>
              <nav className="wf-workspace-tabs" aria-label="Görev bölümleri">
                {workspaceTabs.map((tab) => <button key={tab.id} type="button" className={workspaceTab === tab.id ? "active" : ""} onClick={() => setWorkspaceTab(tab.id)}><span>{tab.icon}</span>{tab.label}</button>)}
              </nav>

              {workspaceTab === "overview" && (
                <>
                  <div className="wf-task-overview-grid">
                    <div className="wf-panel wf-next-panel"><div className="wf-panel-heading"><div><h2>Bir sonraki işler</h2><p>Görevin durumuna göre önerilen inceleme sırası.</p></div><span className="wf-next-label">ÖNCELİK</span></div>
                      <button type="button" className="wf-next-item" onClick={() => setWorkspaceTab("audio")}><i className="wf-next-number">01</i><span><strong>7 ses bölümünü kontrol edin</strong><small>Öncelik işaretleri bulunan bölümler · tüm kayıtlar erişilebilir</small></span><b>→</b></button>
                      <button type="button" className="wf-next-item" onClick={() => setWorkspaceTab("questions")}><i className="wf-next-number">02</i><span><strong>2 görevlendirme sorusunu yanıtlayın</strong><small>Yanıtları ilgili transkript dayanağına bağlayın</small></span><b>→</b></button>
                      <button type="button" className="wf-next-item" onClick={() => setWorkspaceTab("report")}><i className="wf-next-number">03</i><span><strong>Tek raporu gözden geçirin</strong><small>İmzasız taslak · A4 sayfa düzeni örneği</small></span><b>→</b></button>
                    </div>
                    <div className="wf-panel wf-completion-panel"><h2>Görev görünümü</h2><div className="wf-progress-ring"><div><strong>68%</strong><small>örnek ilerleme</small></div></div><div className="wf-progress-legend"><span><i className="done" />Tamamlanan adımlar <b>5</b></span><span><i className="pending" />Açık adımlar <b>3</b></span></div><PrototypeNotice>Bu oran yalnızca ekranı örneklemek için gösterilir; gerçek kabul/kalite puanı değildir.</PrototypeNotice></div>
                  </div>
                  <div className="wf-summary-grid">
                    <button className="wf-summary-card" type="button" onClick={() => setWorkspaceTab("assignment")}><span>Görevlendirme</span><strong>Alan kontrolü</strong><small>2 alan teyit bekliyor →</small></button>
                    <button className="wf-summary-card" type="button" onClick={() => setWorkspaceTab("materials")}><span>Materyaller</span><strong>3 kayıt</strong><small>Beklenen / teslim alınan →</small></button>
                    <button className="wf-summary-card" type="button" onClick={() => setWorkspaceTab("audio")}><span>Ses ve transkript</span><strong>7 kontrol işareti</strong><small>Öncelikli kuyruğu aç →</small></button>
                    <button className="wf-summary-card" type="button" onClick={() => setWorkspaceTab("report")}><span>Tek rapor</span><strong>İmzasız taslak</strong><small>Sayfaları gözden geçir →</small></button>
                  </div>
                </>
              )}

              {workspaceTab === "assignment" && (
                <div className="wf-two-column">
                  <section className="wf-panel">
                    <div className="wf-panel-heading"><div><h2>Görevlendirme bilgileri</h2><p>Belgeden çıkarılan alanlar kaynakla birlikte gösterilir.</p></div><StatusPill tone="amber">Örnek çıkarım</StatusPill></div>
                    <div className="wf-detail-list"><div><span>Görevlendiren merci</span><strong>Örnek Ceza Mahkemesi</strong><small>Kaynak: örnek-gorevlendirme-demo.pdf · sayfa 1</small></div><div><span>Dosya referansı</span><strong>DEMO-2026-014</strong><small>Kaynak: üst başlık · sentetik veri</small></div><div><span>Görevlendirme tarihi</span><strong>10.11.2026</strong><small>Kaynak: örnek belge · alan doğrulaması bekler</small></div><div><span>İnceleme kapsamı</span><strong>Ses kayıtlarının yazıya aktarılması ve zaman ilişkilerinin incelenmesi</strong><small>Kaynak: görev konusu bölümü</small></div></div>
                    <div className="wf-panel-subhead"><h3>Görevlendirmedeki sorular</h3><span>2 soru</span></div>
                    <ol className="wf-ordered-questions"><li>Sunulan kayıtların konuşma içeriğini zaman damgalarıyla yazıya aktarınız.</li><li>Kayıtta birden fazla konuşmacı duyuluyorsa kayıt içi etiketlerle belirtiniz.</li></ol>
                    <PrototypeNotice>Bu alanlar sentetik örnektir. Gerçek OCR, çıkarım, sayfa koordinatı ve kaynak izleme yapılmamaktadır.</PrototypeNotice>
                  </section>
                  <section className="wf-panel">
                    <div className="wf-panel-heading"><div><h2>Uzman doğrulaması</h2><p>Belirsiz veya çelişkili alanlar burada ele alınır.</p></div></div>
                    <div className="wf-verification-row"><span>Merci bilgisi</span><StatusPill tone="green">Örnek doğrulandı</StatusPill></div>
                    <div className="wf-verification-row"><span>Dosya referansı</span><StatusPill tone="amber">Kontrol gerekli</StatusPill></div>
                    <div className="wf-verification-row"><span>Görevlendirme tarihi</span><StatusPill tone="amber">Kontrol gerekli</StatusPill></div>
                    <div className="wf-verification-row"><span>İstenen materyaller</span><StatusPill tone="blue">3 kalem bekleniyor</StatusPill></div>
                    <button className="wf-secondary wf-full-button" type="button" onClick={() => setNotice("Bu tasarım prototipinde alan doğrulaması kaydedilmedi; gerçek görev verisi değiştirilmedi.")}>Örnek doğrulama durumunu görüntüle</button>
                  </section>
                </div>
              )}

              {workspaceTab === "materials" && (
                <section className="wf-panel">
                  <div className="wf-panel-heading"><div><h2>Materyal envanteri</h2><p>Beklenen materyaller ve teslim alınan dosyalar ayrı izlenir.</p></div><button className="wf-secondary" type="button" onClick={() => setNotice("Materyal ekleme paneli prototipte görsel olarak tasarlanmıştır; dosya yükleme kapalıdır.")}>＋ Materyal ekle</button></div>
                  <div className="wf-material-summary"><div><span>Beklenen materyal</span><strong>4</strong></div><div><span>Teslim alınan</span><strong>3</strong></div><div><span>Eksik / beklenen</span><strong>1</strong></div></div>
                  <div className="wf-material-list">
                    <div className="wf-material-row"><span className="wf-file-icon audio">♫</span><div><strong>Kayit_A_demo.wav</strong><small>Ses kaydı · 18,4 MB · 00:18:42</small></div><StatusPill tone="green">Teslim alındı</StatusPill><span className="wf-material-hash">SHA-256 örneği</span></div>
                    <div className="wf-material-row"><span className="wf-file-icon audio">♫</span><div><strong>Kayit_B_demo.m4a</strong><small>Ses kaydı · 6,2 MB · 00:07:16</small></div><StatusPill tone="green">Teslim alındı</StatusPill><span className="wf-material-hash">SHA-256 örneği</span></div>
                    <div className="wf-material-row"><span className="wf-file-icon doc">▤</span><div><strong>ornek-gorevlendirme-demo.pdf</strong><small>Görevlendirme belgesi · 2 sayfa</small></div><StatusPill tone="green">Teslim alındı</StatusPill><span className="wf-material-hash">Kaynak belge</span></div>
                    <div className="wf-material-row is-missing"><span className="wf-file-icon doc">▤</span><div><strong>Ek-1 · Beklenen ses kaydı</strong><small>Görevlendirme belgesinde tarif edilmiş</small></div><StatusPill tone="amber">Bekleniyor</StatusPill><span className="wf-material-hash">Henüz alınmadı</span></div>
                  </div>
                  <PrototypeNotice>Dosya içeriği veya hash hesaplanmaz. Hash göstergeleri yalnızca ekran yerleşimini anlatan sentetik etiketlerdir.</PrototypeNotice>
                </section>
              )}

              {workspaceTab === "audio" && (
                <>
                  <div className="wf-audio-heading"><div><h2>Ses inceleme tezgâhı</h2><p>Kayıtların tamamı ve tam transkript tek çalışma alanında.</p></div><div className="wf-audio-filters"><button className="active" type="button">Öncelikli kontrol <b>7</b></button><button type="button" onClick={() => setNotice("Tüm segmentler görünümündesiniz; öncelik filtresi örnek tasarım durumudur.")}>Tüm segmentler</button><button type="button" onClick={() => setNotice("Kontrol edilmiş segmentler filtresi örnek prototipte görsel olarak sunulmuştur.")}>Kontrol edilen</button></div></div>
                  <div className="wf-audio-layout">
                    <section className="wf-panel wf-recording-panel">
                      <div className="wf-panel-heading compact"><div><h2>Kayıtlar</h2><p>3 materyal</p></div><span className="wf-small-counter">03</span></div>
                      {recordings.map((record) => <button type="button" key={record.id} className={"wf-recording-item" + (selectedRecording === record.id ? " selected" : "")} onClick={() => setSelectedRecording(record.id)}><span className="wf-recording-icon">♫</span><span><strong>{record.name}</strong><small>{record.duration} · {record.size}</small><em>{record.status}</em></span></button>)}
                      <div className="wf-recording-footer">Kuyruk dışındaki kayıtlar da her zaman erişilebilir.</div>
                    </section>
                    <section className="wf-panel wf-transcript-panel">
                      <div className="wf-panel-heading compact"><div><h2>{activeRecording.name}</h2><p>{activeRecording.duration} · Sentetik kayıt bilgisi</p></div><StatusPill tone="amber">Demo oynatıcı</StatusPill></div>
                      <div className="wf-player">
                        <button type="button" className="wf-player-button" disabled aria-label="Ses oynat">▶</button>
                        <div className="wf-player-track"><div className="wf-player-progress" /><div className="wf-waveform">{waveformBars.map((height, index) => <i key={index} style={{ height: height + "%" }} />)}</div><div className="wf-player-marker" /></div>
                        <span className="wf-player-time">00:00 / {activeRecording.duration}</span>
                      </div>
                      <div className="wf-player-tools"><span>Oynatma hızı <b>1.0×</b></span><span>Seçili aralık <b>00:12–00:18</b></span><span>Orijinal kayıt <b>Değiştirilemez</b></span></div>
                      <div className="wf-transcript-toolbar"><div><h3>Tam transkript</h3><span>5 örnek segment · tüm metne erişim</span></div><input aria-label="Transkriptte ara" placeholder="Metinde ara…" /></div>
                      <div className="wf-segment-list">
                        {transcriptSegments.map((segment) => <button type="button" key={segment.id} className={"wf-segment" + (selectedSegment === segment.id ? " selected" : "")} onClick={() => { setSelectedSegment(segment.id); setTranscriptDraft(segment.text); }}><div className="wf-segment-meta"><b>{segment.time}</b><span>{segment.speaker}</span><em className={segment.priority === "Öncelikli kontrol" ? "high" : segment.priority === "Normal" ? "normal" : "medium"}>{segment.priority}</em></div><p>{segment.id === selectedSegment ? transcriptDraft : segment.text}</p><small>{segment.flag}</small></button>)}
                      </div>
                      <div className="wf-inline-callout wf-confidence"><strong>Kontrol önceliği, doğruluk yüzdesi değildir.</strong><span>İşaretler yalnızca uzmanın nereden başlamasının yararlı olabileceğini gösterir; kelimeyi doğrulamaz.</span></div>
                    </section>
                    <aside className="wf-panel wf-tools-panel">
                      <div className="wf-panel-heading compact"><div><h2>Dinleme araçları</h2><p>Orijinal kayda dokunulmaz.</p></div></div>
                      <div className="wf-tool-choice"><span>Dinleme kaynağı</span><label><input type="radio" name="audio-source" defaultChecked /> Orijinal</label><label><input type="radio" name="audio-source" disabled /> İşlenmiş kopya <em>Hazır değil</em></label></div>
                      <div className="wf-tool-block"><strong>Ses araçları</strong><button type="button" disabled>Gürültü azaltma <small>Sonraki aşama</small></button><button type="button" disabled>Kanal seçimi <small>Sonraki aşama</small></button><button type="button" disabled>Spektrogram <small>Test edilmedi</small></button></div>
                      <div className="wf-tool-block"><strong>Düzenleme</strong><button type="button" disabled>Seçili aralığı tekrar dinle</button><button type="button" disabled>A–B döngüsü</button><button type="button" disabled>Konuşmacı gruplama <small>İsteğe bağlı</small></button></div>
                      <PrototypeNotice>Oynatma, dalga biçimi üzerinde gezinme ve ses işleme bu görsel prototipte gerçek ses üretmez.</PrototypeNotice>
                    </aside>
                  </div>
                  <section className="wf-panel wf-edit-panel">
                    <div className="wf-panel-heading"><div><h2>Uzman metin düzeltmesi</h2><p>{activeSegment.time} · {activeSegment.speaker} · {activeSegment.flag}</p></div><StatusPill tone="amber">Taslak düzeltme</StatusPill></div>
                    <textarea value={transcriptDraft} onChange={(event) => setTranscriptDraft(event.currentTarget.value)} rows={3} aria-label="Seçili segment metni" />
                    <div className="wf-edit-footer"><span>Ham ASR metni ve uzman değişiklik geçmişi ayrı tutulur.</span><button type="button" className="wf-secondary" onClick={() => { setTranscriptDraft(activeSegment.text); setNotice("Örnek metin, sentetik başlangıç durumuna döndürüldü."); }}>Örnek metni geri yükle</button></div>
                  </section>
                </>
              )}

              {workspaceTab === "questions" && (
                <div className="wf-two-column">
                  <section className="wf-panel">
                    <div className="wf-panel-heading"><div><h2>Görevlendirme soruları</h2><p>Belgedeki sıra korunur; her yanıt dayanağıyla ilişkilendirilir.</p></div><StatusPill tone="amber">2 yanıt alanı</StatusPill></div>
                    <div className="wf-question-card active"><span className="wf-question-index">SORU 01</span><h3>Sunulan kayıtların konuşma içeriğini zaman damgalarıyla yazıya aktarınız.</h3><span className="wf-question-state">Uzman yanıtı taslağı</span><textarea value={questionAnswer} onChange={(event) => setQuestionAnswer(event.currentTarget.value)} rows={6} aria-label="Birinci soru için örnek yanıt" /><div className="wf-evidence-box"><div><strong>Yanıt dayanakları</strong><small>Transkript segmentiyle bağlantı</small></div>{supportLinked ? <div className="wf-evidence-item"><span>♫</span><b>Kayit_A_demo.wav · 00:00:12.4</b><em>Konuşmacı A · örnek segment</em><button type="button" onClick={() => setSupportLinked(false)}>Kaldır</button></div> : <button type="button" className="wf-secondary" onClick={() => setSupportLinked(true)}>＋ Örnek dayanak bağla</button>}</div></div>
                    <div className="wf-question-card"><span className="wf-question-index">SORU 02</span><h3>Kayıtta birden fazla konuşmacı duyuluyorsa kayıt içi etiketlerle belirtiniz.</h3><div className="wf-answer-placeholder">Yanıt bekliyor <span>Henüz uzman görüşü girilmedi</span></div></div>
                  </section>
                  <section className="wf-panel"><div className="wf-panel-heading"><div><h2>Bulgular ve kaynak izi</h2><p>Dayanak yalnız ilgili görev materyali içinden seçilir.</p></div></div>
                    <div className="wf-finding-row"><span>01</span><div><strong>Örnek bulgu kaydı</strong><p>00:00:12.4 zamanında Konuşmacı A etiketiyle örnek metin segmenti.</p><small>Kaynak: Kayit_A_demo.wav · sentetik</small></div></div>
                    <div className="wf-finding-row"><span>02</span><div><strong>İkinci bulgu alanı</strong><p>Uzman incelemesi sonrasında doldurulacak alan.</p><small>Kaynak bağlantısı bekleniyor</small></div></div>
                    <PrototypeNotice>Konuşmacı etiketleri kayıt içi anonim ayrımdır; gerçek kişi kimliği tespit edildiği anlamına gelmez.</PrototypeNotice>
                  </section>
                </div>
              )}

              {workspaceTab === "report" && (
                <div className="wf-report-layout">
                  <section className="wf-panel wf-report-controls"><div className="wf-panel-heading"><div><h2>Rapor kontrolü</h2><p>Görev başına tek ana rapor ve ilgili ekler.</p></div><StatusPill tone="amber">İmzasız taslak</StatusPill></div>
                    <div className="wf-report-meta"><span>Şablon referansı</span><strong>Merci türüne göre örnek iskelet</strong><small>Tek ve evrensel zorunlu şablon iddiası yoktur.</small></div>
                    <div className="wf-panel-subhead"><h3>Kalite kontrolü</h3><span>Örnek durum</span></div>
                    {["Görevlendirme kapsamı", "Tüm sorulara yanıt", "Yanıt-dayanak bağlantısı", "Transkript uzman kontrolü", "Kaynak envanteri", "Tüm A4 sayfalarının incelenmesi"].map((item, index) => <div className="wf-qa-row" key={item}><span className={index < 3 ? "check-done" : "check-pending"}>{index < 3 ? "✓" : "!"}</span><div><strong>{item}</strong><small>{index < 3 ? "Örnek veri mevcut" : "Uzman kontrolü bekliyor"}</small></div></div>)}
                    <div className="wf-final-warning"><strong>Nihai insan onayı verilmedi</strong><p>Bu görünüm imza, UYAP teslimi veya resmî rapor çıktısı değildir.</p></div>
                    <button type="button" className="wf-secondary wf-full-button" disabled>DOCX / ODT dışa aktar · prototipte kapalı</button>
                  </section>
                  <section className="wf-paper-stage">
                    <div className="wf-paper-toolbar"><span>A4 ÖNİZLEME · SAYFA {reportPage} / 2</span><div><button type="button" disabled>−</button><button type="button" disabled>100%</button><button type="button" disabled>＋</button></div></div>
                    <article className="wf-paper">
                      <div className="wf-paper-watermark">ÖRNEK TASLAK</div>
                      <div className="wf-paper-topline">MİHENK · 56.12 SES İNCELEME</div>
                      {reportPage === 1 ? <>
                        <h2>BİLİRKİŞİ RAPORU</h2><p className="wf-paper-subtitle">ÇALIŞMA TASLAĞI · İMZASIZ</p>
                        <h3>1. GÖREVLENDİRME VE KAPSAM</h3><p>Örnek Ceza Mahkemesinin DEMO-2026-014 referanslı görevlendirmesi kapsamında, örnek ses materyallerinin yazıya aktarılması ve zaman ilişkilerinin incelenmesi tasarlanmıştır.</p>
                        <h3>2. İNCELENEN MATERYALLER</h3><p>Kayit_A_demo.wav — 00:18:42<br />Kayit_B_demo.m4a — 00:07:16<br />Örnek görevlendirme belgesi — 2 sayfa</p>
                        <h3>3. YÖNTEM VE TEKNİK DAYANAK</h3><p>Bu bölüm, gerçek uygulamada kullanılan motor/model sürümü, işlem parametreleri ve uzman inceleme kayıtları doğrulandıktan sonra oluşturulacaktır.</p>
                        <h3>4. BULGULAR</h3><p>Bu örnek sayfa yalnız yerleşimi gösterir. Gerçek ses içeriği, duyulmayan kelime veya bilirkişi kanaati prototip tarafından üretilmez.</p>
                      </> : <>
                        <h3>5. GÖREVLENDİRME SORULARINA YANITLAR</h3><p><b>Soru 1.</b> Sunulan kayıtların konuşma içeriğini zaman damgalarıyla yazıya aktarınız.</p><p>Yanıt: Uzman kontrolü ve kaynak bağlantıları tamamlandıktan sonra doldurulacaktır.</p><p><b>Soru 2.</b> Kayıtta birden fazla konuşmacı duyuluyorsa kayıt içi etiketlerle belirtiniz.</p><p>Yanıt: Kayıt içi anonim konuşmacı etiketleri kullanılabilir; kişi kimliği çıkarımı yapılmaz.</p><h3>6. SONUÇ VE EKLER</h3><p>Sonuç bölümü uzman kanaati için boş bırakılmıştır. Tam transkript, teknik döküm ve ilgili kayıtlar görevlendirme kapsamına göre rapor eklerinde sunulur.</p><div className="wf-paper-signature">Tarih: —————————<br /><br />Bilirkişi imza alanı<br /><small>İMZA YOK · TASLAK</small></div>
                      </>}
                      <div className="wf-paper-footer"><span>DEMO-2026-014 · SENTETİK ÖRNEK</span><span>{reportPage}</span></div>
                    </article>
                    <div className="wf-paper-pagination"><button type="button" disabled={reportPage === 1} onClick={() => setReportPage(1)}>← Önceki</button><span>Sayfa {reportPage} / 2</span><button type="button" disabled={reportPage === 2} onClick={() => setReportPage(2)}>Sonraki →</button></div>
                  </section>
                </div>
              )}
            </>
          )}

          {screen === "profile" && (
            <>
              <section className="wf-page-heading"><div><div className="wf-eyebrow">KİŞİSEL BİLGİLER</div><h1>Bilirkişi Profilim</h1><p>Meslekî uzmanlık alanlarınız ve yetkinlik bilgileriniz yazılım modüllerinden ayrıdır.</p></div><button className="wf-secondary" type="button" onClick={() => setProfileEditing((value) => !value)}>{profileEditing ? "Düzenlemeyi kapat" : "Profili düzenle"}</button></section>
              <div className="wf-profile-layout"><section className="wf-panel"><div className="wf-profile-avatar">B</div><h2>Örnek Bilirkişi Profili</h2><p className="wf-muted">Sentetik profil · kişisel veri içermez</p><div className="wf-detail-list"><div><span>Meslek</span><strong>Adli bilişim uzmanı · örnek</strong></div><div><span>Uzmanlık sicili</span><strong>DEMO-SİCİL-0000</strong></div><div><span>Çalışma dili</span><strong>Türkçe</strong></div></div>{profileEditing && <div className="wf-inline-callout"><strong>Profil düzenleme görünümü</strong><span>Bu prototipte profil kaydı yapılmaz; gerçek profil verisi mevcut uygulamada korunur.</span></div>}</section>
                <section className="wf-panel"><div className="wf-panel-heading"><div><h2>Uzmanlık Alanlarım</h2><p>Meslekî yetkinlik ve çalışma kapsamı.</p></div></div><div className="wf-expertise-card"><span>01</span><div><strong>Ses kayıtlarının incelenmesi</strong><small>Örnek uzmanlık alanı · doğrulama gerekir</small></div><StatusPill tone="blue">Profil alanı</StatusPill></div><div className="wf-expertise-card"><span>02</span><div><strong>Dijital materyal incelemesi</strong><small>Örnek uzmanlık alanı · doğrulama gerekir</small></div><StatusPill tone="blue">Profil alanı</StatusPill></div><PrototypeNotice>Uzmanlık alanı, MİHENK modülünün kurulu veya kabul edilmiş olduğu anlamına gelmez.</PrototypeNotice></section></div>
            </>
          )}

          {screen === "modules" && (
            <>
              <section className="wf-page-heading"><div><div className="wf-eyebrow">MODÜL KATALOĞU</div><h1>Uzmanlık Modülleri</h1><p>MİHENK'in sunduğu iş akışları. Modüller, kişisel uzmanlık profilinden ayrı yönetilir.</p></div></section>
              <section className="wf-panel"><div className="wf-panel-heading"><div><h2>Aktif modül</h2><p>İlk çalışma alanı</p></div><StatusPill tone="green">Prototipte görüntüleniyor</StatusPill></div><button type="button" className="wf-module-card" onClick={() => openTask("demo-014")}><span className="wf-module-icon">◖</span><span className="wf-module-main"><strong>56.12 · Ses Kayıtlarının Metne Dönüştürülmesi</strong><small>Görevlendirme, materyal envanteri, ses inceleme, transkript ve tek rapor.</small><em>Modülü aç →</em></span><StatusPill tone="blue">Tasarım v0.5</StatusPill></button><div className="wf-module-card disabled"><span className="wf-module-icon muted">◇</span><span className="wf-module-main"><strong>Diğer uzmanlık modülleri</strong><small>Bağımsız modül kapsamı ve kabul kriterleri tanımlandıkça eklenecek.</small><em>Henüz katalogda değil</em></span></div></section>
              <div className="wf-inline-callout wf-module-engine-callout"><strong>Motor ve model ayarı nerede?</strong><span>56.12 modülü → Motorlar ve Modeller. Görev açarken motor seçilmez; doğrulanmış etkin yerel profil otomatik uygulanır.</span><button type="button" onClick={() => navigate("engines")}>Motorlar ve Modelleri aç →</button></div>
            </>
          )}

          {screen === "engines" && (
            <>
              <section className="wf-page-heading"><div><div className="wf-eyebrow">UZMANLIK MODÜLLERİ / 56.12</div><h1>Motorlar ve Modeller</h1><p>Yerel ASR ve yardımcı bileşenlerin kurulum, sürüm, lisans ve test durumu.</p></div><StatusPill tone="amber">Pilot profili doğrulanmadı</StatusPill></section>
              <PrototypeNotice>Görev başına motor seçimi yoktur. Bu ekran altyapı yönetimi içindir; motor/model ancak karşılaştırmalı test ve kabul sonrasında etkinleştirilebilir.</PrototypeNotice>
              <div className="wf-engine-summary"><div><span>Etkin pilot profili</span><strong>Henüz doğrulanmadı</strong><small>Görevlerde otomatik uygulanacak profil bulunmuyor.</small></div><div><span>Yerel çalışma modu</span><strong>Çevrimdışı hedef</strong><small>Model kurulumundan sonra ağsız işleme tasarımı.</small></div><div><span>Karşılaştırmalı test</span><strong>Bekliyor</strong><small>WER/CER ve kritik hata incelemesi gerekir.</small></div></div>
              <section className="wf-panel"><div className="wf-panel-heading"><div><h2>Aday motorlar</h2><p>Aday olmak, pilot için onaylanmış olmak değildir.</p></div></div><div className="wf-engine-row"><div className="wf-engine-mark">S</div><div className="wf-engine-info"><strong>SEDA · Yerel ASR adayı</strong><small>Mevcut prototipte entegrasyon bulunur; benchmark ve uzman kabulü ayrı gereklidir.</small><div className="wf-engine-tags"><span>Yerel</span><span>Türkçe odaklı</span><span>Test bekliyor</span></div></div><StatusPill tone="amber">Aday · etkin değil</StatusPill></div><div className="wf-engine-row"><div className="wf-engine-mark">W</div><div className="wf-engine-info"><strong>Whisper ailesi · Karşılaştırma adayı</strong><small>Sürüm, lisans, donanım ve performans testleri tamamlanmadan etkinleştirilmez.</small><div className="wf-engine-tags"><span>Aday</span><span>Lisans incelemesi</span><span>Benchmark bekliyor</span></div></div><StatusPill tone="neutral">İnceleme kuyruğu</StatusPill></div></section>
              <section className="wf-panel"><div className="wf-panel-heading"><div><h2>Yardımcı bileşenler</h2><p>Nihai kelime kaynağı ASR çıktısı ve uzman kontrolüdür.</p></div></div><div className="wf-aux-grid"><div><strong>VAD</strong><span>Konuşma / sessizlik tespiti</span><StatusPill tone="amber">Test gerekli</StatusPill></div><div><strong>Konuşmacı gruplama</strong><span>Anonim A/B etiketleri</span><StatusPill tone="neutral">İsteğe bağlı</StatusPill></div><div><strong>Noktalama</strong><span>Sınırlı metin biçimlendirme</span><StatusPill tone="neutral">İsteğe bağlı</StatusPill></div><div><strong>LLM / serbest metin</strong><span>Transkripsiyon kelime kaynağı değildir</span><StatusPill tone="blue">Varsayılan dışı</StatusPill></div></div></section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
