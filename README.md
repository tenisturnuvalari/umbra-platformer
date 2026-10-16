# UMBRA

**Limbo'nun hissi, farklı bir mekaniğe sahip, sisli ve yağmurlu 2.5D karanlık platformer.**

Bu bir **yürüyüş oyunu**: kahraman bir **penguen** — yürür, basamaklara zıplamadan
tırmanır, merdiven çıkar, sandık iter, hareketli platforma biner ve arkasından gelen
bir avciden kaçar. **Zıplama birincil eylem değildir**: yalnızca ~46px'lik küçük bir
"hop"tur; 80px'lik sandığın üstüne ve yüksek duvarlara ZİPLANAMAZ.

Oyun **tek bir kesintisiz dünyada** geçer: **5 bölüm bitişiktir**, aralarında yükleme
veya durma yoktur. Her bölüm yürüyerek **~45-60 saniyede** geçilir; HUD başlığı ve
ambiyans (sis, yağmur, ışık) oyuncunun X konumuna göre yumuşakça kayar. Bölüm I yalnız
`D` tuşuyla bitirilebilir — bunu test doğrular. Oyun, oyun mantığı (fizik, bulmaca,
bölümler) ile görsel katman (Three.js) tamamen birbirinden ayrılmış iki katmandan
oluşur. Bu sayede oyun mantığı tarayıcı olmadan Node'da test edilebilir —
`test/smoke.mjs` 26 doğrulama yapar, `test/play.mjs` ise dünyayı baştan sona oynayan
bir botla tamamlanabilirliği doğrular.

> Limbo'nun (Playdead) asıl kodu kapalı kaynaklıdır; burada onların hiçbir varlığı
> (grafik, ses, karakter) kullanılmıyor. Tüm görseller ve sesler kodla üretiliyor.

---

## Mekanikler

Yürüyüş çekirdektir; geri kalanı onu tamamlar:

| Mekanik | Nasıl çalışır |
| ------- | ------------- |
| **Yürü + basamak** | `A` / `D` ile yürü; **1 karoluk (40px) basamaklar zıplamadan otomatik tırmanılır/inilir** (`stepUp` / `stepDown`). |
| **Küçük zıplama** | `SPACE` ~46px'lik hoptur (basılı tut biraz daha yüksek). Küçük boşluklar ve his için; sandık/duvar üstüne değil. |
| **Sandık it** | Basitçe sandığa doğru yürü — itilir. `E` ile tutup sürükleyerek **çekebilirsin** (itme/çekme her ikisi de var). |
| **Merdiven** | `W` / `S` (veya `↑` `↓`) ile in-çık; tepeden yana geçerek çık, `SPACE` ile merdivenden atla. |
| **Hareketli platform** | Boşlukta süzülen platform kıyıları birleştirir; zamanlamaya bağlı, **zıplamadan binilir**. |
| **Diken / çukur** | Temas ölüm. Boşluğa düşülür, dikenlere basılır. |
| **Avcı** | Kaçış bölümünde (Bölüm V) arkandan bir şey koşuyor; yakalanırsan ölürsün. |

**Sandık bulmacası (Bölüm II):** alçak bir tünelin önünde duran 80px'lik kasa, tavan
yüzünden üstüne zıplanamaz — kasayı **ileri iterek** tünelin içinden geçirirsin (oyuncu
tünelden rahat geçer, kasa da kayar). İttiğin kasa sıradaki **çukura düşer** ve sen
atlayıp yoluna devam edersin (yumuşak kilit yok). `E` ile tutup geri yürüyerek
**çekmek** de mümkündür (mekanik test edilir); amaç gerekli itmeyi kolaylaştırmaktır.

**Harita sözdizimi:**

| İşaret | Anlamı |
| ------ | ------ |
| `#`    | Katı zemin / duvar |
| `^`    | Diken — temas ölüm |
| `P`    | Başlangıç |
| `E`    | Çıkış |
| `C`    | Kontrol noktası |
| `L`    | Merdiven (dikey küme) |
| `B`    | Sandık (40×80, itilip çekilebilir) |

Hareketli platformlar harita satırında değil, `WORLD.platforms` içinde
`{ col, row, w, axis, dist, speed }` ile bildirilir (Bölüm IV'te üç adet).

## Dünya ve Bölümler

Oyun **tek geniş bir haritada** (1867 sütun ≈ 74.660px) geçer; bölümler bitişiktir.
Oyuncunun X konumu hangi bölümde olduğunu belirler (`SECTIONS[i].from/to`); HUD başlığı
ve ambiyans bu konuma göre kayar. Toplam oyun ~4-5 dakikadır.

| # | Bölüm | Ne öğretir | Yaklaşık süre |
| - | ----- | ---------- | ------------ |
| I | **Uyanış** | Saf yürüyüş: teraslı zemin, yukarı/aşağı basamaklar, dikenli köprüler — `D` ile bitirilebilir | ~54 sn |
| II | **Yük** | Alçak tünelde üç sandık **itiş**; her kasa çukura itilir, üstüne zıplanamaz | ~53 sn |
| III | **Merdiven** | Merdivenle çıkıp boşluk üstündeki uzun sırıkta yürü | ~50 sn |
| IV | **Hareket** | Üç hareketli platformla kıyılar arası geçiş (zamanlama) | ~54 sn |
| V | **Kaçış** | Avcıdan kaçış: arkanda koşar, **durma**; dikenli geçitleri aş, çıkışa koş | ~50 sn |

Her bölümün kendi ambiyansı var: sis yoğunluğu, yağmur şiddeti, ışık rengi, bloom.
`chaseFrom` avcıyı yalnız Bölüm V başlangıcında başlatır; ölünce avcı arkadan 620px'ye
sıfırlanır (ölüm döngüsü olmaz).

## Kontroller

| Tuş | Aksiyon |
| --- | ------- |
| `A` `D` / `←` `→` | Yürü (basamaklar otomatik tırmanılır) |
| `SPACE` | Küçük zıpla (basılı tut = biraz daha yüksek) · merdivenden atla |
| `W` `S` / `↑` `↓` | Merdivende in-çık |
| `E` | Sandık tut / bırak (tutunca yürüyerek çek) |
| `R` | Baştan başlat (kontrol noktası sıfırlanır) |

---

## Teknik

### Mimari

```
index.html              sahne, HUD, açılış perdesi (CSS: letterbox, grain, vinyet)
src/main.js             olay döngüsü: world durumu → ses + görsel senkron (bölüm takibi)
src/game/world.js       OYUN MANTIĞI — render kütüphanesi import etmez
src/core/physics.js     AABB süpürme fizigi (alt adımlı, tünellemeye karşı)
src/core/audio.js       Prosedürel ses (WebAudio, sıfır ses dosyası)
src/core/input.js       Klavye + kenar (edge) algılama
src/render/scene.js     Three.js sahnesi: ışık, gölge haritası, sis, yağmur, DOF, bloom
src/render/terrain.js   Katmanlı ortam: dağ silüetleri, zemin perdesi, kadraj kütleleri
src/render/character.js Prosedürel penguen iskeleti + animasyon + avcı figürü
src/levels/index.js     Dünya verisi (tek harita: WORLD + SECTIONS + platformlar)
test/smoke.mjs          Kafaüstü duman testi (Node, render yok — 26 doğrulama)
test/play.mjs           Oynayan bot: dünyayı baştan sona geçer, bölüm sürelerini ölçer
test/three-stub.mjs     "three" stub'ı: geometri mantığını Node'da test etmek için
```

Dünya verisi `gen-levels.mjs` ile üretilir (satır genişliği/karakter doğrulaması yapar,
`src/levels/index.js`'e yazar). Geniş harita için **x-ekseni pencereleme** uygulanır:
çarpışma süpürmesi, sandık çarpışması ve render yalnız oyuncunun çevresini işler —
`pSolids` harita genişliğinden bağımsız olarak ~34-334 katıda kalır (ölçüm: kare
maliyeti 0.09-0.13ms).

### Karakter

Penguen tamamen kodla kurulmuş küre + kutu parçalardan oluşur (sculpt/rig'lenmiş model
YOK — dürüst not). **1.5× büyütülmüştür** (görsel; çarpışma kutusu 28×40'ta kalır).
Yan görünümde bacaklar ve kanatlar **`rotation.z`** ile sallanır (yanal salınım
kameradan görünür); eski `rotation.x` hatası uzuvları kameradan uzaklaştırıp
yaklaştırırdı — yan oyunda görünmezdi. Yürüyüş/koşu hızla yumuşak geçişle birleşir,
kalçada yalpalama (`rotation.x`) ve öne eğilme (`rotation.z`) ile penguen yürüyüşü
taklit edilir. İnişte hafif squash.

### Görsel katman

**Derinlik, doku değil katmanla kurulur** (Limbo'nun asıl sırrı budur):

- **Three.js r170**, perspektif kamera; mesafe FOV'dan türetilir → ekranda tam
  `görüş × görüş` dünya birimi görünür, oyunun px değerleri ekranda birebir okunur
- **5 katmanlı atmosferik perspektif**: uzak sırt silüetleri uzağa doğru gökyüzüne
  solar (`buildRidge`), her katman kendi paralaks hızıyla kayar
- **Organik zemin perdesi** (`buildTerrainCurtain`): kutu ızgarasının üstünü örten,
  gürültüyle oluşmuş eğri üst kenar. Çarpışma ızgarada kalır; perde yalnızca görsel
  olduğu için ayaklar zemine hafifçe gömülür. Çukur/diken sütunlarında perde inmez.
- **Kadrajı kapatan yakın kütleler** (`buildForeground`): kameraya yakın, DOF ile
  bulanıklaşan karanlık kayalar → Limbo'daki çerçeveleme hissi
- **Derinlik alanı (BokehPass)**: odak oyuncuda takip edilir; uçlar bulanık, oyun
  düzlemi keskin. Kurulamazsa atlanır
- **Gerçek gölge haritası**: yön ışığı (2048², PCF yumuşak) + oyuncunun feneri (1024²)
- **FogExp2** +16 adet kayan sis kartı, **yağmur** `LineSegments` ile prosedürel
- **Şimşek** (Bölüm III): ışık parlaması + gecikmeli gürültü; ambiyan geçişinde
  yumuşak harmanlanır (`aimAmbience` / `_blendAmbience`)
- **Bloom** (UnrealBloomPass), ACES tone mapping, letterbox, film grain, vinyet
- Bloklar `InstancedMesh`; zemin neredeyse saf siyah. Sandık, merdiven ve hareketli
  platformlar ayrı mesh'ler olarak çizilir. Avcı (`Creature`) her zaman kurulur ama
  yalnız `world.chase` görünür.

### Ses

Sıfır ses dosyası; her şey WebAudio ile sentezleniyor: yağmur (brown gürültü + bant geçiren +
LFO dalgalanma), rüzgar, zıplama (yumuşak "hup"), iniş, adım, sandık tut/bırak, merdiven
tıkı, ölüm (boğuk çakılış), kontrol noktası zili, çıkış, şimşek gürültüsü.

### Test

```bash
npm test        # smoke.mjs (26 doğrulama) + play.mjs (tam dünya geçişi)
```

`test/smoke.mjs` doğrulayanlar: harita bütünlüğü (satır/karakter), **bölüm yapısı
(bitişik, her biri ~45-60s yürüyüş)**, **chaseFrom ile avcının yalnız Bölüm V'de
başlaması**, doğuş/çıkış güvenliği, **küçük zıplama (~46px) ve koşu hızı**, **basamak
yukarı/aşağı tırmanma (zıplamasız)**, **Bölüm I'i yalnız `D` ile geçme**, diken/çukur
ölümü + yeniden doğuş, kontrol noktaları, **sandık tut/çek/bırak**, **merdivene giriş +
tırmanış + üstten çıkış**, **hareketli platform taşıması**, avcının yakalaması +
**yeniden doğuşta avcının sıfırlanması**, `KeyE` girdisi, **zemin perdesi geometrisi**
(NaN/indeks/diken görünürlüğü) ve gürültü determinizmi.

`test/play.mjs` bir botla dünyayı **baştan sona** oynar; tüm 5 bölümü geçtiğini ve
bölüm sürelerini raporlar (elle `node test/play.mjs` ile çalıştır).

**Test etmeyenler:** render/görsel kompozisyon, ses karışımı, FPS, insan hissi
(zamanlama, zorluk algısı). Bunlar tarayıcıda sende.

---

## Çalıştırma

ES modülü + CDN kullanıldığı için `file://` ile açılmaz:

```bash
npm start          # npx serve
# veya
python -m http.server 8080
```

GitHub Pages üzerinde build adımı olmadan çalışır: `https://tenisturnuvalari.github.io/umbra-platformer/`

## Yol haritası

- [x] 3D sahne, gölge haritası, sis, yağmur, şimşek
- [x] Prosedürel penguen iskeleti + animasyon (rotation.z düzeltmesiyle, 1.5× boyut)
- [x] **Yürüyüş odaklı yeniden tasarım**: stepUp/stepDown, küçük zıplama
- [x] Sandık it/çek, merdiven, hareketli platform mekanikleri
- [x] **Tek kesintisiz dünya**: 5 bölüm bitişik, geçişte durma yok, ~45-60 sn/bölüm
- [x] Prosedürel ses motoru
- [ ] Derin sandık bulmacaları (çekmeyi zorunlu kılan, softlock'suz tasarım)
- [ ] Kayıtlı müzik/ses (CC0 lisanslı, kaynak doğrulanmış)
- [ ] Daha zengin figürler (rig'lenmiş glTF modelleri — harici asset gerekir)
- [ ] Mobil dokunmatik kontroller
- [ ] Bölüm seçimi ve kayıt

## Lisans

MIT
