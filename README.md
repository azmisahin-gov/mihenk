# MİHENK — Masaüstü Uygulaması

> **Durum:** 56.12 ses çalışma alanı prototipi  
> **Sürüm:** 0.1.0  
> **Kullanım:** Geliştirme ve sentetik/açık test verisi

MİHENK, bilirkişilerin görevlerini tek bir yerel çalışma alanında yürütebilmesi için sıfırdan geliştirilen bütünleşik masaüstü uygulamasıdır.

Ürün keşfi, gereksinimler, mevzuat araştırması ve karar kayıtları [mihenk-arge](https://github.com/azmisahin-gov/mihenk-arge) deposunda tutulur. Bu depo yalnız uygulama kaynak kodunu, testlerini ve derleme/yayın süreçlerini içerir.

## Bu prototipte

- Birden fazla ses dosyasını belleğe alma ve listeleme.
- HTML5 destekli yerel ses oynatma.
- Oynatma konumunda transkript bölümü ekleme.
- Metin, zaman ve anonim konuşmacı etiketini elle düzenleme.
- Düzenlenmiş taslağı TXT veya JSON olarak kullanıcının cihazına dışa aktarma.
- Küçük dosyalarda tarayıcı içi SHA-256 ön kontrolü.

**Henüz bağlı olmayanlar:** ASR motoru, kalıcı görev/veri deposu, güvenli yerel dosya kasası, uzun dosyalarda akışlı hash, gerçek görev/rapor modeli ve UYAP/UDF entegrasyonu.

## Güvenli kullanım sınırı

Bu ilk arayüz prototipi, seçilen ses dosyalarını uygulama açık kaldığı sürece bellekte tutar. Uygulama kapatıldığında dosya seçimi ve düzenleme durumu kaybolur. Harici servise ses göndermez ve otomatik transkripsiyon yapmaz.

SHA-256 göstergesi yalnızca küçük dosyalardaki seçilmiş dosyanın ön kontrolüdür. Delil zinciri, teslim öncesi köken doğrulaması veya dosyanın özgünlüğü hakkında kanıt sayılmaz. 128 MiB üzerindeki dosyalarda bu prototip hash üretmez.

**Gerçek dava/soruşturma materyalini bu prototipte kullanmayın.** Gerçek materyalle kullanım için görev yalıtımı, kalıcı şifreli kasa, erişim kontrolü, yedekleme/geri yükleme, güvenli güncelleme ve hukuk/veri koruma incelemesi tamamlanmalıdır.

## Geliştirme

Gerekenler:
- Node.js 22.12 veya üzeri
- Rust stable 1.90 veya üzeri
- İşletim sistemine göre Tauri masaüstü ön koşulları

Komutlar:

```bash
npm install
npm run tauri:dev
```

Ön yüz denetimi ve derlemesi:

```bash
npm run check
npm run build
```

### Linux / Pardus notu

Tauri geliştirme ortamı Linux'ta WebKitGTK 4.1 ve derleme bağımlılıkları gerektirir. Dağıtıma göre paket adları değişebilir; kurulumdan önce Tauri'nin güncel Linux ön koşulları izlenmelidir.

### Windows notu

Tauri geliştirme ortamında Microsoft C++ Build Tools ve WebView2 gerekir.

## Teknoloji adayı

İlk masaüstü prototip, geçici olarak Tauri 2 + React + TypeScript + Vite kullanır. Bu seçim nihai platform mimarisi değildir; hedef cihaz, Windows/Pardus paketlemesi, kaynak tüketimi, güvenlik ve bakım denemelerinden sonra tekrar değerlendirilecektir.

## Lisans

Depo herkese açık olsa da kaynak kod için henüz açık kaynak lisansı verilmemiştir. Bu nedenle açık kaynak lisansı veya yeniden kullanım izni varsayılmamalıdır. Lisans kararı ayrıca yayımlanacaktır.

## Katkı ve dil

README, issue, pull request başlık/açıklamaları ve commit mesajları Türkçe tutulur. Teknik tanımlayıcılar, standart kod isimleri ve kütüphane/API adları özgün biçimlerinde kalabilir.
