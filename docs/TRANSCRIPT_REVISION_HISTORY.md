# Transkript kaynak metni ve sürüm geçmişi

Bu belge Issue #31 kapsamındaki ilk sürüm revizyon modelini açıklar.

## Veri katmanları

- ASR tarafından üretilen ham metin, `rawAsrText` alanına ilk makine çıktısı olarak alınır. Uzman düzeltmeleri bu alanı değiştirmez.
- Görünen transkript metni, zaman aralığı, kaynak kanal, anonim konuşmacı etiketi, anotasyon türü ve kontrol durumu ayrı alanlarda saklanır. ASR çok kanallı kayıtta kanal etiketini üretir; konuşmacı kimliği veya diyârizasyon çıkarmaz.
- Anotasyon türleri konuşma, kısmen anlaşılmayan konuşma, anlaşılmayan konuşma, vokalizasyon ve çevresel ses olayı olarak ayrılır.
- Her edit olayı `before` ve `after` anlık görüntülerini (kanal ve anotasyon türü dahil), zamanını, gerekçe sınıfını ve varsa yerel editör kimliğini içerir.
- Aynı alan üzerinde 1,5 saniyelik kesintisiz yazım oturumu tek revizyon olayı olarak birleştirilir. Bu, her tuş için ayrı olay üretmeden ilk/son metin sınırını korur.
- ASR yeniden çalıştırıldığında yalnızca hiç uzman revizyonu olmayan eski makine taslakları yenilenir. İnsan tarafından yazılmış segmentler ve revize edilmiş makine segmentleri korunur.
- Metin bölümleri, saniye tabanlı aralıklarla kaynağa bağlanır; oynatma konumunun hangi segmente düştüğü bulunarak ilgili kart vurgulanır. Açık bitişi olan segment, bir sonraki segmentin başlangıcına kadar etkin sayılır. Kart zaman damgası seçildiğinde oynatma o segment başlangıcına gider.

## Kimlik ve denetim sınırı

Uygulamada henüz doğrulanmış yerel uzman profili/kimliği bulunmadığından revizyon olayındaki `editorId` şimdilik `null` tutulur. Arayüz bunu açıkça “Yerel uzman kimliği tanımlı değil” şeklinde gösterir; cihaz kullanıcısı kimlik doğrulaması yapılmış gibi gösterilmez.

Revizyon geçmişi yerel Stronghold şifreli kasa metadata'sıyla birlikte saklanır. Bu kayıt, uygulama içindeki düzenleme olaylarını izlenebilir kılar; tek başına bağımsız zaman damgası, elektronik imza, kişi kimliği doğrulaması veya değiştirilemez adli denetim kaydı değildir. Kasa dosyasına yetkili erişimi olan biri metadata'yı değiştirebileceğinden, dışarıdan doğrulanabilen imzalı audit zinciri ayrı güvenlik tasarımı gerektirir.

## Durum ve sınırlar

- Makine çıktısının kaynağı her zaman `source: "asr"` olarak korunur. Yeni ASR sonucu başlangıçta taslaktır; uzman kontrol durumu ayrı bir alan olarak değiştirilir ve kaynak türü uzman kaynağına dönüştürülmez.
- Ham ASR metni ile uzman metni ayrı gösterilebilir; önceki/sonraki metin, zaman, konuşmacı etiketi ve kontrol durumu değişiklikleri ayrıntılarda görüntülenir.
- Yerel uzman kimliği henüz mevcut değildir.
- Segment silme işlemi bu ilk dilimde silme olayı olarak kayda alınmıyor.
- Kelime düzeyinde forced alignment, otomatik konuşmacı diarization, bağımsız audit imzası, tam review queue ve uzman kabul oturumu bu değişiklikle tamamlanmış sayılmaz.
- Eski kasalarda ASR `speaker: "Kanal N"` değeri, açık kanal alanı yoksa okuma sırasında `channel` alanına taşınır; uzman konuşmacı etiketleri korunur.
- Mevcut segment timecode'ları saniye tabanlı aralıktır; kaynak ofseti veya kelime seviyesinde hassasiyet iddiası taşımaz.

Bu nedenle bu dikey dilim K-06 için teknik altyapıyı ve birim testlerini, K-03 için oynatma konumundan segment vurgulama ve segment başlangıcından sese atlama dilimini sağlar; Issue #31'in bütün kabul maddelerini geçtiği anlamına gelmez.
