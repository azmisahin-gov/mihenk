# MİHENK çalışma alanı gezinmesi

Ana menüdeki Görevler, Ses çalışma alanı, Transkriptler ve Raporlar öğeleri artık devre dışı yer tutucu değildir. Her öğe mevcut tek sayfalı masaüstü çalışma alanındaki ilgili bölüme yumuşak kaydırma yapar.

- Görevler: görev/atama profili ve soru yanıtları.
- Ses çalışma alanı: aktif ses oynatıcı ve gerçek decoder dalga biçimi. Aktif ses yoksa materyal listesine gider ve seçim gerektiğini bildirir.
- Transkriptler: zaman bağlantılı segment inceleme ve düzeltme alanı.
- Raporlar: aktif görev için TXT/DOCX/ODT/JSON dışa aktarma alanı. Aktif kayıt yoksa transkript alanına gider ve önce kayıt seçilmesini ister.

Gezinme hedefleri klavye odağı alabilir; seçilen menü öğesi `aria-current` ile işaretlenir. Bu değişiklik ayrı route veya çok sayfalı yönlendirme getirmez; tek çalışma alanı içindeki bölüm gezinmesidir. Manuel kaydırma menü seçimini otomatik değiştirmez; menü aktifliği son seçilen gezinme eylemini gösterir.

Issue #32'nin bütün kapsamı tamamlanmış değildir: tam iş kuyruğu/ilerleme akışı, responsive ve erişilebilirlik saha testi, uzman gözetimli kullanılabilirlik oturumu, raporun tam teslim akışı ve Windows/Linux temiz kurulum/geri yükleme E2E testleri ayrıca gereklidir.
