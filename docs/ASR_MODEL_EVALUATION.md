# Türkçe ASR motoru seçimi ve pilot kabul planı

**Durum: Araştırma adayı belirlendi; üretim motoru seçimi ve ses tanıma entegrasyonu tamamlanmadı.**

MİHENK'in bilirkişi kullanımı için ASR çıktısı otomatik doğru kabul edilemez. Her transkript zaman kodlu olmalı, özgün sesle karşılaştırılabilmeli, belirsizlikleri görünür bırakmalı ve uzman onayı gerektirmelidir. Bulut servisine ses gönderilmesi bu ürünün yerel çalışma hedefiyle uyumlu değildir.

## Değerlendirme adayı: SEDA v0.1

Model kartı: https://huggingface.co/atasoglu/seda-v0.1

Model kartında bildirilen teknik özellikler:
- Türkçe odaklı Zipformer2 transducer; yaklaşık 66,1 milyon parametre.
- ONNX/int8 encoder, decoder ve joiner; sherpa-onnx ile çalışıyor.
- 16 kHz mono giriş; akışlı çıktı.
- Model sahibinin bildirdiği tek CPU çekirdeğinde yaklaşık 30× gerçek zaman faktörü ve yaklaşık 170 MB RAM.
- Model sahibinin FLEURS-TR testinde bildirdiği WER %11,5; aynı kartta Whisper small için %11,9 karşılaştırması yer alıyor.

**Lisans ayrımı:** Akustik ağırlıklar ve token dosyaları Apache-2.0 olarak tanımlanmış. İsteğe bağlı dil modeli dosyaları CC BY-SA 4.0 lisanslıdır. Dil modeli olmadan kullanım seçeneği dokümante edilmiş olsa da dağıtım paketi, lisans ve atıf kontrolleri ayrıca yapılmalıdır.

**Bilinen sınırlar (model kartının kendi beyanı):**
- Çıktı küçük harfli konuşma biçimindedir; noktalama ve rakam biçimleme içermez.
- Özel isimler ve kısaltmalar hata kaynağıdır.
- Eğitim verisinde okunmuş konuşma ağırlığı vardır; spontan, gürültülü, uzak mikrofonlu veya telefon konuşmasındaki başarım ölçülmemiştir.
- Sayıların yazıyla çıkması, tarih/para/seri numarası gibi adli açıdan kritik değerlerin sonradan uzman kontrolünü gerektirir.

Bu veriler SEDA'yı düşük bellekli çevrimdışı **benchmark adayı** yapar; tek başına bilirkişi kaydında kullanılabilecek doğruluk kanıtı değildir.

## Alternatif ve değerlendirme kaynağı

- Türkçe ASR leaderboard: https://huggingface.co/yagmurtuncer/turkish-asr-leaderboard-kdho
  5.200 ifadeli, yedi farklı kaynağı içeren bir değerlendirme seti ve WER/CER yanında kök-ek duyarlı KDHO metriği açıklıyor. Özellikle olumsuzluk ve Türkçe ek ayrımlarını değerlendirmeye dahil etme gereğini gösteriyor.
- TurkMedSTT genel alan karşılaştırması: https://huggingface.co/datasets/turkmedstt/turkish-asr-benchmark
  Birden fazla model için WER/CER ve gerçek zaman faktörü yayımlıyor. Alan uyumu ve veri sızıntısı/benchmark koşulları ayrıca okunmadan sonuçlar doğrudan bilirkişi seslerine genellenmemelidir.
- sherpa-onnx Rust bağları: https://docs.rs/sherpa-onnx/latest/sherpa_onnx/
  Rust tarafında çevrimdışı/akışlı ASR ve Windows/Linux dahil çeşitli platformlar için API/derleme yaklaşımı sunuyor. Projeye dahil etmeden önce gerçek Tauri hedefleriyle derleme ve paket bağımlılıkları sınanmalıdır.

## Zorunlu yerel pilot korpusu

Gerçek kişisel/adli ses materyalini CI veya herkese açık depoya koymadan, izinli ve erişimi sınırlı yerel test kayıtlarıyla aşağıdaki sınıflar kapsanmalıdır:

1. Türkçe ad-soyad, kurum, yer, plaka/seri numarası, yabancı ad ve kısaltmalar.
2. Rakam, tarih, saat, para, miktar, oran, adres ve dosya numarası.
3. Olumsuzluk, kip, kişi ve hâl ekleri; ör. *geldi/gelmedi* ve *evler/evlerde*.
4. Sessizlik, arka plan gürültüsü, telefon/uzak mikrofon, yankı ve üst üste konuşma.
5. Doğal ve hızlı konuşma, duraksama, bölgesel telaffuz, uzun kayıt ve çoklu konuşmacı.

Aynı referans metin üzerinde WER, CER ve uygun Türkçe normalizasyonla KDHO ölçülmelidir. Rakam-yazı normalizasyonu ölçümde ancak açık ve sürümlenmiş bir kural setiyle yapılmalıdır; orijinal tanıma çıktısı hiçbir zaman üzerine yazılmamalıdır.

Donanım testi her hedef platformda CPU/RAM, gerçek zaman faktörü, uzun kayıt sürekliliği, son kelime kaybı, kesinti sonrası devam ve model yükleme süresi ölçmelidir. Ortalama WER tek başına geçiş kapısı değildir; hata türleri ve kritik bilgi sınıfları ayrıca raporlanmalıdır.

## Uygulama ve güvenlik kararları

- Model, runtime ve model manifesti sürüm/hash ile sabitlenmelidir.
- Model dosyaları doğrulanmadan çalıştırılmamalı; model ve runtime lisansları paket içinde görünür olmalıdır.
- Çalışma tamamen yerel olmalı; otomatik bulut yedeği, uzaktaki ASR veya telemetriye ses gönderimi olmamalıdır.
- ASR sonucu ayrı bir taslak katmanına yazılmalı; kullanıcı onayı olmadan uzman metninin, kaynak kaydın veya önceki düzeltmenin üzerine yazılmamalıdır.
- Her bölümün zaman aralığı, konuşmacı etiketi, model/sürüm bilgisi, güven/kararsızlık göstergesi ve uzman değişiklik geçmişi korunmalıdır.
- Sessizlikte hayalî konuşma, atlanan kelime, olumsuzluk ve rakam hataları ayrı kabul testleri olmalıdır.

## Bugünkü ürün durumu

MİHENK'e bu commit ile Türkçe duyarlı WER/CER hesaplayıcısı ve testleri eklendi. Bu, model karşılaştırma altyapısıdır; **ASR motoru değildir**. SEDA henüz uygulamaya bağlanmadı, model dosyaları uygulama paketine konmadı ve gerçek yerel pilot korpusu çalıştırılmadı. Bu kapılar tamamlanmadan ses tanıma özelliği hazır ilan edilmeyecektir.
