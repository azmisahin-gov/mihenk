# Türkçe ASR motoru seçimi ve pilot kabul planı

**Durum: SEDA v0.1 ilk yerel uygulama dikey dilimi olarak bağlandı. Benchmark ve uzman kullanım kabulü yapılmadı.**

MİHENK'in bilirkişi kullanımı için ASR çıktısı otomatik doğru kabul edilemez. Her bölüm özgün sesle karşılaştırılmalı, belirsizlikleri görünür bırakmalı ve uzman onayı gerektirmelidir. Bulut servisine ses gönderilmesi yerel çalışma hedefiyle uyumlu değildir.

## İlk uygulama adayı: SEDA v0.1

Model kartı: https://huggingface.co/atasoglu/seda-v0.1

- Türkçe odaklı Zipformer2 transducer; ONNX/int8 encoder, decoder ve joiner.
- 16 kHz mono akış girişi; 500 BPE token.
- Akustik ONNX dosyaları ve token dosyası Apache-2.0 olarak tanımlanmıştır.
- İsteğe bağlı `lm/` dosyaları CC BY-SA 4.0 olduğu için ilk kurulum manifestine dahil değildir.
- Çıktı küçük harfli ve noktalamasızdır; sayıların yazıyla çıkması ve Türkçe büyük/küçük harf/noktalama dönüşümü ayrı uzman kararını gerektirir.
- Model kartındaki WER, gerçek zaman faktörü ve RAM değerleri geliştirici beyanıdır; bağımsız MİHENK ölçümü değildir. Okunmuş konuşma dışındaki spontan, gürültülü, telefon ve uzak mikrofon koşulları ayrıca ölçülmelidir.

## Uygulamadaki ilk dikey dilim

`sherpa-onnx 2.0.1` ile streaming `OnlineRecognizer`, `symphonia 0.6.1` decoder ve şifreli kasa üzerinden seek/read yapan doğrulanmış `MediaSource` kullanılır. Model dosyaları ilk kurulumda kullanıcı tetiklemesiyle sabit revision'dan indirilir ve manifest hash/token yapısı denetlenir. Model kurulduktan sonra transkripsiyon yerel CPU üzerinde çalışır. Her kanal anonim kanal etiketiyle ayrı işlenir; otomatik kişi kimliği/diarization yapılmaz.

Bu akış word-level forced alignment değildir. Segment başlangıç/bitişleri ASR endpoint aralıklarıdır; her kelime için hassas zaman damgası olarak kullanılmamalıdır. Ham tanıma metni korunur. Her sonuç yalnızca makine taslağıdır.

Teknik ayrıntı ve dosya hash'leri [LOCAL_ASR.md](LOCAL_ASR.md) içindedir.

## Zorunlu yerel pilot korpusu

Gerçek kişisel/adli ses materyalini CI veya herkese açık depoya koymadan, izinli ve erişimi sınırlı yerel test kayıtlarıyla aşağıdaki sınıflar kapsanmalıdır:

1. Türkçe ad-soyad, kurum, yer, plaka/seri numarası, yabancı ad ve kısaltmalar.
2. Rakam, tarih, saat, para, miktar, oran, adres ve dosya numarası.
3. Olumsuzluk, kip, kişi ve hâl ekleri; ör. *geldi/gelmedi* ve *evler/evlerde*.
4. Sessizlik, arka plan gürültüsü, telefon/uzak mikrofon, yankı ve üst üste konuşma.
5. Doğal ve hızlı konuşma, duraksama, bölgesel telaffuz, uzun kayıt ve çoklu konuşmacı.

Aynı referans metin üzerinde WER, CER ve uygun Türkçe normalizasyonla KDHO ölçülmelidir. Rakam-yazı normalizasyonu ölçümde ancak açık ve sürümlenmiş bir kural setiyle yapılmalıdır; orijinal tanıma çıktısı üzerine yazılmamalıdır.

Donanım testi her hedef platformda CPU/RAM, gerçek zaman faktörü, uzun kayıt sürekliliği, son kelime kaybı, kesinti sonrası devam ve model yükleme süresini ölçmelidir. Ortalama WER tek başına geçiş kapısı değildir; hata türleri ve kritik bilgi sınıfları ayrı raporlanmalıdır.

## Kalan kabul işleri

- Model/runtime artefaktlarının üretim build zincirinde checksum/attestation ve lisans bildirimleri.
- Windows/Linux CPU/RAM, 240 MiB ve uzun kayıt benchmark'ları.
- Örnekleme oranı, codec, kanal haritası ve paket hata türleri için teknik envanter.
- Belirsiz/konuşma dışı bölümlerin uzman anotasyonuna uygun işaretlenmesi.
- ASR iş kuyruğunun kesinti sonrası idempotent devamı; model/revision/ayar kaydının görev/segment sürümüne bağlanması.
- Soru bağlantılı rapor, nihai QA ve K-01..K-12 uzman kabulü.

SEDA ilk yerel baseline'dır; karşılaştırma motoru yarışı veya bilirkişi kararı değildir.
