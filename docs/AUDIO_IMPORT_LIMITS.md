# Ses içe aktarma ve kaynak bütünlüğü sınırları

Bu belge, 56.12 ses materyali kabulünün mevcut ilk aşamasındaki doğrulanabilir teknik sınırları açıklar.

## Akış ve bellek sınırları

- İçe aktarma ve SHA-256 ölçümü kaynak `File` nesnesini 1 MiB parçalarla okur; uygulama kodu tam dosya boyutunda bir dizi oluşturmaz.
- İçe aktarma sırasında SHA-256, AES-256-GCM ile şifrelenen aynı plaintext parçalar üzerinden hesaplanır. Böylece katalogdaki özet, şifreleme hattına verilen kaynak byte dizisini temsil eder; import sonrası ikinci bir tam dosya okuması yapılmaz.
- Her şifreli blok 1 MiB plaintext ve 16 byte GCM doğrulama etiketi taşır. Oynatma uç noktası Range yanıtlarını en fazla 1 MiB ile sınırlar ve her bloğu kimlik doğrulayarak çözer.
- Tam kaynak dosya üst sınırı 240 MiB'dir. 128 MiB önceki sınır değildir artık; 240 MiB üstü dosyalar hâlâ açıkça reddedilir.
- Şifreli kasa yedeği 64 KiB sabit IO tamponuyla akışlı okunur/yazılır. Tek arşiv girdisi 256 MiB, toplam yedek 2 GiB ile sınırlıdır. 240 MiB kaynak sesin şifreli dosyası, blok etiketleriyle birlikte 256 MiB tek-girdi sınırının altında kalır.
- Uygulama başlangıcında yalnızca 24 saatten eski, rastgele materyal kimliği biçimine uyan normal `*.part` dosyaları temizlenir. Daha yeni `.part` dosyaları olası başka bir uygulama örneğinin etkin import işlemini bozmamak için korunur; yedekleme bunları materyal olarak içeri almaz. `.mhn` materyal dosyaları ve diğer dosyalar bu kurtarma adımında silinmez.

Bu sınırlar, dosya boyutuna bağlı olmayan temel tamponlamayı (1 MiB ses girdisi, yaklaşık 1 MiB+16 byte şifreli blok, 1 MiB üst sınırında oynatma Range yanıtı ve 64 KiB yedek IO) korur. Gerçek RAM üst sınırı işletim sistemi/WebView, kripto çalışma alanları ve dosya sistemi tamponları tarafından da etkilenir; CI testi bu süreçlerin toplam RSS değerini ölçmez.

## Gerçek kaynak dalga biçimi — uygulanan ilk dilim

Dinleme alanındaki temsilî çubuklar kaldırılır. MİHENK, kaynak sesi AES-GCM blok doğrulaması yapan şifreli kasa okuyucusundan Symphonia decoder'a akıtarak 512 zaman kovası için tepe genliği hesaplar. Her kovada tüm kanallar arasındaki en yüksek mutlak örnek değeri kullanılır; bu RMS/loudness ölçümü veya konuşma analizi değildir.

- Çözülmüş kaynak ses diske geçici plaintext dosya olarak yazılmaz; okuyucu mevcut bloklu ve doğrulamalı bellek yolunu kullanır.
- Decoder paketleri sınırlı tamponlarla işlenir; kanal sayısı 1–8, örnekleme hızı en fazla 192 kHz ve paket boyutu uygulama güvenlik sınırlarıyla kontrol edilir.
- 512 değer 0–1 aralığında Stronghold şifreli materyal metadata'sında önbelleğe alınır. Kasa tekrar açıldığında yeniden çözümleme gerekmez.
- Ses süresi veya codec güvenilir biçimde okunamazsa dalga biçimi üretilmez; kullanıcıya açık hata ve yeniden deneme seçeneği gösterilir. Rastgele/temsili grafik fallback'i yoktur.
- Oynatma imleci, gerçek zaman kovaları üzerinde ilerleme vurgusu olarak gösterilir. Zaman çözünürlüğü 512 kovayla sınırlıdır; kelime hizalaması veya olay tespiti değildir.

Bu görselleştirme, seçilen decoder'ın ürettiği örneklerin genlik özetidir. Kaynak kökeni, sesin özgünlüğü veya manipülasyon bulunmadığı konusunda kanıt oluşturmaz.

## Bütünlük yorumlama sınırı

SHA-256, MİHENK'in içe aktarma sırasında okuduğu byte dizisini tanımlar. GCM doğrulaması, şifreli kasa bloklarının oynatma sırasında değiştirilmediğini veya bozulduğunu tespit etmeye yarar. Bu ölçümler tek başına kaynağın kökenini, teslim öncesi muhafaza zincirini, kaydın gerçekliğini veya ses üzerinde manipülasyon bulunmadığını kanıtlamaz; dijital imza ya da bağımsız zaman damgası da değildir.

## Teknik envanter — uygulanan ilk decoder dilimi

Şifreli materyal, kasa içinden açılan doğrulanmış ve seek edilebilir okuyucu üzerinden Symphonia 0.6.1 ile incelenir. Kaynak ses plaintext olarak diske yazılmaz; decoder yalnızca şifreli blokların kimlik doğrulamasından geçmiş veriyi okur.

Envanterde desteklenen biçimlerde şu alanlar saklanır:

- Kapsayıcı biçiminin Symphonia tanımı ve codec'in kayıtlı kısa/uzun adı.
- Kanal sayısı ve decoder'ın bildirdiği kanal yerleşimi (ör. `[FL,FR]`).
- Örnekleme hızı, örnek başına bit ve codec'in ayrıca bildirdiği kodlanmış örnek bit sayısı.
- Decoder'ın bildirdiği sample format ve kapsayıcı süre bilgisi.
- Ortalama dosya bit hızı: `dosya byte sayısı × 8 / süre`. Bu değer kapsayıcı/etiket ek yükünü de içerir; elementary-stream/codec bit hızı olarak yorumlanmamalıdır.

Bir alan decoder/kapsayıcı tarafından sağlanmıyorsa `null` kalır; tahminle doldurulmaz. Kapsayıcı çözümlenemiyorsa sesin şifreli içe alımı korunur, teknik okuma `unavailable` olarak saklanır ve hata kullanıcıya gösterilir. Parser başarısızlığı kaynak dosyanın desteklendiği veya içeriğinin doğrulandığı anlamına gelmez.

### Derleme yapılandırmasındaki destek matrisi

Cargo'da açık olan Symphonia 0.6.1 özellikleri: AIFF, AAC, ALAC, FLAC, ISO/MP4, MP3, OGG/Vorbis, PCM ve WAV. Gerçek codec/kanal/bits alanları her dosyanın stream header'ından okunur; uzantı tek başına codec kabulü sayılmaz. `.opus` ve `.wma` uygulamanın içe alma filtresinde hâlâ kabul edilmez.

Bu liste yalnızca derlemeye bağlanan parser/decoder özelliklerini belirtir. Her dosyanın her profile, çok izli varyant veya bozuk/eksik örneği desteklendiği iddiası değildir. Kabul matrisinin tamamlanması için lisansı doğrulanmış sentetik/açık dosyalar üzerinde format ve codec başına fixture testleri gerekir.

## Bu aşamada tamamlanmayanlar

- Orijinal/kopya bağımsız read-back SHA-256 artık içe alma öncesinde uygulanır; ancak orijinalin sonradan değişmezliğini, kaynak kökenini veya teslim öncesi muhafaza zincirini tek başına kanıtlamaz.
- Disk dolması, süreç sonlandırılması ve güç kesintisi gibi gerçek uygulama kesintileri masaüstü E2E senaryolarıyla ayrıca sınanmalıdır.
- 240 MiB sınırına yakın gerçek sentetik/açık lisanslı dosyalarla Windows/Linux bellek, CPU ve disk yük testi yapılmalıdır.
- Desteklenen biçim/codec eşleşmelerinin tamamı için çoklu fixture matrisi ve gerçek uzman pilotu henüz tamamlanmamıştır.

Bu nedenle 56.12 K-01/K-02 kabulü tamamlandı olarak işaretlenmemelidir; teknik parser ilk dikey dilimi sağlar, fakat tüm kabul kanıtlarının yerine geçmez.