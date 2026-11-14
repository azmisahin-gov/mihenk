# Görev soruları, uzman yanıtları ve rapor kalite kontrolü

Bu belge Issue #33 için uygulanan ilk rapor dikey dilimini açıklar.

## Görev bazlı yanıt modeli

- Her görev sorusu için ayrı yanıt alanı vardır.
- Yanıtlar seçili görev/atama kaydının Stronghold şifreli metadata'sında saklanır.
- Her yanıt, aynı görev alanındaki bir veya daha fazla transkript segmentine bağlanabilir. Referans biçimi ses materyali kimliği ile segment kimliğini birleştirir.
- Rapor oluşturulurken dayanaklar yalnızca aktif görev alanındaki seslerden çözülür; başka görevlerin segmentleri UI seçicisinde veya rapor girdisinde bulunmaz.
- Soru metni değişir veya kaldırılırsa eski yanıt sessizce silinmez; artık etkin olmayan soru yanıtları görev profilinde kurtarılabilir kayıt olarak kalır.
- Yanıt veya dayanak güncellemesi kaydedilmemişse DOCX/ODT dışa aktarma engellenir. Kullanıcı önce görev profilini kaydetmelidir.

## Rapor ve kalite kontrolü

DOCX/ODT çalışma taslağı her sorunun yanıtını ve seçilen zaman kodlu destek segmentlerini içerir. Aşağıdaki kontroller rapora açık sonuçlarıyla eklenir:

- Her görev sorusunun yanıtlanması.
- Her dayanak referansının mevcut görev segmentine çözülmesi ve yanıtı olan sorularda en az bir dayanak bulunması.
- Rapor kapsamındaki segmentlerin uzman kontrolü olarak işaretlenmesi.
- Kaynak dosya adı, boyutu ve SHA-256 ön kontrolü.
- Ses süresinin envanterde bulunması.
- Yetkili uzman tarafından teslim öncesi son insan incelemesi.

Son insan incelemesi bu prototipte daima BEKLİYOR durumundadır. Hiçbir kontrol listesi çıktıyı kendiliğinden nihai/teslim edilmiş yapmaz. HASH ve GCM bütünlük kontrolleri kaynak kökenini veya sesin özgünlüğünü ispatlamaz.

## Açık kalanlar

Bu dikey dilim DOCX/ODT taslaklarını geliştirir; PDF çıktısı, Word/LibreOffice gerçek uygulama biçim testi, sürümlü şablon yönetimi, kaynak/ek hash manifesti, tam teslim paketi ve bağımsız kullanıcı onay akışı tamamlanmış değildir. SEDA model/runtime/parametre meta verisinin her ASR koşusuna bağlanması ve çoklu materyalli tam rapor envanteri ayrıca tamamlanmalıdır. UYAP veya e-imza otomasyonu yapılmaz.

Gerçek dava veya soruşturma materyali CI, issue, PR veya test fixture'ına konmamalıdır; yalnızca sentetik/açık lisanslı test verileri kullanılmalıdır.
