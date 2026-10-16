# UMBRA

**Limbo'nun hissi, farklı bir mekaniğe sahip, sisli ve yağmurlu 2.5D karanlık platformer.**

Kahraman bir **penguen**: yürür, zıplar, merdiven çıkar, sandık iter/çeker ve arkasından
gelen bir avciden kaçar. Oyun, oyun mantığı (fizik, bulmaca, aşamalar) ile görsel katman
(Three.js) tamamen birbirinden ayrılmış iki katmandan oluşur. Bu sayede oyun mantığı
tarayıcı olmadan Node'da test edilebilir — `test/smoke.mjs` bunu yapar ve 20 doğrulama
içerir.

> Limbo'nun (Playdead) asıl kodu kapalı kaynaklıdır; burada onların hiçbir varlığı
> (grafik, ses, karakter) kullanılmıyor. Tüm görseller ve sesler kodla üretiliyor.

---

## Mekanikler

Zıplamanın ötesinde beş temel mekanik var:

| Mekanik | Nasıl çalışır |
| ------- | ------------- |
| **Sandık it / çek** | `E` ile tut, yürüyerek sürükle; bırakınca bırakır. Tünelde **çekmek** zorunda kalırsın (kasa tavandan geçmez, zıplanamaz). |
| **Merdiven** | `W` / `S` (veya `↑` `↓`) ile in-çık; tepeden yana geçerek çık, `SPACE` ile merdivenden atla. |
| **Hareketli platform** | Boşlukta süzülen platformlar seni ve taşıdığın kasayı taşır; zamanla yakalan. |
| **Diken / çukur** | Temas ölüm. Çukura düşülür, dikenlere basılır. |
| **Avcı** | Kaçış aşamasında arkandan bir şey koşuyor; yakalanırsan ölürsün. |

**Sandık bulmacası (Aşama II):** alçak bir geçitte sıkışan 80px'lik kasa, tavan yüzünden
üstüne zıplanamaz — kasayı **geri yürüyerek çekmek** zorundasın, sonra üstüne zıplayıp
sekiyorsun. İtiş/çekiş hissi için kasayı iten oyuncu da duvara dayanınca durur.

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

Hareketli platformlar harita satırında değil, aşama tanımında `{ col, row, w, axis, dist, speed, phase }` ile bildirilir.

## Aşamalar

| # | Aşama | Ne öğretir |
| - | ----- | ---------- |
| I | **Uyanış** | Hareket, zıplama, teras, dikenler |
| II | **Yük** | Alçak geçitte sandık **çekme**, üstüne zıplama |
| III | **Merdiven** | İki merdivenle dikey iniş-çıkış, şimşek |
| IV | **Hareket** | Üç hareketli platformla boşluk geçişi |
| V | **Kaçış** | Avcıdan kaçış: çukur, platform, diken, kasa itme |

Her aşamanın kendi ambiyansı var: sis yoğunluğu, yağmur şiddeti, ışık rengi, bloom.

## Kontroller

| Tuş | Aksiyon |
| --- | ------- |
| `A` `D` / `←` `→` | Yürü |
| `SPACE` | Zıpla (basılı tut = daha yüksek) · merdivenden atla |
| `W` `S` / `↑` `↓` | Merdivende in-çık |
| `E` | Sandık tut / bırak |
| `R` | Aşamayı baştan başlat |

---

## Teknik

### Mimari

```
index.html              sahne, HUD, açılış perdesi (CSS: letterbox, grain, vinyet)
src/main.js             olay döngüsü: world durumu → ses + görsel senkron
src/game/world.js       OYUN MANTIĞI — render kütüphanesi import etmez
src/core/physics.js     AABB süpürme fizigi (alt adımlı, tünellemeye karşı)
src/core/audio.js       Prosedürel ses (WebAudio, sıfır ses dosyası)
src/core/input.js       Klavye + kenar (edge) algılama
src/render/scene.js     Three.js sahnesi: ışık, gölge haritası, sis, yağmur, DOF, bloom
src/render/terrain.js   Katmanlı ortam: dağ silüetleri, zemin perdesi, kadraj kütleleri
src/render/character.js Prosedürel penguen iskeleti + animasyon + avcı figürü
src/levels/index.js     Aşama verisi (harita + ambiyans + platformlar)
test/smoke.mjs          Kafaüstü duman testi (Node, render yok — 20 doğrulama)
test/three-stub.mjs     "three" stub'ı: geometri mantığını Node'da test etmek için
```

### Karakter

Penguen tamamen kodla kurulmuş küre + kutu parçalardan oluşur (sculpt/rig'lenmiş model
YOK — dürüst not). Yan görünümde bacaklar ve kanatlar **`rotation.z`** ile sallanır
(yanal salınım kameradan görünür); eski `rotation.x` hatası uzuvları kameradan
uzaklaştırıp yaklaştırırdı — yan oyunda görünmezdi. Yürüyüş/koşu hızla yumuşak geçişle
birleşir, kalçada yalpalama (`rotation.x`) ve öne eğilme (`rotation.z`) ile penguen
yürüyüşü taklit edilir. İnişte hafif squash.

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
- **Şimşek** (Aşama III): ışık parlaması + gecikmeli gürültü
- **Bloom** (UnrealBloomPass), ACES tone mapping, letterbox, film grain, vinyet
- Bloklar `InstancedMesh`; zemin neredeyse saf siyah. Sandık, merdiven ve hareketli
  platformlar ayrı mesh'ler olarak çizilir.

### Ses

Sıfır ses dosyası; her şey WebAudio ile sentezleniyor: yağmur (brown gürültü + bant geçiren +
LFO dalgalanma), rüzgar, zıplama (yumuşak "hup"), iniş, adım, sandık tut/bırak, merdiven
tıkı, ölüm (boğuk çakılış), kontrol noktası zili, çıkış, şimşek gürültüsü.

### Test

```bash
npm test        # node test/smoke.mjs
```

Doğrulananlar: harita bütünlüğü (satır/karakter), doğuş/çıkış güvenliği (çıkış altı zemin),
zıplama/koşu değerleri, diken/çukur ölümü + yeniden doğuş, kontrol noktaları,
**sandık tut/çek/bırak**, **merdivene giriş + tırmanış + üstten çıkış**, **hareketli
platform taşıması**, avcının yakalaması, **faz mekaniğinin tamamen kaldırıldığı**,
`KeyE` girdisi, **zemin perdesi geometrisi** (NaN/indeks/diken görünürlüğü) ve gürültü
determinizmi.

**Test etmeyenler:** render/görsel kompozisyon, ses karışımı, FPS. Bunlar tarayıcıda sende.

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
- [x] Prosedürel penguen iskeleti + animasyon (rotation.z düzeltmesiyle)
- [x] Sandık it/çek, merdiven, hareketli platform mekanikleri
- [x] 5 aşama (sonuncusu kaçış sahnesi)
- [x] Prosedürel ses motoru
- [ ] Kayıtlı müzik/ses (CC0 lisanslı, kaynak doğrulanmış)
- [ ] Daha zengin figürler (rig'lenmiş glTF modelleri — harici asset gerekir)
- [ ] Mobil dokunmatik kontroller
- [ ] Bölüm seçimi ve kayıt

## Lisans

MIT
