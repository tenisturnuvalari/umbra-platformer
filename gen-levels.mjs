// Geçici üretici: 5 aşamayı yürüyüş odaklı fizik için üretir ve src/levels/index.js yazar.
// Kullanım: node gen-levels.mjs   (üretimden sonra silinebilir)
import { writeFileSync } from "node:fs";

const W = 46;

const blank = (h) => Array.from({ length: h }, () => Array(W).fill("."));
// yüzey satırından (dahil) en alta kadar doldur
function mass(g, c0, c1, surface, bottom = g.length - 1) {
  for (let c = c0; c <= c1; c++) for (let r = surface; r <= bottom; r++) g[r][c] = "#";
}
// tavan / tepe kütlesi (yukarıdan aşağıya)
function ceil(g, c0, c1, top, row) {
  for (let c = c0; c <= c1; c++) for (let r = top; r <= row; r++) g[r][c] = "#";
}
const put = (g, c, r, ch) => { g[r][c] = ch; };
const spikes = (g, c0, c1, r) => { for (let c = c0; c <= c1; c++) g[r][c] = "^"; };
const ladder = (g, c, r0, r1) => { for (let r = r0; r <= r1; r++) g[r][c] = "L"; };
const rows = (g) => g.map((r) => r.join(""));

/* ---- Aşama I — Uyanış: saf yürüyüş, tırman/at (step-up/down), tehlikesiz ---- */
function stage1() {
  const g = blank(18);
  mass(g, 0, 11, 14);
  mass(g, 12, 25, 13);
  mass(g, 26, 33, 14);
  mass(g, 34, 45, 13);
  put(g, 3, 13, "P");
  put(g, 18, 12, "C");
  put(g, 42, 12, "E");
  return rows(g);
}

/* ---- Aşama II — Yük: alçak tünelde ağır sandığı İT, yürüyerek çıkış ---- */
function stage2() {
  const g = blank(18);
  mass(g, 0, 45, 14);              // zemin
  ceil(g, 16, 29, 0, 11);          // tünel: tepede kaya (iç kısım 12-13 = 80px)
  put(g, 3, 13, "P");
  put(g, 7, 13, "C");
  put(g, 10, 13, "B");             // sandık (zemin üstünde, tünelin solunda)
  put(g, 42, 13, "E");
  return rows(g);
}

/* ---- Aşama III — Merdiven: tırman, sırıktan (boşluk üstü) yürü, yukarıda bit ---- */
function stage3() {
  const g = blank(18);
  mass(g, 0, 15, 14);              // sol zemin (güvenli)
  // sağ tarafta taban yok → derin boşluk; sırık (walkway) row9 üstünde yüzer
  put(g, 2, 13, "P");
  put(g, 8, 13, "C");
  mass(g, 15, 44, 9, 9);           // sırık: yalnız 1 satır kalın kiriş (row9)
  ladder(g, 15, 9, 13);            // col15 sırığı baştan yazar → merdiven sırıkla aynı seviyede biter
  put(g, 43, 8, "E");
  return rows(g);
}

/* ---- Aşama IV — Hareket: geniş akan sal üzerinde boşluğu geç ---- */
function stage4() {
  const g = blank(18);
  mass(g, 0, 9, 14);               // sol kıyı
  mass(g, 28, 45, 14);             // sağ kıyı
  put(g, 2, 13, "P");
  put(g, 6, 13, "C");
  put(g, 43, 13, "E");
  return rows(g);                  // platforms def. eklenir
}

/* ---- Aşama V — Kaçış: koş, sırıkta dikenlerden geç, avciden kaç ---- */
function stage5() {
  const g = blank(18);
  mass(g, 0, 45, 14);              // zemin
  // sırık: row13'te köprü, altında row14'te dikenler (basit adım ile geçilir)
  mass(g, 14, 30, 13, 13);         // row13 sırık (cols14-30)
  spikes(g, 14, 30, 14);           // sırığın ALTINDA dikenler → düşerse ölüm
  put(g, 3, 13, "P");
  put(g, 9, 13, "C");
  put(g, 42, 13, "E");
  return rows(g);
}

const STAGES = [
  {
    name: "Uyanış", sub: "Aşama I",
    hint: "A / D ile yürü · basamaklara zıplamadan tırman · R yeniden",
    ambience: {
      fog: 0x0d141b, fogDensity: 0.00115, skyTop: 0x2a3542, skyBottom: 0x05070a,
      moon: 0xb9d2e8, moonI: 2.3, moonDir: [-0.62, 1.0, 0.72], rim: 0x7d97b2,
      rain: 0.3, wind: 0.34, lightning: false, bloom: 0.42,
      glowLight: 0xffb066, glowShadow: 0x54d6ff,
    },
    rows: stage1(),
  },
  {
    name: "Yük", sub: "Aşama II",
    hint: "Ağır sandığı yürüyerek İT · E ile tutup ÇEK · alçak tünelde zıplanmaz",
    ambience: {
      fog: 0x0b1118, fogDensity: 0.00145, skyTop: 0x223040, skyBottom: 0x04060a,
      moon: 0x9fc0e0, moonI: 2.0, moonDir: [-0.75, 1.0, 0.5], rim: 0x6f8ba8,
      rain: 0.5, wind: 0.5, lightning: false, bloom: 0.5,
      glowLight: 0xffb066, glowShadow: 0x54d6ff,
    },
    rows: stage2(),
  },
  {
    name: "Merdiven", sub: "Aşama III",
    hint: "W / S ile tırman · sırıkta yürü · boşluğa düşme · R yeniden",
    ambience: {
      fog: 0x080d13, fogDensity: 0.0021, skyTop: 0x18222d, skyBottom: 0x03050a,
      moon: 0x8fb0cd, moonI: 1.7, moonDir: [-0.8, 1.0, 0.4], rim: 0x5b7590,
      rain: 0.9, wind: 0.85, lightning: true, bloom: 0.6,
      glowLight: 0xffb066, glowShadow: 0x54d6ff,
    },
    rows: stage3(),
  },
  {
    name: "Hareket", sub: "Aşama IV",
    hint: "Geniş salı zamanla yakala · boşlukta düşülür · kısa bekleme yok",
    ambience: {
      fog: 0x0a1017, fogDensity: 0.0018, skyTop: 0x24313f, skyBottom: 0x04060a,
      moon: 0xa8c6e2, moonI: 2.1, moonDir: [-0.68, 1.0, 0.6], rim: 0x7089a4,
      rain: 0.6, wind: 0.62, lightning: false, bloom: 0.5,
      glowLight: 0xffb066, glowShadow: 0x54d6ff,
    },
    platforms: [
      { col: 10, row: 14, w: 12, axis: "x", dist: 6, speed: 50 },
    ],
    rows: stage4(),
  },
  {
    name: "Kaçış", sub: "Aşama V",
    hint: "Arkandaki şey koşuyor · sırıkta yürü · dikenlere basma · koş ve çık",
    chase: true,
    ambience: {
      fog: 0x0d0809, fogDensity: 0.0027, skyTop: 0x2b1a1a, skyBottom: 0x040305,
      moon: 0xff8f7a, moonI: 1.5, moonDir: [-0.9, 0.85, 0.35], rim: 0xa1625a,
      rain: 1.0, wind: 1.0, lightning: false, bloom: 0.72,
      glowLight: 0xffb066, glowShadow: 0x54d6ff,
    },
    rows: stage5(),
  },
];

// doğrulama
for (const s of STAGES) {
  for (const [i, r] of s.rows.entries()) {
    if (r.length !== W) throw new Error(`${s.name} satır ${i}: uzunluk ${r.length} ≠ ${W}`);
    if (!/^[#^PECLB.]+$/.test(r)) throw new Error(`${s.name} satır ${i}: geçersiz karakter`);
  }
  const all = s.rows.join("");
  if ((all.match(/P/g) ?? []).length !== 1) throw new Error(`${s.name}: P sayısı ≠ 1`);
  if ((all.match(/E/g) ?? []).length !== 1) throw new Error(`${s.name}: E sayısı ≠ 1`);
}

const fmt = (s) => {
  const lines = s.rows.map((r) => `      "${r}"`).join(",\n");
  const plat = s.platforms
    ? `\n    platforms: [\n${s.platforms.map((p) => `      ${JSON.stringify(p)}`).join(",\n")}\n    ],`
    : "";
  const chase = s.chase ? "\n    chase: true," : "";
  return `  {
    name: ${JSON.stringify(s.name)},
    sub: ${JSON.stringify(s.sub)},
    hint: ${JSON.stringify(s.hint)},${chase}${plat}
    ambience: ${JSON.stringify(s.ambience)},
    rows: [
${lines}
    ],
  },`;
};

const out = `/**
 * UMBRA — aşama verileri.
 *
 * Harita sözdizimi (40px ızgara, satırlar nokta ile doldurulur):
 *   #  katı zemin / duvar      ^  diken
 *   P  başlangıç               E  çıkış
 *   C  kontrol noktası         L  merdiven (dikey küme)
 *   B  sandık (40×80, itilip çekilebilir)
 *
 * Yürüyüş odaklı tasarım: 1 karoluk basamaklar zıplamadan tırmanılır (stepUp),
 * merdiven/sal dikey ilerlemeyi sağlar, zıplama yalnız küçük engel/hop içindir.
 *
 * platforms: hareketli platformlar — { col, row, w (karo), axis, dist (karo),
 *             speed (px/sn), phase (0..1) }.   axis 'x' yatay, 'y' dikey (yukarı).
 *
 * ambience: render katmanının okuduğu sahne ayarı (sis, yağmur, ışık, bloom).
 * chase:    arkadan gelen avcı var mı (kaçış sahnesi).
 */

export const STAGES = [
${STAGES.map(fmt).join("\n\n")}
];
`;

writeFileSync(new URL("./src/levels/index.js", import.meta.url), out, "utf8");
console.log("src/levels/index.js üretildi.");
