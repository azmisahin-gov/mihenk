# Yerel SEDA v0.1 transkripsiyon hattı

**Durum: İlk dikey dilim kodlandı; platform CI ve sentetik okuyucu testleriyle doğrulama bekliyor. Bu belge uzman pilot kabulü değildir.**

## Model manifesti

- Model kimliği: `atasoglu/seda-v0.1`
- Sabit Hugging Face revision: `b5cf32ae4936968b284df3f1c4c79714af71e1fe`
- Runtime: `sherpa-onnx = 2.0.1`, Rust API `OnlineRecognizer`
- Decoder: `symphonia = 0.6.1`, yalnızca açıkça etkinleştirilmiş format/kodek özellikleri
- ASR: greedy streaming transducer, CPU provider, 1–4 thread
- Modelin gereksinimi: 16 kHz mono kanal akışı

### Kurulan dosyalar

| Dosya | Sabit doğrulama |
|---|---|
| `encoder.int8.onnx` | SHA-256 `2596861911cec5ca1de31adc12a7fc983d05395434f92239f4e007eeae3a5dcc` |
| `decoder.onnx` | SHA-256 `dc28b7ae3f5e67c0daa2d51886dae2ac8287a25333f46a363f3684b3cd1220c9` |
| `joiner.int8.onnx` | SHA-256 `b4d1cff7c410d14c85c143885954be09a6a4a076cd35d22aeba58655665582bb` |
| `tokens.txt` | Git blob SHA-1 `6ba58dd6a298eae17f7f1ac9a8e3ec714550926a` + 500 sıralı BPE token denetimi |

ONNX dosyaları SHA-256 ile doğrulanır. Token dosyasının SHA-1 değeri, sabit Git blob nesne kimliğini denetlemek içindir; SHA-1 yeni bir kriptografik imza veya delil doğrulama mekanizması olarak kullanılmaz. Manifest isteğe bağlı `lm/` dosyalarını indirmez; bu dosyaların lisansı Apache-2.0 değildir.

İlk model kurulumunda kullanıcı tek uygulamadaki Yerel ASR kartından indirmeyi başlatır. Her dosya 64 KiB tamponlarla geçici klasöre indirilir, boyut/hash/token yapısı kontrol edilir ve tamamı doğrulanmadan etkin model dizinine taşınmaz. Model dosyaları indirilince ASR çalıştırması yerel ONNX Runtime CPU yürütümüdür; transkripsiyon sırasında ses ağ üzerinden gönderilmez. İlk indirme için bağlantı gerekir.

## Şifreli sesin decoder'a aktarılması

Rust `VaultAudioReader`, mevcut kasa dosyasını doğrudan açar. Stronghold'dan alınan 32 byte audio key, komut sınırında geçici bellekte tutulur ve JS tarafında çağrı tamamlanınca sıfırlanır. Reader her `Read` isteğinde yalnızca ihtiyaç duyduğu AES-256-GCM bloğunu çözer; en fazla bir 1 MiB plaintext blok cache'lenir ve blok değişince/sahip nesne bırakılınca zeroize edilir. Symphonia `MediaSource` arayüzü üzerinden seek edebilir. Çözülmüş kaynak ses için geçici dosya oluşturulmaz.

Kapsayıcı ve codec decoder ile doğrulanır. Mevcut ASR filtresi WAVE, MP3, MP4/M4A, AAC, OGG/Vorbis, FLAC ve AIFF/AIF biçim uzantılarını kabul eder; OPUS ve WMA listede yoktur. Desteklenmeyen decoder, değişken kanal/sample-rate paketi, bozuk veya GCM doğrulaması başarısız blok sessizce atlanmaz; görev hata ile durur.

Giriş 16 kHz değilse sherpa-onnx `LinearResampler` kullanılır. Çok kanallı sesler otomatik kişi kimliğiyle birleştirilmez; her kanal kendi mono stream'i olarak yürütülür ve `Kanal 1`, `Kanal 2` etiketini alır. Bu kanal ayrımı speaker diarization veya insan kimliği değildir.

## Transkript anlamı

- Her ASR sonucu `source=asr`, `status=taslak` olarak yazılır.
- Üretim segmentleri modelin endpoint/akış blok sınırlarından zaman aralığı alır. Kelime düzeyinde forced alignment yoktur; zaman kodu kelime başlangıcı olarak sunulmaz.
- Ham model metnine otomatik noktalama, özel isim, tarih/sayı, kısaltma veya Türkçe ek düzeltmesi uygulanmaz.
- Kullanıcının düzenlediği segment `source=uzman` olarak etiketlenir. Tekrar ASR, yalnızca eski/düzeltilmemiş `source=asr` taslaklarını yeniler; uzman düzenlemeleri korunur.
- ASR otomatik olarak `uzman-onayli` durumuna geçmez. Anlaşılamayan ifade kullanıcı tarafından dinlenip belirsiz olarak işaretlenmelidir.

## Bilinen eksikler / kabul kapıları

1. Model card benchmark sayılarını MİHENK ölçümü olarak tekrar etmeyin. Kilitli açık/izinli korpus üzerinde WER/CER/KDHO, kritik isim/olumsuzluk/sayı hata analizi gerekir.
2. Kayıt süresi boyunca CPU/RAM ve uzun kayıt performansı Windows/Linux üzerinde ölçülmelidir; CI şu anda gerçek 240 MiB ASR yük/RSS benchmark'ı değildir.
3. Sherpa crate sürümü sabit olsa da build aşamasında edinilen native runtime arşivi için bağımsız checksum/attestation ve tekrarlanabilir release kanıtı tamamlanmalıdır.
4. Decoder'ın desteklediği gerçek kapsayıcı/codec listesi dosya içeriğinden teknik envantere yazılmalı; uzantı listesi tek başına format ispatı değildir.
5. Transkript model adı/revision/decoder ayarları, her segmentin kaynak kaydı ve uzman revizyon geçmişi tam görev verisi/rapor hattına bağlanmalıdır.
6. Çökme sonrası kaldığı yerden devam eden iş kuyruğu, idempotent ASR job ledger ve gerçek offline E2E henüz tamamlanmamıştır.
7. K-01..K-12 ve bilirkişi kabul pilotu açık kalır.

Model kartı: https://huggingface.co/atasoglu/seda-v0.1
Runtime dokümanı: https://docs.rs/sherpa-onnx/2.0.1/sherpa_onnx/
Decoder dokümanı: https://docs.rs/symphonia/0.6.1/symphonia/
