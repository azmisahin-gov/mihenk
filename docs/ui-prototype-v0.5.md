# MİHENK v0.5 — yüksek doğruluklu arayüz inceleme prototipi

> **Amaç:** Proje sahibinin kabul ettiği [Wireframe v0.5](https://github.com/azmisahin-gov/mihenk-arge/blob/main/docs/02-urun/56-12-wireframe-v0.5.md) tasarımını, masaüstü uygulamasında gerçek ürüne yakın görsel hiyerarşi ve gezilebilir çalışma akışlarıyla incelemek.
>
> **Önemli sınır:** Bu paket üretim sürümü, pilot kabulü, bilirkişi raporu üreticisi veya UYAP uyumluluk kanıtı değildir. Yalnızca sentetik örnek içerir. Gerçek dava, kişi, belge, ses veya transkript verisi kullanmayın.

## Tasarım kapsamı

Yeni inceleme arayüzü `src/prototype/MihenkStudio.tsx` ve `src/prototype/studio.css` dosyalarındadır. Var olan `WireframePrototype.tsx` ilk taslak referansı olarak korunur. Prototip, yalnızca `VITE_UI_PROTOTYPE=true` ile açılır; normal başlangıçta mevcut uygulama (`App`) çalışmaya devam eder.

### Ana gezinme ve ekranlar

| Wireframe alanı | İnceleme prototipindeki ekran | Görsel/etkileşim kapsamı |
|---|---|---|
| Ana menü / Genel Bakış | Genel Bakış | İş öncelikleri, açık görevler, teslim tarihleri, görev ilerlemesi ve işlem geçmişi |
| Görevlerim | Görevlerim | Arama, durum filtreleri, görev tablosu, ilerleme ve göreve geçiş |
| Yeni görevlendirme | Yeni görevlendirme | Sabit sihirbaz değil; belge kabulü, otomatik çıkarım örneği, kaynak sayfası, istisna teyidi, beklenen materyaller ve taslak görev alanı |
| Görev çalışma alanı | Görev Özeti | Sonraki işler, ilerleme, materyal görünümü ve altı görev sekmesi |
| Görevlendirme | Görevlendirme | Kaynak belgeye bağlı alanlar, kapsam ve teyit bekleyen istisnalar |
| Materyaller | Materyaller | Beklenen/teslim alınan ayrımı, çoklu kayıt envanteri, teknik metadata ve bütünlük alanı |
| Ana ses inceleme tezgâhı | Ses ve Transkript | Kayıt listesi, kontrol sırası, dalga biçimi, oynatıcı kontrol görünümü, tam transkript, uzman metin düzeltmesi, kontrol nedenleri, orijinal/işlenmiş kopya, kanal, A–B ve spektrogram kontrolleri |
| Sorular ve Bulgular | Sorular ve Bulgular | Görevlendirme sıralı sorular, yanıt alanları, kaynak dayanağı, bulgu ve kayıt bağlantıları |
| Tek rapor / A4 | Tek Rapor | Bölüm ağacı, iki sayfalı A4 önizleme, kalite kontrol listesi, engeller ve revizyon geçmişi |
| Profil ≠ modül | Bilirkişi Profilim | Meslekî uzmanlık, sicil, yetkinlik ve belge alanları |
| Modül kataloğu | Uzmanlık Modülleri | 56.12 modül özeti ve modül alt alanlarına geçiş |
| Motorlar ve Modeller | Motorlar ve Modeller | Aday motorlar, etkin profil yok durumu, benchmark ve kabul kapıları |
| Ses Araçları | Ses Araçları | Dinleme, kanal seçimi, gürültü azaltma, spektrogram, işlenmiş kopya ve işlem geçmişi tasarımı |
| Dil ve Metin | Dil ve Metin | VAD, anonim konuşmacı gruplama, noktalama ve serbest LLM sınırı |
| Test geçmişi | Test Geçmişi | Veri seti, WER/CER, kritik hata, donanım, lisans ve uzman kabul kapıları |
| Kasa ve Güvenlik | Kasa ve Güvenlik | Yerel kasa, güvenlik yapılandırması ve denetim izi görünümü |
| Uygulama ayarları | Uygulama Ayarları | Görünüm, erişilebilirlik ve yerel çalışma tercihleri |

## Deneyim ve görsel tasarım kararları

- Sol menü, wireframe'deki ana hiyerarşiyi korur; daraltma aynı hedefleri aynı sırada bırakır.
- Açık zemin, koyu yeşil gezinme alanı, sınırlı durum renkleri, tutarlı kart/alan/başlık hiyerarşisi ve daha geniş çalışma boşlukları kullanılır.
- Ses ekranı üç çalışma sütununa ayrılır: kayıt kuyruğu, ses + tam transkript ve dinleme/teknik araçlar.
- Kontrol önceliği, doğruluk yüzdesi olarak sunulmaz. Her işaretin nedeni açıklanır ve tüm kayıt/segmentlere erişim korunur.
- Segment düzeltmesi, soru yanıtı ve rapor kontrol listesi prototip ekranında etkileşimlidir; gerçek kasaya yazılmaz.
- Rapor görünümü A4 oranını ve sayfa akışını örnekler; gerçek DOCX/ODT çıktısı veya UYAP Editör uyumluluğu üretmez.
- Dar masaüstü/tablet ve mobil genişliklerde menü, tablolar, üç sütunlu ses ekranı ve rapor önizlemesi yeniden akışa girer. Gerçek cihaz görsel kabulü ayrıca yapılmalıdır.
- Tipografi sistem fontlarına dayanır; prototip uzaktan font veya görsel varlık indirmeye ihtiyaç duymaz.

## Etkileşim sınırı — çalışan demo / gerçek işlev ayrımı

**Prototip içinde çalışan görsel davranışlar:** ana menü ve sekme geçişleri, görev araması ve filtreleri, sentetik görev açma, örnek belge kartını gösterme/gizleme, segment seçimi ve örnek metin düzenlemesi, kontrol edildi işaretleme, oynatıcı kontrollerinin görsel durumu, hız/A–B/kanal/işlenmiş kopya/spektrogram görünümlerinin değiştirilmesi, soru yanıt taslağı ve dayanak işaretleri, rapor sayfası seçimi, kalite kontrol kutuları ve yerel demo menü tercihi.

**Gerçekleştirilmeyen üretim işlemleri:** dosya içeriğinin yüklenmesi veya okunması, OCR, gerçek ASR, ses oynatma/işleme, gürültü azaltma, kanal ayırma, VAD, diarization, model kurulumu, benchmark, Stronghold kasa kaydı, dosya hash hesaplama, gerçek revizyon/audit persistence, DOCX/ODT üretimi, elektronik imza, UYAP aktarımı veya gönderimi.

Görsel prototipte bir araç kontrolünün etkileşimli olması, ilgili ses/belge/AI işleminin gerçekten çalıştığı anlamına gelmez. Gerçek işlem gerektiren düğmeler ya yalnız görsel durumu değiştirir ya da açıkça devre dışıdır; kullanıcıya sahte bir başarı sonucu gösterilmez.

## Çalıştırma

Gerekli Node sürümü proje `package.json` içinde tanımlıdır.

**Windows PowerShell**
```powershell
$env:VITE_UI_PROTOTYPE="true"
npm run dev
```

**macOS / Linux**
```bash
VITE_UI_PROTOTYPE=true npm run dev
```

Normal uygulamayı başlatmak için `VITE_UI_PROTOTYPE` değişkenini tanımlamayın veya `false` yapın.

## Görsel kabul kontrolü

Aşağıdaki inceleme yerel/kurulu uygulamada proje sahibi tarafından tamamlanmalıdır. CI derlemesi tek başına görsel kabul değildir.

- [ ] Geniş ve dar ana menüde aynı gezinme hedefleri ve aktif durum
- [ ] Genel Bakış → Görevlerim → Yeni görevlendirme → görev alanına dönüş
- [ ] Görevlendirme belgesi, kaynağa bağlı alanlar ve beklenen/teslim alınan materyal farkı
- [ ] Görev içi altı sekme ve görevler listesine kesintisiz dönüş
- [ ] Ses tezgâhında beş kayıt, filtreler, tam metin, zaman seçimi, düzeltme ve kontrol nedeni
- [ ] Orijinal/işlenmiş kopya ayrımı ve görsel araçların gerçek ses işlemi yapmadığının anlaşılması
- [ ] Soruların sırası, yanıt alanları ve kaynak dayanakları
- [ ] Tek rapor A4 sayfaları, kalite kontrolü, revizyon izi ve UYAP iddiası bulunmaması
- [ ] Profil, modül, motor, ses araçları ve dil yardımcıları hiyerarşisi
- [ ] Kasa/güvenlik ve uygulama ayarları ekranları
- [ ] Dar pencere, kaydırma alanları, Türkçe karakterler, okunabilirlik ve odak görünümü

## Paket ve yayın sınırı

- Bu çalışma PR #46 taslağında kalır; `main` dalına birleştirilmez.
- Deneme paketleri yalnız PR'a bağlı GitHub Actions artifact'larıdır; GitHub Release veya updater paketi değildir.
- Mevcut `preview` etiketi ve genel kullanıcı yayını değiştirilmez.
- Görsel kabulden sonra gerçek işlevlerin entegrasyonu ayrı iş kalemleri ve test kapılarıyla yürütülür.
