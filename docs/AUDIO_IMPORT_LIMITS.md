# Ses içe aktarma ve kaynak bütünlüğü sınırları

Bu belge, 56.12 ses materyali kabulünün mevcut ilk aşamasındaki doğrulanabilir teknik sınırları açıklar.

## Akış ve bellek sınırları

- İçe aktarma ve SHA-256 ölçümü kaynak `File` nesnesini 1 MiB parçalarla okur; uygulama kodu tam dosya boyutunda bir dizi oluşturmaz.
- İçe aktarma sırasında SHA-256, AES-256-GCM ile şifrelenen aynı plaintext parçalar üzerinden hesaplanır. Böylece katalogdaki özet, şifreleme hattına verilen kaynak byte dizisini temsil eder; import sonrası ikinci bir tam dosya okuması yapılmaz.
- Her şifreli blok 1 MiB plaintext ve 16 byte GCM doğrulama etiketi taşır. Oynatma uç noktası Range yanıtlarını en fazla 1 MiB ile sınırlar ve her bloğu kimlik doğrulayarak çözer.
- Tam kaynak dosya üst sınırı 240 MiB'dir. 128 MiB önceki sınır değildir artık; 240 MiB üstü dosyalar hâlâ açıkça reddedilir.
- Şifreli kasa yedeği 64 KiB sabit IO tamponuyla akışlı okunur/yazılır. Tek arşiv girdisi 256 MiB, toplam yedek 2 GiB ile sınırlıdır. 240 MiB kaynak sesin şifreli dosyası, blok etiketleriyle birlikte 256 MiB tek-girdi sınırının altında kalır.
- Uygulama başlangıcında yalnızca rastgele materyal kimliği biçimine uyan normal `*.part` dosyaları temizlenir. `.mhn` materyal dosyaları ve diğer dosyalar bu kurtarma adımında silinmez.

Bu sınırlar, dosya boyutuna bağlı olmayan temel tamponlamayı (1 MiB ses girdisi, yaklaşık 1 MiB+16 byte şifreli blok, 1 MiB üst sınırında oynatma Range yanıtı ve 64 KiB yedek IO) korur. Gerçek RAM üst sınırı işletim sistemi/WebView, kripto çalışma alanları ve dosya sistemi tamponları tarafından da etkilenir; CI testi bu süreçlerin toplam RSS değerini ölçmez.

## Bütünlük yorumlama sınırı

SHA-256, MİHENK'in içe aktarma sırasında okuduğu byte dizisini tanımlar. GCM doğrulaması, şifreli kasa bloklarının oynatma sırasında değiştirilmediğini veya bozulduğunu tespit etmeye yarar. Bu ölçümler tek başına kaynağın kökenini, teslim öncesi muhafaza zincirini, kaydın gerçekliğini veya ses üzerinde manipülasyon bulunmadığını kanıtlamaz; dijital imza ya da bağımsız zaman damgası da değildir.

## Bu aşamada tamamlanmayanlar

- Konteyner/codec, kanal düzeni, örnekleme hızı, bit derinliği ve bit hızı için yerel teknik parser ve desteklenen biçim matrisi henüz eklenmedi.
- Orijinal/kopya byte dizisinin bağımsız read-back hash karşılaştırması henüz uygulanmadı. Hash, şifreleme hattının plaintext girişinde hesaplanır; şifreli bloklar GCM ile doğrulanır.
- Disk dolması, süreç sonlandırılması ve güç kesintisi gibi gerçek uygulama kesintileri masaüstü E2E senaryolarıyla ayrıca sınanmalıdır.
- 240 MiB sınırına yakın gerçek dosyalarla Windows/macOS/Linux bellek ve disk yük testi yapılmalıdır.

Bu nedenle 56.12 K-01/K-02 kabulü tamamlandı olarak işaretlenmemelidir; bu doküman yalnızca uygulanan sınırları ve kalan kanıt gereksinimlerini açıklar.