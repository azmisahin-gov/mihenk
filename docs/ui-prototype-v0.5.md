# MİHENK v0.5 UI prototipi — deneme notları

> **Amaç:** Kabul edilen Wireframe v0.5 ekranlarını tek bir masaüstü uygulamasında, birbirine bağlı gezinmeyle görsel olarak değerlendirmek.
>
> **Sınır:** Bu paket pilot yazılımı değildir. Gerçek vaka, kişi, dosya, ses veya transkript verisi kullanmayın.

## Prototip kapsamı

Bu mod, ekranları sentetik örneklerle birbirine bağlar:

- Görevlerim ve görev listesi
- Yeni görevlendirme / örnek taslak oluşturma
- Görev özeti ve görevlendirme alanları
- Materyal envanteri
- Çoklu kayıt listesi, kontrol önceliği ve tam transkript görünümü
- Örnek soru/yanıt ve dayanak bağlantısı
- Tek raporun iki sayfalı A4 yerleşim önizlemesi
- Bilirkişi Profili / Uzmanlık Alanlarım
- Uzmanlık Modülleri / 56.12 Motorlar ve Modeller
- Daraltılabilir ana menü

Etkileşimler yalnızca prototip ekranındaki görünümü değiştirir. Dosya seçimi/yüklemesi, OCR, gerçek ses oynatma, ASR, ses işleme, kasa kaydı, kalıcı görev kaydı, DOCX/ODT dışa aktarma, imza ve resmî teslim yapılmaz. Devre dışı araçlar bu nedenle çalışıyor gibi sunulmaz.

## Mevcut uygulamadan ayrım

Varsayılan açılışta mevcut MİHENK uygulaması çalışmaya devam eder. Prototip yalnızca derleme sırasında VITE_UI_PROTOTYPE=true verildiğinde açılır. Bu seçim mevcut şifreli kasa, ses işleme, ASR, transkript revizyonları ve rapor kodunu silmez veya değiştirmez.

Yerel geliştirme:

- PowerShell: $env:VITE_UI_PROTOTYPE="true"; npm run dev
- macOS/Linux: VITE_UI_PROTOTYPE=true npm run dev

Varsayılan uygulamayı açmak için değişkeni tanımlamayın veya false verin.

## Deneme paketleri

PR #46 doğrulama iş akışı, yalnızca bu PR için branch artifact'ları üretir:

- Linux: AppImage ve DEB
- Windows: NSIS kurulum dosyası ve MSI
- Artifact saklama süresi: 14 gün
- İmza yoktur; GitHub Release, preview etiketi veya otomatik güncelleme kanalı oluşturulmaz.

Paketleri PR #46 sayfasındaki Actions / Checks bölümünde ilgili workflow run'ın Artifacts alanından indirin. Her platform paketi yalnızca kendi işletim sisteminde denenmelidir.

## Görsel inceleme ölçütleri

1. Menü açık/dar hâli ve her ana bölüme dönüş.
2. Görev listesinden görev alanına geçiş ve altı görev sekmesi.
3. Yeni görevlendirmenin sabit wizard olmadan taslak akışını anlatması.
4. Beklenen/teslim alınan materyal ayrımı.
5. Birden çok kayıt, öncelik kuyruğu ve tam transkriptin aynı tezgâhta yer alması.
6. Konuşmacı etiketlerinin anonim kalması ve öncelik işaretlerinin doğruluk yüzdesi gibi sunulmaması.
7. Soruların sıralı olması ve yanıt-dayanak ilişkisinin görünmesi.
8. Tek rapor ve tüm A4 sayfalarının önizleme düzeni.
9. Profil uzmanlık alanları ile yazılım modülü ve motor ayarlarının ayrılması.

Görsel onay, gerçek işlev kabulü, güvenlik incelemesi, uzman kabulü veya UYAP uyumluluğu değildir. Bu kapılar sonraki aşamada ayrı kanıtlarla tamamlanacaktır.
