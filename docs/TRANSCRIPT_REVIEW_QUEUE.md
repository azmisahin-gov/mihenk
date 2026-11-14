# Transkript inceleme kuyruğu

İnceleme paneli aynı görevdeki aktif ses materyalinin transkript segmentlerini dört görünümde filtreleyebilir:

- **Tümü:** tüm segmentler.
- **Kontrol bekliyor:** `uzman-onayli` durumunda olmayan bütün segmentler; taslak ve belirsiz kayıtları içerir.
- **Belirsiz:** durumu `belirsiz` olan veya anotasyon türü kısmen/anlaşılmayan konuşma olarak işaretlenmiş segmentler.
- **Uzman onaylı:** durumu açıkça `uzman-onayli` olarak işaretlenen segmentler.

Sayaçlar aktif ses kaydının segmentleri üzerinden hesaplanır. Filtreleme yalnızca görünümü değiştirir; segment metnini, zaman kodunu, anotasyonu, kontrol durumunu veya revizyon geçmişini değiştirmez. Boş sonuçta açıklayıcı mesaj gösterilir; kayıtlar otomatik silinmez, onaylanmaz veya başka duruma geçirilmez.

Bu ilk dilim tam görevler arası bir inceleme kuyruğu değildir: başka bir kayda ait segmentleri tek ortak listede birleştirmez, yeniden dinleme isteği için bağımsız kalıcı bir durum üretmez ve uzmana görev/segment ataması yapmaz. Bu davranışlar için ayrı veri modeli ve uzman pilot kabulü gerekir.
