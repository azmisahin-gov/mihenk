# MİHENK — Uygulama Deposu

> **Durum:** Gelecekteki uygulama geliştirmesi için ayrılmıştır; henüz uygulama kodu yoktur.

Bu depo, MİHENK uygulamasının sıfırdan geliştirilecek kaynak kodunu, testlerini, CI, derleme ve yayın süreçlerini barındırmak için ayrılmıştır.

Ürün keşfi, süreç araştırması, mevzuat, gereksinimler, kararlar ve mimari belgeler [mihenk-arge](https://github.com/azmisahin-gov/mihenk-arge) deposunda tutulur.

## Geliştirmeye başlama koşulları

Uygulama geliştirmesi; proje sahibi ürün kapsamını, ilk sürümü, mimari yaklaşımı, veri sınıflandırmasını, güvenlik modelini, depo görünürlüğünü ve lisans politikasını onayladıktan sonra başlar.

MİHENK temiz bir başlangıçla geliştirilecektir. Önceki Forensic Transcriber projelerinden kod, mimari, veri şeması, bağımlılık, bileşen veya paket kopyalanmayacak/taşınmayacaktır.

## Depo güvenliği

- Bu depo şu anda **public** durumdadır. Eklenen her dosya ve commit herkese açık kabul edilmelidir.
- Gerçek dava dosyası, ses/görüntü, rapor, mahkeme evrakı, UYAP ekran görüntüsü, dosya numarası, taraf/bilirkişi kimliği, kişisel/özel nitelikli veri veya gizli bilgi commit edilmez.
- Parola, token, e-imza sertifikası, özel anahtar, üretim logu veya kimlik doğrulama bilgisi kaynak kodunda, testlerde, fixture'larda veya issue'larda bulunmaz.
- Public görünürlük tek başına açık kaynak lisansı anlamına gelmez. İlk uygulama kodu eklenmeden önce deponun public/private kararı ve lisans politikası proje sahibi tarafından bilinçli biçimde onaylanmalıdır.

## Dil ve katkı standardı

MİHENK'in kullanıcıya dönük belgeleri, README, issue, pull request başlık/açıklamaları ve commit mesajları Türkçe yazılır. Kod içindeki standart teknik isimler ve kütüphane/API adları özgün biçimlerinde kalabilir.

## İlgili depo

- [MİHENK Araştırma, Ürün Keşfi ve Proje Yönetimi — mihenk-arge](https://github.com/azmisahin-gov/mihenk-arge)
