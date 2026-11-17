# İz Sayacı (GPS, donanımsız)

Telefonun GPS'iyle çalışır; pusula ve sensör kullanmaz. AgOpenGPS'ten esinlenmiştir
(AB hattı + numaralı paralel sıralar + tramline), kodu kopyalanmamıştır.

## GitHub Pages'e yükleme (telefondan da yapılabilir)
1. github.com → **New repository** → ad: `iz-sayaci` → Public → Create.
2. **Add file → Upload files**: bu klasördeki `index.html`, `core.js`, `app.js`, `sw.js`, `manifest.json` ve `icons` klasörünü yükle → **Commit**.
3. **Settings → Pages** → Source: *Deploy from a branch* → Branch: `main` / `(root)` → Save.
4. 1-2 dk sonra adres: `https://KULLANICIADIN.github.io/iz-sayaci/`
5. Telefonda Chrome ile aç → ⋮ menü → **Ana ekrana ekle**. Konum iznini "Her zaman/Uygulama kullanırken" ver.

## Kullanım
1. Ayarlar: çalışma genişliği (m) ve kaç sırada bir iz.
2. Tarlada ilk sıraya girince **A NOKTASI**'na bas, düz sür. 40 m sonra hat otomatik kurulur.
3. Dönüşlerde sıra otomatik sayılır. İz sırası **dönüş sırasında önceden** (kırmızı "İZ AÇ!") uyarılır.
4. İz sırası yanlış başladıysa: iz açacağın sırada **Bu iz sırası**'na bas. Yanlış sayımda **+/− Sıra** ile düzelt.

## Harita ve tarlalar
- Alttaki **Harita** sekmesi: sıra çizgileri (iz sıraları kesikli), gidilen yerin boyaması, araç oku. Boyama genişliği = çalışma genişliği.
- İz sırası ayrı renkte boyanır. Renkler **Ayarlar**'dan seçilir (normal / iz sırası).
- **Alet GPS'ten kaç metre geride** ayarı: telefon traktörde, alet arkada ise boyama o kadar geriye kaydırılır.
- Üstteki **Tarla** düğmesi: yeni tarla ekle, tarlalar arası geç, adlandır, boyamayı sil. Her tarlanın boyaması ve sıra durumu telefonda saklanır.
- Harita düğmeleri: + / − yakınlaştır, **Yön/Kuzey** dönüş modu, **Tüm/Takip** tüm tarlayı göster.
- Sınır: kayıtlar telefonun tarayıcı deposundadır (~5 MB). Tarayıcı verisini silersen kayıtlar gider.

## Aletler, tarla bilgisi, rapor, yedek
- **Ayarlar → Aletler:** Arkaya takılan aletin adını ve genişliğini yaz (ör. Mibzer 4 m, Püskürtme 12 m). Seçtiğin alet sıra çizgilerini ve boyama genişliğini belirler. Her tarla kendi aletini hatırlar. Genişlik değişirse sayaç sıfırlanır (boyama silinmez).
- **Püskürtme genişliği:** Ayarlarda girersen iz aralığı otomatik hesaplanır (12 m ÷ 4 m = her 3 sırada bir). Oran tam sayı değilse veya çiftse uyarır.
- **Tarla → Bilgi:** Ürün, tohum miktarı (kg/dekar), ekim tarihi, alet, not.
- **Rapor:** Benzersiz boyalı alan (dekar), çakışma %, boşluk %, tahmini tohum. GPS hatası dahildir, rakamlar yaklaşıktır; tarla uçları hesaba katılmaz.
- **GPX / CSV:** Tarla bilgisi ekranından indirilir (boyama izleri).
- **Yedek al / Yükle:** Tarla listesi ekranının altında. Yedek, tüm tarlaları ve ayarları tek .json dosyasına alır. Yüklerken mevcut veriler silinir.

## Önemli notlar
- Ekranı açık tut (uygulama ekranı uyanık tutar). Ekran kapanırsa tarayıcı GPS'i durdurabilir.
- Sürüş yardımcısıdır; direksiyon/ekipman kontrol etmez. İlk kullanımda sayımı gözle doğrula.
- Dar çalışma genişliği (≤4 m) + zayıf GPS'te hata artar. Sıra atlamayı yalnızca gerekirse aç.
- Test: `node test/sim.js` (gürültülü GPS simülasyonu).
