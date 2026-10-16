# UMBRA — gölge fazı platformer

Limbo'nun hissini (karanlık silüetler, ağır fizik, kelimesiz anlatım) alıp **tamamen
farklı bir oyun mekaniği** üzerine kurulan 2D platform oyunu.

> Limbo'nun asıl kodu kapalı kaynaklıdır; burada Playdead'in hiçbir varlığı
> (grafik, ses, karakter) kullanılmıyor. Tüm görseller koddan üretiliyor.

## Ana fark: faz mekaniği

Dünya iki üst üste binen katmandan oluşuyor:

| İşaret | Anlamı |
| ------ | ------ |
| `#`    | Her fazda katı zemin (güvenli) |
| `l`    | **Sadece Işık fazında** katı platform |
| `s`    | **Sadece Gölge fazında** katı platform |
| `^`    | Diken — her fazda ölüm |

`SHIFT` ile faz değiştirirsin. Ayaklarının altındaki platform o an kaybolur;
bu yüzden bulmaca "ne zaman değiştiririm" üzerine kurulu. Limbo'da böyle bir
mekanik yok — orada ipler, kutular, su ve kibrit var.

**Dizayn ilkesi:** zemin asla kaybolmaz, sadece *üzerinde durduğun platform*
kaybolur. Böylece oyuncu hiçbir zaman haksız yere ölmez; her ölüm bir öğrenmedir.

## Kontroller

| Tuş | Aksiyon |
| --- | ------- |
| `←` `→` / `A` `D` | Yürü |
| `SPACE` / `W` / `↑` | Zıpla (basılı tut = daha yüksek) |
| `SHIFT` / `Q` | Faz değiştir |
| `R` | Aşamayı yeniden başlat |

## Çalıştırma

ES modülü kullandığı için `file://` ile **açılmaz**, bir sunucu gerekir:

```bash
npx serve .
# veya
python -m http.server 8080
```

GitHub Pages üzerinde doğrudan çalışır (build adımı yoktur — PixiJS CDN'den gelir).

## Mimari

```
index.html            sahne, HUD, film grain + vinyet (CSS)
src/main.js           oyun döngüsü, faz geçişi, seviye akışı
src/core/physics.js   kendi AABB süpürme fizigimiz (PixiJS yalnızca çizer)
src/core/input.js     klavye + edge detection
src/game/level.js     ASCII harita → çarpışma kutuları + görsel
src/game/player.js    oyuncu hissi (TUNE nesnesi) + silüet çizimi
src/game/camera.js    yumuşak takip, ileri bakış, sınır kırpma
src/levels/index.js   aşama verileri (düzenlemek için tek dosya)
```

`TUNE` nesnesi oyunun tüm "hissini" (koşu hızı, yerçekimi, coyote time, jump
buffer) tek yerde toplar. Değiştirip yenilemen yeterli.

## Yol haritası

- [x] Aşama 1 · Uyanış — hareket, zıplama, kamera, ölüm/respawn
- [x] Aşama 2 · Faz Kırılması — faz mekaniği, boşlukta faz değişimi
- [ ] Aşama 3 · Yarık — taşınabilir ışık kaynağı, faz duvarı bulmacaları
- [ ] Aşama 4 · Ağırlık — asılı platformlar, zamanlayıcılı kapılar
- [ ] Aşama 5 · Kaçış — arkadan gelen karanlık, sabit kamera kesmeleri
- [ ] Ses (CC0), checkpoint, mobil dokunmatik

## Lisans

MIT
