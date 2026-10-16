# UMBRA

**Limbo'nun hissi, farklı bir mekaniğe sahip, sisli ve yağmurlu 2.5D gölge platformer.**

Oyun, oyun mantığı (fizik, bulmaca, aşamalar) ile görsel katman (Three.js) tamamen
birbirinden ayrılmış iki katmandan oluşur. Bu sayede oyun mantığı tarayıcı olmadan
Node'da test edilebilir — `test/smoke.mjs` bunu yapar ve 18 doğrulama içerir.

> Limbo'nun (Playdead) asıl kodu kapalı kaynaklıdır; burada onların hiçbir varlığı
> (grafik, ses, karakter) kullanılmıyor. Tüm görseller ve sesler kodla üretiliyor.

---

## Mekanik: faz sistemi

Dünya, üst üste binen iki fazdan oluşuyor:

| İşaret | Anlamı |
| ------ | ------ |
| `#`    | **Her fazda katı** zemin — asla kaybolmaz |
| `l`    | Yalnız **Işık** fazında katı platform |
| `s`    | Yalnız **Gölge** fazında katı platform |
| `^`    | Diken — her fazda ölüm |

`SHIFT` ile faz değiştirirsin. Ayaklarının altındaki platform o an kaybolur; bu yüzden
asıl bulmaca "ne zaman değiştiririm"dir.

**Dizayn ilkesi:** zemin asla kaybolmaz, sadece *üzerinde durduğun platform* kaybolur.
Oyuncu haksız yere ölmez; her ölüm bir öğrenmedir. Bloğun içine düşecekse geçiş otomatik
iptal edilir (takılı kalma bug'ı yok).

## Aşamalar

| # | Aşama | Ne öğretir |
| - | ----- | ---------- |
| I | **Uyanış** | Hareket, zıplama, teras merdiveni, dikenler |
| II | **Faz Kırılması** | Boşlukta faz değişimi, faz duvarı |
| III | **Yarık** | Zeminin faza göre yok olması, şimşek, ağır yağmur |
| IV | **Kaçış** | Arkandan gelen avcı — yakalanırsan ölürsün |

Her aşamanın kendi ambiyansı var: sis yoğunluğu, yağmur şiddeti, ışık rengi, bloom.

## Kontroller

| Tuş | Aksiyon |
| --- | ------- |
| `A` `D` / `←` `→` | Yürü |
| `SPACE` / `W` | Zıpla (basılı tut = daha yüksek) |
| `SHIFT` / `Q` | Faz değiştir |
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
src/render/scene.js     Three.js sahnesi: ışık, gölge haritası, sis, yağmur, bloom
src/render/character.js Prosedürel 3D iskelet + animasyon + avcı figürü
src/levels/index.js     Aşama verisi (harita + ambiyans)
test/smoke.mjs          Kafaüstü duman testi (Node, render yok)
```

### Görsel katman

- **Three.js r170**, perspektif kamera, hafif açılı bakış (derinlik hissi)
- **Gerçek gölge haritası**: yön ışığı (2048², PCF yumuşak) + oyuncunun feneri (SpotLight, 1024²)
- **FogExp2** +16 adet kayan sis kartı → hacimsel derinlik
- **Yağmur**: `LineSegments` ile prosedürel çizgi parçacıkları, rüzgar sapması, kamerayı takip eden hacim
- **Şimşek** (Aşama III): yön ışığı parlaması + gecikmeli gürültü patlaması
- **Bloom** (UnrealBloomPass) — kurulamazsa sessizce düz render'a düşer
- Bloklar `InstancedMesh` (sahne başına tek çizim çağrısı), üst kenarlarda ışık çizgisi
- ACES tone mapping, sinematik letterbox, film grain, vinyet

### Ses

Sıfır ses dosyası; her şey WebAudio ile sentezleniyor: yağmur (brown gürültü + bant geçiren +
LFO dalgalanma), rüzgar, zıplama, iniş, adım, faz geçişi, reddetme, ölüm, kontrol noktası
zili, çıkış, şimşek gürültüsü.

### Test

```bash
npm test        # node test/smoke.mjs
```

Doğrulananlar: harita bütünlüğü, doğuş/çıkış güvenliği, zemin boşluklarının geçilebilirliği,
zıplama/koşu değerleri, ölüm + yeniden doğuş, kontrol noktaları, faz güvenliği, ışık zemininde
düşme, avcının yakalaması, aşama I merdiven geometrisi, faz köprüsünün boşluğu örtmesi.

**Test etmeyenler:** render/görsel kompozisyon, ses karışımı, FPS. Bunlar tarayıcıda sende.

---

## Çalıştırma

ES modülü + CDN kullanıldığı için `file://` ile açılmaz:

```bash
npm start          # npx serve
# veya
python -m http.server 8080
```

GitHub Pages üzerinde build adımı olmadan çalışır.

## Yol haritası

- [x] 3D sahne, gölge haritası, sis, yağmur, şimşek
- [x] Prosedürel karakter iskeleti + animasyon
- [x] 4 aşama (sonuncusu kaçış sahnesi)
- [x] Prosedürel ses motoru
- [ ] Kayıtlı müzik/ses (CC0 lisanslı, kaynak doğrulanmış)
- [ ] Daha zengin figürler (rig'lenmiş glTF modelleri — harici asset gerekir)
- [ ] Mobil dokunmatik kontroller
- [ ] Bölüm seçimi ve kayıt

## Lisans

MIT
