# MİHENK — Masaüstü Uygulaması

> **Durum:** 56.12 ses çalışma alanı prototipi  
> **Sürüm:** 0.1.0  
> **Kullanım:** Geliştirme ve sentetik/açık test verisi

MİHENK, bilirkişilerin görevlerini tek bir yerel çalışma alanında yürütebilmesi için sıfırdan geliştirilen bütünleşik masaüstü uygulamasıdır.

Ürün keşfi, gereksinimler, mevzuat araştırması ve karar kayıtları [mihenk-arge](https://github.com/azmisahin-gov/mihenk-arge) deposunda tutulur. Bu depo yalnız uygulama kaynak kodunu, testlerini ve derleme/yayın süreçlerini içerir.

## Bu prototipte

- Şifreli kasa içinde birden fazla yerel görev alanı oluşturma ve aralarında geçiş yapma.
- Her ses kaydını seçili görev alanına bağlama; ses kuyruğu, transkript bölümleri ve sayaçları görev bazında filtreleme.
- Eski kasalardaki görev kimliği bulunmayan sesleri, içerik ve anahtarları değiştirmeden varsayılan "Genel çalışma" alanına taşıma.
- Birden fazla ses dosyasını belleğe alma ve listeleme.
- HTML5 destekli yerel ses oynatma.
- Oynatma konumunda zaman kodlu transkript bölümü ekleme.
- Metin, başlangıç/bitiş zamanı, nötr konuşmacı etiketi ve kontrol durumunu elle düzenleme.
- İşaretlenmiş bir transkript aralığını tekrar tekrar dinleme.
- Space oynat/duraklat, sol/sağ ok 5 saniye sarma, Ctrl/⌘ + Enter bölüm ekleme kısayolları.
- Görev profili (yerel referans, atama mercii, tarihler, inceleme kapsamı ve sorular) bilgisini şifreli kasada saklama.
- Görev ve kaynak bilgileriyle birlikte zaman kodlu TXT/JSON, DOCX ve ODT çalışma taslağı dışa aktarma.
- Türkçe ASR adaylarını değerlendirmek için WER/CER metrik hesaplayıcısı; bu kod bir ASR motoru içermez ([değerlendirme planı](docs/ASR_MODEL_EVALUATION.md)).
- 128 MiB sınırı içindeki ses dosyaları için 1 MiB parçalar halinde düşük bellekli SHA-256 ön kontrolü.

**Henüz bağlı olmayanlar:** yerel ASR motoru, kasa parolası kurtarma/sıfırlama, resmi belge/OCR akışı, otomatik kayıt ve çökme sonrası kurtarma kabul testleri, PDF son çıktısı, 128 MiB üzerindeki sesler için güvenli düşük bellekli dinleme, uzun dosyalarda akışlı hash, doğrulanmış UYAP/UDF entegrasyonu ve temiz cihaz pilot kabulü.

## Güvenli kullanım sınırı

Yerel kasa önizlemesi, içe alınan sesleri 1 MiB AES-256-GCM şifreli bloklar halinde cihazdaki Stronghold snapshot ve materyal dosyalarında saklar. SHA-256 ön kontrolü de 1 MiB parçalar halinde çalışır ve dosyanın tamamını RAM'e almaz. Kasa parolası olmadan yerel kayıtlar açılamaz. Bu ilk dilimde dosya başına 128 MiB sınırı korunur: dinleme sırasında şifreli kayıt ve çözülmüş ses hâlâ belleğe birlikte alınabildiğinden, yalnızca içe aktarma/hash akışlı diye daha büyük dosya desteği hazır sayılmaz. Büyük dosya desteği için oynatma ve yedekleme yolları da akışlı hale getirilmelidir. `.mihenkbackup` dosyası Stronghold snapshot’ını, Argon2 salt’ını ve AES-GCM ile şifrelenmiş materyal dosyalarını tek pakette taşır. Paket kendi başına ek bir parola katmanıyla şifrelenmez; içindeki hassas veriler zaten şifreli kalır. Paket içi SHA-256 özetleri kazara bozulmayı saptar; imza veya kötü niyetli değişikliğe karşı doğrulama değildir. Geri yükleme yalnız boş kasaya yapılır ve aynı kasa parolası gerekir. Parola kurtarma/sıfırlama yoktur. Harici servise ses göndermez ve otomatik transkripsiyon yapmaz.

SHA-256 göstergesi, 128 MiB sınırı içindeki seçilmiş dosyanın parçalı ön kontrolüdür. Delil zinciri, teslim öncesi köken doğrulaması veya dosyanın özgünlüğü hakkında kanıt sayılmaz. 128 MiB üzerindeki dosyalar henüz kasaya alınmaz ve bu prototipte hash üretilmez.

**Görev alanı yalıtımı ilk düzeyde uygulanmıştır; bu tam atama profili veya vaka yönetimi değildir. Gerçek dava/soruşturma materyalini bu önizlemede kullanmayın.** Gerçek materyalle kullanım için resmî atama profili ve belge akışı, yerel ASR, büyük dosya/düşük bellek desteği, rapor çıktıları, kasa/çökme kurtarma kabul testleri, bağımsız güvenlik incelemesi ve hukuk/veri koruma değerlendirmesi tamamlanmalıdır.

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

### Windows'ta uygulama açılmıyorsa

Uygulama başlangıçta kapanırsa MİHENK artık yerel tanılama günlüğü yazar:

`%LOCALAPPDATA%\\com.mihenk.desktop\\logs\\startup.log`

Bu dosyayı açılış hatasının saatine göre kontrol edin. Hata bildirirken ses, transkript, kişi bilgisi veya UYAP belgesi paylaşmayın; yalnızca günlükteki teknik hata satırlarını ve uygulama sürümünü paylaşın. Günlük dosyası yerel kalır; kendiliğinden GitHub'a yüklenmez.

## Teknoloji adayı

İlk masaüstü prototip, geçici olarak Tauri 2 + React + TypeScript + Vite kullanır. Bu seçim nihai platform mimarisi değildir; hedef cihaz, Windows/Pardus paketlemesi, kaynak tüketimi, güvenlik ve bakım denemelerinden sonra tekrar değerlendirilecektir.

## Lisans

Depo herkese açık olsa da kaynak kod için henüz açık kaynak lisansı verilmemiştir. Bu nedenle açık kaynak lisansı veya yeniden kullanım izni varsayılmamalıdır. Lisans kararı ayrıca yayımlanacaktır.

## Katkı ve dil

README, issue, pull request başlık/açıklamaları ve commit mesajları Türkçe tutulur. Teknik tanımlayıcılar, standart kod isimleri ve kütüphane/API adları özgün biçimlerinde kalabilir.


## Kurulum ve otomatik güncelleme

> **Yayın durumu (14 Kasım 2026):** Kararlı sürüm henüz yoktur. Güncel geliştirme önizlemesi `0.1.0-22` olarak yayımlanmıştır; önizlemeler yalnızca sentetik veya kullanım izni bulunan test verisi içindir. GitHub Releases bölümündeki `draft` durumundaki kayıtlar halka açık indirme değildir.

### Hedeflenen kullanıcı indirmeleri

- **Windows Setup.exe (önerilen):** Varsayılan NSIS kurulumu yalnızca geçerli Windows kullanıcısına, `%LOCALAPPDATA%` altına yapılır; normalde yönetici izni istemez.
- **Windows MSI:** WiX paketi varsayılan olarak Program Files içine bilgisayar geneli kurulum yapar ve yönetici izni gerektirir. EXE ve MSI alternatif kurulum biçimleridir; aynı bilgisayara ikisini birden kurmayın.
- **Windows WebView2:** Kurulum paketleri çevrimdışı WebView2 Runtime yükleyicisini içerir. Bu, runtime'ın cihazda bulunmadığı ve internet erişiminin olmadığı ortamlarda da açılışı mümkün kılar; Windows kurulum dosyaları bu nedenle yaklaşık 127 MiB daha büyük olur.
- **Windows yayıncı imzası:** Setup.exe ve MSI henüz Authenticode kod imzalama sertifikasıyla imzalanmıyor. Bu nedenle Windows “bilinmeyen yayımcı” veya SmartScreen uyarısı gösterebilir. İndirilen paketin yanındaki Tauri `.sig` dosyası otomatik güncelleme imzasıdır; Authenticode imzası değildir. İmzalama sertifikası ve SmartScreen itibarı tamamlanmadan bu kurulumlar üretim onayı almış sayılmaz.
- **Pardus / Debian tabanlı Linux:** .deb paketi.
- **Linux:** AppImage paketi.

Sürüm ve indirme sayfası: https://azmisahin-gov.github.io/mihenk/  
Tüm GitHub sürümleri: https://github.com/azmisahin-gov/mihenk/releases  
Kararlı sürüm adresi (kararlı etiket yayımlandığında): https://github.com/azmisahin-gov/mihenk/releases/latest

Geliştirme önizlemesi ile kararlı sürüm ayrı kanallardır. Önizleme sürümü kuran kullanıcılar yalnızca önizleme kanalından güncelleme alır; kararlı sürüm kullanıcıları önizleme koduna otomatik geçirilmez.

### Otomatik güncelleme güvenliği

Yayın derlemesi Tauri imza doğrulamasını kullanacak şekilde yapılandırılmıştır. İmza doğrulanmadan güncelleme kurulmaz.

**Bir defalık imza yapılandırması 13 Kasım 2026 tarihinde tamamlandı.** `TAURI_UPDATER_PUBLIC_KEY` GitHub repository variable ve `TAURI_SIGNING_PRIVATE_KEY` GitHub Actions secret olarak ayarlandı. Özel anahtar uygulama kaynak koduna veya yayın paketlerine eklenmez.

Özel anahtarın yerel çevrimdışı kopyasını koruyun; bilgisayar hesabını ve diski şifreleyin, ayrıca güvenli çevrimdışı yedek alın. Anahtarı sohbet, issue, PR, dosya eki, commit veya log içinde paylaşmayın. Anahtar kaybolursa mevcut imza kimliğiyle güncelleme yayımlamak mümkün olmayabilir. Anahtarı yeniden üretmek veya değiştirmek mevcut kurulumların güncelleme zincirini etkileyebilir; gelişigüzel yenilemeyin.

Tauri güncelleme imzası Windows Authenticode yayıncı sertifikasının veya UYAP e-imza sertifikasının yerine geçmez. Windows kurulum dosyalarında Authenticode imzası henüz yoktur; bu nedenle SmartScreen/UAC uyarısı beklenebilir. Geçerli bir kod imzalama sertifikasıyla imza atmak yayıncı kimliğini gösterir, ancak yeni uygulamalarda SmartScreen uyarısının hemen kalkacağını garanti etmez.

### Yayın akışı

- `main` dalına birleştirilen değişiklikler, önizleme yayın iş akışını tetikler.
- `vX.Y.Z` biçimindeki etiket kararlı sürüm paketlerini ve güncelleme manifestini üretir.
- Yayından önce `package.json`, `src-tauri/tauri.conf.json` ve `src-tauri/Cargo.toml` sürümleri eşitlenir.
- Uygulama açılışında güncelleme kontrolü yapılır; manifest imzası doğrulandıktan sonra yeni sürüm indirilip kurulabilir. Güncelleme akışının gerçek kullanıcı cihazlarında ve her kurulum türünde uçtan uca kabul testi henüz tamamlanmamıştır.

**Platform sınırı:** Tauri Updater Linux'ta AppImage ve Debian `.deb`, Windows'ta NSIS ve MSI paketlerini destekler. Debian güncellemesi sistem paket kurulumunu (`dpkg`) ve gerekli yönetici yetkisini isteyebilir. Windows kurulumları için Authenticode yayıncı sertifikası ayrıca gerekir; Tauri güncelleme imzası bunun yerine geçmez.

### Test ve yayın güvenliği

GitHub Actions PR aşamasında kilitli bağımlılıkları, ön yüz derlemesini ve Windows/Linux masaüstü başlatma kontrollerini yürütür. Bu kontroller kurulum paketinin yayımlandığını, otomatik güncellemenin çalıştığını veya uygulamanın bilirkişi iş akışı için hazır olduğunu kanıtlamaz. Gerçek dağıtım, kalıcı/şifreli çalışma kasası, yerel ASR ve uçtan uca kullanıcı testleri tamamlanmadan ürün hazır ilan edilmeyecektir.

## Geliştirme ve yayın akışı

- Varsayılan geliştirme dalı `main`'dir. Yeni işler `feat/*` veya `fix/*` gibi kısa ömürlü dallarda yapılır.
- Değişiklikler PR ile `main` dalına gelir. PR doğrulaması birim testleri, TypeScript/üretim derlemesi ve Linux/Windows masaüstü derleme denetimlerini çalıştırır.
- `main` güncellendiğinde geliştirme önizlemesi otomatik hazırlanır. Tek bir taslak GitHub Release kaydı kullanılır; Linux ve Windows paketleri ile imzaları aynı kayda yüklenir. Her iki yayın ikilisi açılış testini geçip gerekli dosyalar doğrulanmadan önizleme yayımlanmaz.
- Kararlı sürüm, `vX.Y.Z` etiketiyle başlatılır. Paket sürümleri birbiriyle karşılaştırılır; Linux ve Windows kurulumları/imzaları ile yayın ikilisi açılış testleri tamamlanınca taslak Release yayımlanır.
- Bir PR birleştirilince aynı depodaki çalışma dalı otomatik silinir. Eski dalların ilk temizliği de tamamlanmıştır.

**Depo yönetişimi notu:** PR doğrulaması otomatik çalışır. Bu bağlantı, yönetici izni gerektiren `main` dalı koruma kurallarını okuyamıyor; bu nedenle PR zorunluluğu ve üç CI denetiminin zorunlu olması depo sahibi tarafından GitHub ayarlarında ayrıca doğrulanmalıdır. Birleştirme sonrası dalları temizleyen iş akışı ayrıca çalışır.

