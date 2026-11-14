# MİHENK

MİHENK, ses kayıtları üzerinde bilirkişi çalışma sürecini yerel cihazda yürütmeyi hedefleyen masaüstü uygulamasıdır. Bu depo uygulama kodunu içerir; araştırma ve 56.12 gereksinimlerinin asıl kaydı [mihenk-arge](https://github.com/azmisahin-gov/mihenk-arge) deposundadır.

## Mevcut prototip yetenekleri

- Görev/atama alanı, ses materyali kuyruğu ve görev bazlı çalışma alanı.
- En fazla 240 MiB ses dosyası için 1 MiB sabit parçalarla şifreli içe aktarma ve tam kaynak SHA-256 özeti.
- AES-256-GCM şifreli yerel kasa ve kimlik doğrulamalı, en fazla 1 MiB aralıklı ses oynatma.
- Dosyayı diske çözmeden, doğrulanmış şifreli kasa bloklarından okuyan yerel Symphonia decoder hattı.
- İsteğe bağlı yerel SEDA v0.1 Türkçe ASR modeli kurulumu; sabit model revision, ONNX SHA-256 ve token biçim denetimleri.
- Yerel SEDA akışlı transkripsiyon; model kurulduktan sonra ses işleme ağ bağlantısı kullanmaz. Çok kanallı kayıtlarda her kanal ayrı anonim kanal etiketiyle taslak üretir.
- Makine çıktıları yalnızca `taslak` durumundadır. Uzman düzeltmeleri kaynak türüyle ayrılır; ASR tekrar çalıştığında yalnızca düzeltilmemiş makine taslakları yenilenir.
- Zaman aralığına bağlı transkript bölümleri, manuel bölüm ekleme ve ses konumuna atlama.
- Ham ASR çıktısını uzman düzeltmesinden ayrı koruyan, önce/sonra revizyon geçmişi ve oynatma konumuna göre aktif transkript bölümünü vurgulayan inceleme akışı.
- Kaynak kanalını anonim konuşmacı etiketinden ayrı tutan; konuşma, anlaşılmayan konuşma, vokalizasyon ve çevresel ses anotasyonlarını destekleyen segment modeli.
- Şifreli kasa yedeği ve geri yükleme; toplam 2 GiB ve tek dosya 256 MiB sınırı.
- Atama profili ve transkript değişikliklerini kasada otomatik kaydetme.

## ASR sınırları ve kabul durumu

SEDA v0.1 akustik ONNX ağırlıkları ve token dosyası Apache-2.0 lisanslı sabit revision'dan indirilir. İsteğe bağlı `lm/` dosyaları CC BY-SA 4.0 nedeniyle kurulum dışında tutulur. İlk kurulum için internet gerekir; onaylı dosyalar indirildikten sonra model CPU üzerinde yerel çalışır. CI'da Sherpa native runtime arşivleri de sabit SHA-256 ile doğrulanır. ASR sırasında kaynak ses bulut servisine gönderilmez.

SEDA girdisi 16 kHz mono gerektirir. MİHENK çok kanallı dosyalarda kanalları ayrı işleyip `Kanal 1`, `Kanal 2` gibi etiketlerle gösterir; bu, kişi kimliği veya otomatik konuşmacı diyârizasyonu değildir. ASR'nin verdiği zaman aralıkları akış/endpoint segment sınırlarıdır; kelime düzeyinde forced alignment değildir. Ham metin küçük harf ve noktalama normalizasyonu yapılmadan taslak olarak saklanır. Her bölüm uzman tarafından sesle karşılaştırılmalıdır.

SEDA model kartındaki WER, CPU hızı ve RAM değerleri geliştirici beyanıdır; MİHENK'in bağımsız ölçümü veya adli doğruluk kanıtı değildir. Model kartı okunmuş konuşmanın baskın olduğunu; spontan, gürültülü, uzak mikrofonlu ve telefon konuşması başarımının ölçülmediğini bildirir. Bu nedenle gerçek pilot benchmark'ı, uzman referans metinleri ve kritik hata sınıfları henüz kabul edilmeden model "bilirkişi kullanımına hazır" sayılmaz.

Symphonia 0.6.1 decoder matrisiyle eşleştirmek için `.opus` ve `.wma` uzantıları içe alma filtresinde kabul edilmez. Teknik envanterde kapsayıcı/codec/kanal/örnekleme hızı/bit derinliği/bit hızı, bağımsız şifreli-kopya read-back hash, crash/power-loss E2E ve tam K-01..K-12 uzman kabulü hâlâ açıktır. Ayrıntı: [Yerel ASR teknik notu](docs/LOCAL_ASR.md) ve [ASR pilot değerlendirme planı](docs/ASR_MODEL_EVALUATION.md).

**Bu prototipte gerçek dava/soruşturma materyali kullanmayın.** Bağımsız güvenlik incelemesi, temiz cihaz testi, dağıtım imzası, hukuk/veri koruma değerlendirmesi ve uzman pilotu tamamlanmamıştır. SHA-256 ve GCM bütünlük doğrulaması kaynağın kökenini, sesin özgünlüğünü veya manipülasyon bulunmadığını tek başına kanıtlamaz.

## Geliştirme

```bash
npm ci
npm test
npm run check
npm run build
```

Masaüstü geliştirmesi için Tauri 2 ve Rust toolchain gerekir; CI Windows ve Linux hedeflerinde Tauri test, build ve başlatma kontrolleri yürütür. `sherpa-onnx` Rust bağımlılığı sürümle sabitlenmiştir; native runtime'ın build aşamasındaki edinim zinciri ve dosya hash doğrulaması ayrıca sertleştirilmelidir.

## Yayın ve lisans

Kararlı sürüm ilan edilmemiştir. Yayın önizlemeleri sentetik veya izinli test verisi içindir. Depo herkese açık olsa da uygulama kaynak kodunun yeniden kullanım lisansı ayrıca belirtilmedikçe açık kaynak lisansı varsayılmamalıdır.
