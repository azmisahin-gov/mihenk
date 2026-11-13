# MİHENK — Masaüstü Uygulaması

> **Durum:** 56.12 ses çalışma alanı prototipi  
> **Sürüm:** 0.1.0  
> **Kullanım:** Geliştirme ve sentetik/açık test verisi

MİHENK, bilirkişilerin görevlerini tek bir yerel çalışma alanında yürütebilmesi için sıfırdan geliştirilen bütünleşik masaüstü uygulamasıdır.

Ürün keşfi, gereksinimler, mevzuat araştırması ve karar kayıtları [mihenk-arge](https://github.com/azmisahin-gov/mihenk-arge) deposunda tutulur. Bu depo yalnız uygulama kaynak kodunu, testlerini ve derleme/yayın süreçlerini içerir.

## Bu prototipte

- Birden fazla ses dosyasını belleğe alma ve listeleme.
- HTML5 destekli yerel ses oynatma.
- Oynatma konumunda zaman kodlu transkript bölümü ekleme.
- Metin, başlangıç/bitiş zamanı, nötr konuşmacı etiketi ve kontrol durumunu elle düzenleme.
- İşaretlenmiş bir transkript aralığını tekrar tekrar dinleme.
- Space oynat/duraklat, sol/sağ ok 5 saniye sarma, Ctrl/⌘ + Enter bölüm ekleme kısayolları.
- Düzenlenmiş taslağı TXT veya JSON olarak kullanıcının cihazına dışa aktarma.
- Küçük dosyalarda tarayıcı içi SHA-256 ön kontrolü.

**Henüz bağlı olmayanlar:** ASR motoru, kalıcı görev/veri deposunun tam iş akışı, kasa parolası kurtarma ve şifreli yedek/geri yükleme, uzun dosyalarda akışlı hash, gerçek görev/rapor modeli ve UYAP/UDF entegrasyonu.

## Güvenli kullanım sınırı

Yerel kasa önizlemesi, içe alınan sesleri cihazdaki Stronghold snapshot ve AES-256-GCM şifreli blok dosyalarında saklar. Kasa parolası olmadan yerel kayıtlar açılamaz. Bu ilk dilimde dosya başına 128 MiB sınırı vardır; dinleme sırasında kayıt bellekte açılır. Şifreli .mihenkbackup yedeği Stronghold snapshot, Argon2 salt ve şifreli materyalleri birlikte taşır; geri yükleme yalnızca boş kasaya yapılır. Kasa parolası kurtarma veya parola sıfırlama yoktur. Harici servise ses göndermez ve otomatik transkripsiyon yapmaz.

SHA-256 göstergesi yalnızca küçük dosyalardaki seçilmiş dosyanın ön kontrolüdür. Delil zinciri, teslim öncesi köken doğrulaması veya dosyanın özgünlüğü hakkında kanıt sayılmaz. 128 MiB üzerindeki dosyalarda bu prototip hash üretmez.

**Gerçek dava/soruşturma materyalini bu önizlemede kullanmayın.** Gerçek materyalle kullanım için kasa parolası kurtarma, şifreli yedekleme/geri yükleme, görev yalıtımı, tam arayüz testleri, güvenlik incelemesi ve hukuk/veri koruma değerlendirmesi tamamlanmalıdır.

## Geliştirme

Gerekenler:
- Node.js 22.12 veya üzeri
- Rust stable 1.90 veya üzeri
- İşletim sistemine göre Tauri masaüstü ön koşulları

Komutlar:

```bash
npm ci
npm run tauri:dev
```

Ön yüz denetimi ve derlemesi:

```bash
npm test
npm run check
npm run build
```

### Linux / Pardus notu

Tauri geliştirme ortamı Linux'ta WebKitGTK 4.1 ve derleme bağımlılıkları gerektirir. Dağıtıma göre paket adları değişebilir; kurulumdan önce Tauri'nin güncel Linux ön koşulları izlenmelidir.

### Windows notu

Tauri geliştirme ortamında Microsoft C++ Build Tools ve WebView2 gerekir.

## Teknoloji adayı

İlk masaüstü prototip, geçici olarak Tauri 2 + React + TypeScript + Vite kullanır. Bu seçim nihai platform mimarisi değildir; hedef cihaz, Windows/Pardus paketlemesi, kaynak tüketimi, güvenlik ve bakım denemelerinden sonra tekrar değerlendirilecektir.

## Lisans

Depo herkese açık olsa da kaynak kod için henüz açık kaynak lisansı verilmemiştir. Bu nedenle açık kaynak lisansı veya yeniden kullanım izni varsayılmamalıdır. Lisans kararı ayrıca yayımlanacaktır.

## Katkı ve dil

README, issue, pull request başlık/açıklamaları ve commit mesajları Türkçe tutulur. Teknik tanımlayıcılar, standart kod isimleri ve kütüphane/API adları özgün biçimlerinde kalabilir.


## Kurulum ve otomatik güncelleme

> **Yayın durumu (13 Kasım 2026): Henüz indirilebilir kurulum paketi yayımlanmadı.** Bu PR dalında paketleme ve güncelleme iş akışları hazırlanmıştır; ancak PR henüz `main` dalına alınmamış ve GitHub Releases bölümünde bir sürüm oluşturulmamıştır. Bu nedenle aşağıdaki bağlantı ve paket biçimleri planlanan yayın hedefidir, mevcut indirme değildir.

### Planlanan kullanıcı indirmeleri

- **Windows:** NSIS kurulum dosyası (.exe) ve MSI paketi.
- **Pardus / Debian tabanlı Linux:** .deb paketi.
- **Linux:** AppImage paketi.

İlk paket yayımlandığında kararlı indirme adresi: https://github.com/azmisahin-gov/mihenk/releases/latest

Geliştirme önizlemesi ile kararlı sürüm ayrı kanallardır. Önizleme sürümü kuran kullanıcılar yalnızca önizleme kanalından güncelleme alır; kararlı sürüm kullanıcıları önizleme koduna otomatik geçirilmez.

### Otomatik güncelleme güvenliği

Yayın derlemesi Tauri imza doğrulamasını kullanacak şekilde yapılandırılmıştır. İmza doğrulanmadan güncelleme kurulmaz.

**Bir defalık imza yapılandırması 13 Kasım 2026 tarihinde tamamlandı.** `TAURI_UPDATER_PUBLIC_KEY` GitHub repository variable ve `TAURI_SIGNING_PRIVATE_KEY` GitHub Actions secret olarak ayarlandı. Özel anahtar uygulama kaynak koduna veya yayın paketlerine eklenmez.

Özel anahtarın yerel çevrimdışı kopyasını koruyun; bilgisayar hesabını ve diski şifreleyin, ayrıca güvenli çevrimdışı yedek alın. Anahtarı sohbet, issue, PR, dosya eki, commit veya log içinde paylaşmayın. Anahtar kaybolursa mevcut imza kimliğiyle güncelleme yayımlamak mümkün olmayabilir. Anahtarı yeniden üretmek veya değiştirmek mevcut kurulumların güncelleme zincirini etkileyebilir; gelişigüzel yenilemeyin.

Tauri güncelleme imzası Windows Authenticode yayıncı sertifikasının veya UYAP e-imza sertifikasının yerine geçmez.

### Yayın akışı

- `main` dalına birleştirilen değişiklikler, önizleme yayın iş akışını tetikler.
- `vX.Y.Z` biçimindeki etiket kararlı sürüm paketlerini ve güncelleme manifestini üretir.
- Yayından önce `package.json`, `src-tauri/tauri.conf.json` ve `src-tauri/Cargo.toml` sürümleri eşitlenir.
- Uygulama açılışında güncelleme kontrolü yapılır; manifest imzası doğrulandıktan sonra yeni sürüm indirilip kurulabilir. Bu uçtan uca akış henüz yayımlanmış paket üzerinden test edilmemiştir.

**Platform sınırı:** Tauri Updater Linux'ta AppImage ve Debian `.deb`, Windows'ta NSIS ve MSI paketlerini destekler. Debian güncellemesi sistem paket kurulumunu (`dpkg`) ve gerekli yönetici yetkisini isteyebilir. Windows kurulumları için Authenticode yayıncı sertifikası ayrıca gerekir; Tauri güncelleme imzası bunun yerine geçmez.

### Test ve yayın güvenliği

GitHub Actions PR aşamasında kilitli bağımlılıkları, ön yüz derlemesini ve Windows/Linux masaüstü başlatma kontrollerini yürütür. Bu kontroller kurulum paketinin yayımlandığını, otomatik güncellemenin çalıştığını veya uygulamanın bilirkişi iş akışı için hazır olduğunu kanıtlamaz. Gerçek dağıtım, kalıcı/şifreli çalışma kasası, yerel ASR ve uçtan uca kullanıcı testleri tamamlanmadan ürün hazır ilan edilmeyecektir.
