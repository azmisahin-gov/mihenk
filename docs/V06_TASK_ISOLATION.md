# Görev veri yalıtımı — ilk v0.6 geliştirme dilimi

**Durum:** Uygulama dalında; CI ve inceleme bekliyor  
**Kapsam:** Mevcut Stronghold kasa veri modelini değiştirmeden görev sahipliği ve soru-dayanak referanslarını yazım sınırında doğrulamak.

## Gözlem

Mevcut uygulama ses listesini arayüzde `assignmentId` ile filtreliyor ve içe alma sırasında görev kimliğini doğruluyor. Bununla birlikte `saveStoredAudioMetadata` güncellenen metadata içindeki görev kimliğini mevcut kayıtla karşılaştırmıyordu. Ayrıca görev profilindeki `supportingSegmentRefs` biçimsel olarak doğrulansa da referansın etkin görevin kayıtlı segmentlerinden birine ait olduğu kalıcı yazımda doğrulanmıyordu.

Arayüz filtresi tek başına veri bütünlüğü sınırı değildir.

## Değişiklik

- Ses metadata kaydı güncellenirken mevcut kasa kaydı okunur.
- Ses materyalinin `assignmentId` değeri değiştirilemez.
- Kaynağın kimliğini ve şifreli blok yapısını belirleyen dosya adı, medya türü, boyut, parça boyutu/sayısı, nonce öneki, SHA-256 ve biçim sürümü değiştirilemez. Transkript segmentleri ve dalga biçimi önbelleği güncellenebilir.
- Etkin soruların dayanak referansları, aynı görevin kayıtlı ses segmentleriyle eşleşmelidir.
- Bir segment düzenlenirken veya ses materyali silinirken, etkin soru yanıtlarının kullandığı son dayanak sessizce koparılamaz; önce soru yanıtındaki dayanak bağlantısı kaldırılmalıdır.
- Kasa kaydı geri yüklenirken `questionAnswers` alanı normalize edilmiş görev kaydına taşınır; eski kasalarda alanın hiç bulunmaması geriye dönük uyumludur, bozuk mevcut alan ise sessizce boş listeye çevrilmez.
- Silinmiş soruların kurtarılabilir eski yanıtları saklanır; etkin rapor dayanağı kontrolüne dahil edilmez.
- Sentetik negatif testler aynı görev dışındaki materyal ve segment referanslarının reddedildiğini doğrular.

## Karar ve alternatifler

**Karar:** Var olan şifreli Stronghold deposunu ve veri biçimini koruyarak mevcut yazım fonksiyonlarına alan katmanı doğrulaması eklemek.

**Alternatif:** Bütün kasa şemasını yeni Task/Material/Evidence tablolarına taşımak. Bu, eski kasalar için migrasyon ve geri dönüş riski doğurur; bu küçük dilimin kapsamı için gereksizdir.

**Risk:** Bu koruma tek uzmanlı yerel uygulamadaki uygulama katmanı bütünlüğünü güçlendirir; işletim sistemi hesabı ele geçirilmesi, kasa anahtarının kötüye kullanılması veya bağımsız güvenlik denetimi risklerini ortadan kaldırmaz. Eşzamanlı çok kullanıcılı erişim kapsam dışıdır.

## Kabul kanıtı

- `tests/task-isolation.test.mjs`: sahiplik değişikliği, görev dışı dayanak ve kaldırılmak istenen segmentin etkin soruda dayanak olarak kullanılması için negatif testler.
- `tests/assignment.test.mjs`: kasa normalizasyonunun uzman yanıtlarını ve dayanak referanslarını koruduğunu, eski kayıtlarla geriye dönük uyumluluğu ve bozuk yanıt listesinin reddini doğrular.
- `npm test`, TypeScript denetimi ve Rust/Tauri CI sonuçları çekme isteği üzerinde izlenecektir.
- Bu değişiklik OCR/ASR iş kuyruğu, kanonik ReportDocument veya tam K-01–K-12 kabulini tamamlamaz.
