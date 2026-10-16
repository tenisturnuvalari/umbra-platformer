// Kesintisiz dünya üretici: 5 bölümü tek haritada bitişik olarak üretir ve
// src/levels/index.js (WORLD) yazar.  Yürüyüş odaklı fizik için tasarlandı.
// Kullanım: node gen-levels.mjs   (üretimden sonra silinebilir)
import { writeFileSync } from "node:fs";

const H = 18;          // satır (ızgara yüksekliği)
const MAXC = 2200;     // azami sütun (önceden ayır)
const g = Array.from({ length: H }, () => Array(MAXC).fill("."));
let cur = 0;           // sonraki boş sütun

/* --------------------------------------------------------------- yardımcılar */
const set = (c, r, ch) => { if (r >= 0 && r < H && c >= 0 && c < MAXC) g[r][c] = ch; };
// yüzey satırından (dahil) en alta kadar katı doldur
const mass = (c0, c1, surf, bottom = H - 1) => {
  for (let c = c0; c <= c1; c++) for (let r = surf; r <= bottom; r++) set(c, r, "#");
};
// tavan (yukarıdan aşağıya)
const ceil = (c0, c1, top, row) => {
  for (let c = c0; c <= c1; c++) for (let r = top; r <= row; r++) set(c, r, "#");
};
const spikes = (c0, c1, r) => { for (let c = c0; c <= c1; c++) set(c, r, "^"); };
const ladder = (c, r0, r1) => { for (let r = r0; r <= r1; r++) set(c, r, "L"); };
// ince kiriş (yalnız 1 satır) — boşluk üstünde sırık/yürüme bandı
const walk = (c0, c1, r) => { for (let c = c0; c <= c1; c++) set(c, r, "#"); };

// cur üzerinden ilerleyenler
function flat(len, surf = 14) { mass(cur, cur + len - 1, surf); cur += len; }
// row14'ten çıkan, row13'te dikenlerin üstünden geçip row14'e inen köprü
function spikeWalk(len) {
  mass(cur, cur + len, 13);           // sırık (row13) — basamak olarak çıkılır
  spikes(cur + 1, cur + len - 1, 14); // altındaki dikenler
  cur += len + 1;
}
// merdivenle çık, boşluk üstünde sırıkta yürü, merdivenle in
function cross(len) {
  set(cur, 14, "#"); ladder(cur, 9, 13); cur += 1;   // çıkış merdiveni (taban row14)
  walk(cur, cur + len - 1, 9); cur += len;            // sırık (row9) — altında boşluk
  set(cur, 14, "#"); ladder(cur, 9, 13); cur += 1;    // iniş merdiveni (taban row14)
}
// bölüm başlangıç iniş alanı (row14); ilk bölümde P, sonrakilerde C koyar
function sectionStart(first) {
  const from = cur;
  flat(6, 14);
  set(from + 2, 13, first ? "P" : "C");
  return from;
}
function sectionEnd() { flat(5, 14); }

const platforms = []; // hareketli platform tanımları (mutlak sütun)

/* ------------------------------------------- I — Uyanış: yürüyüş + basamak + diken */
function bodyI() {
  sectionStart(true);
  flat(16, 14);
  spikeWalk(8);
  flat(14, 14); set(cur - 7, 13, "C");
  flat(14, 13);          // yukarı basamak
  flat(12, 13);
  flat(14, 14);          // aşağı basamak
  spikeWalk(9);
  flat(30, 14);          // uzun düzlük
  flat(14, 14); set(cur - 7, 13, "C");
  flat(14, 13);          // yukarı
  flat(12, 13);
  flat(14, 14);          // aşağı
  spikeWalk(8);
  flat(16, 14);          // aşağı (sırıktan in)
  flat(14, 14);
  flat(16, 13);          // yukarı
  flat(14, 13);
  flat(16, 14);          // aşağı
  spikeWalk(8);
  flat(16, 14); set(cur - 8, 13, "C");
  flat(14, 13);          // yukarı
  flat(14, 13);
  flat(16, 14);          // aşağı
  spikeWalk(9);
  flat(30, 14);          // uzun düzlük
  flat(14, 14); set(cur - 7, 13, "C");
  flat(14, 13);          // yukarı
  flat(12, 13);
  flat(14, 14);          // aşağı
  spikeWalk(9);
  flat(6, 14);
  sectionEnd();
}

/* --------------------------------- II — Yük: uzun zemin, tünelde sandığı it, çukurla bırak */
function bodyII() {
  sectionStart(false);
  const LEN = 360;
  flat(LEN, 14);                 // tek uzun zemin (row14)
  const b = cur - LEN;
  // alçak tüneller (tepede kaya, iç yükseklik 80px)
  ceil(b + 40, b + 66, 0, 11);
  ceil(b + 120, b + 150, 0, 11);
  ceil(b + 188, b + 212, 0, 11);
  ceil(b + 310, b + 340, 0, 11);
  // 1. sandık: b+20'den it → b+85'teki çukura düşer (başlangıca döner, arkanda kalır)
  set(b + 20, 13, "B");
  set(b + 78, 13, "C");          // çukur öncesi kontrol noktası
  pit(b + 85, 2);                // 2 sütunluk boşluk — sandığı düşürür, sen atla
  // 2. sandık: b+110'dan it → b+170'e
  set(b + 110, 13, "B");
  set(b + 163, 13, "C");
  pit(b + 170, 2);
  // 3. sandık: b+230'dan it → b+290'a
  set(b + 230, 13, "B");
  set(b + 283, 13, "C");
  pit(b + 290, 2);
  sectionEnd();
}
// 2+ sütunluk dikey boşluk: tüm satırları temizle (zemin yok → düşen ölür/sandık sıfırlanır)
function pit(c0, n) {
  for (let c = c0; c < c0 + n; c++) for (let r = 0; r < H; r++) set(c, r, ".");
}

/* --------------------------- III — Merdiven: tırman, boşluk üstünde sırıkta yürü, in */
function bodyIII() {
  sectionStart(false);
  flat(30, 14);                  // yaklaşan zemin
  cross(150);                    // 1. geçiş: merdiven + 150 sütunluk sırık
  flat(30, 14); set(cur - 10, 13, "C");
  cross(140);                    // 2. geçiş
  flat(30, 14); set(cur - 10, 13, "C");
  sectionEnd();
}

/* ------------------- IV — Hareket: kıyılar arası hareketli platformlarla boşluğu geç */
function bodyIV() {
  sectionStart(false);
  const gap = 18;                // boşluk = w(12) + dist(6)
  flat(16, 14);                  // kıyı 1
  platforms.push({ col: cur, row: 14, w: 12, axis: "x", dist: 6, speed: 50 });
  cur += gap;                    // boşluk (zemin yok)
  flat(70, 14);                  // uzun orta kıyı
  set(cur - 35, 13, "C");
  platforms.push({ col: cur, row: 14, w: 12, axis: "x", dist: 6, speed: 50 });
  cur += gap;
  flat(60, 14);
  set(cur - 30, 13, "C");
  platforms.push({ col: cur, row: 14, w: 12, axis: "x", dist: 6, speed: 50 });
  cur += gap;
  flat(30, 14);                  // son kıyı
  sectionEnd();
}

/* ----------------------- V — Kaçış: avcı arkanda, sırıkta dikenlerden geç, çıkışa koş */
function bodyV() {
  const from = sectionStart(false);
  flat(24, 14);
  spikeWalk(14);
  flat(24, 14); set(cur - 10, 13, "C");
  spikeWalk(16);
  flat(20, 14);
  flat(16, 13);                  // basamak yukarı
  flat(14, 13);
  flat(16, 14);                  // aşağı
  spikeWalk(16);
  flat(24, 14); set(cur - 10, 13, "C");
  spikeWalk(14);
  flat(24, 14);
  spikeWalk(16);
  flat(20, 14);
  flat(16, 13);                  // basamak yukarı
  flat(14, 13);
  flat(16, 14);                  // aşağı
  spikeWalk(16);
  flat(30, 14); set(cur - 10, 13, "C");
  spikeWalk(14);
  flat(30, 14);
  sectionEnd();
  set(cur - 3, 13, "E");         // çıkış (en uçta)
  return from;
}

/* --------------------------------------------------------------- bölüm bilgileri */
const AMB = {
  I: { fog: 0x0d141b, fogDensity: 0.00115, skyTop: 0x2a3542, skyBottom: 0x05070a, moon: 0xb9d2e8, moonI: 2.3, moonDir: [-0.62, 1.0, 0.72], rim: 0x7d97b2, rain: 0.3, wind: 0.34, lightning: false, bloom: 0.42, glowLight: 0xffb066, glowShadow: 0x54d6ff },
  II: { fog: 0x0b1118, fogDensity: 0.00145, skyTop: 0x223040, skyBottom: 0x04060a, moon: 0x9fc0e0, moonI: 2.0, moonDir: [-0.75, 1.0, 0.5], rim: 0x6f8ba8, rain: 0.5, wind: 0.5, lightning: false, bloom: 0.5, glowLight: 0xffb066, glowShadow: 0x54d6ff },
  III: { fog: 0x080d13, fogDensity: 0.0021, skyTop: 0x18222d, skyBottom: 0x03050a, moon: 0x8fb0cd, moonI: 1.7, moonDir: [-0.8, 1.0, 0.4], rim: 0x5b7590, rain: 0.9, wind: 0.85, lightning: true, bloom: 0.6, glowLight: 0xffb066, glowShadow: 0x54d6ff },
  IV: { fog: 0x0a1017, fogDensity: 0.0018, skyTop: 0x24313f, skyBottom: 0x04060a, moon: 0xa8c6e2, moonI: 2.1, moonDir: [-0.68, 1.0, 0.6], rim: 0x7089a4, rain: 0.6, wind: 0.62, lightning: false, bloom: 0.5, glowLight: 0xffb066, glowShadow: 0x54d6ff },
  V: { fog: 0x0d0809, fogDensity: 0.0027, skyTop: 0x2b1a1a, skyBottom: 0x040305, moon: 0xff8f7a, moonI: 1.5, moonDir: [-0.9, 0.85, 0.35], rim: 0xa1625a, rain: 1.0, wind: 1.0, lightning: false, bloom: 0.72, glowLight: 0xffb066, glowShadow: 0x54d6ff },
};

const sections = [];

function build() {
  // I
  let from = cur;
  bodyI();
  sections.push({ name: "Uyanış", sub: "Bölüm I", hint: "A / D ile yürü · basamaklara zıplamadan tırman · dikenli köprüden geç", ambience: AMB.I, from, to: cur });
  // II
  from = cur;
  bodyII();
  sections.push({ name: "Yük", sub: "Bölüm II", hint: "Ağır sandığı yürüyerek İT · uçuruma it, kendi kendine düşsün · E ile tutup ÇEK", ambience: AMB.II, from, to: cur });
  // III
  from = cur;
  bodyIII();
  sections.push({ name: "Merdiven", sub: "Bölüm III", hint: "W / S ile tırman · boşluk üstündeki sırıkta yürü · düşme", ambience: AMB.III, from, to: cur });
  // IV
  from = cur;
  bodyIV();
  sections.push({ name: "Hareket", sub: "Bölüm IV", hint: "Hareketli platformu zamanla yakala · boşlukta düşülür", ambience: AMB.IV, from, to: cur });
  // V
  from = cur;
  const chaseFrom = bodyV();
  sections.push({ name: "Kaçış", sub: "Bölüm V", hint: "Arkandaki şey koşuyor · durma · dikenlerden geç · çıkışa koş", ambience: AMB.V, from, to: cur });
  return chaseFrom;
}

const chaseFrom = build();

/* ----------------------------------------------------------------------- doğrula */
const W = cur;
const rows = g.map((r) => r.slice(0, W).join(""));
for (const [i, r] of rows.entries()) {
  if (r.length !== W) throw new Error(`satır ${i}: uzunluk ${r.length} ≠ ${W}`);
  if (!/^[#^PECLB.]+$/.test(r)) throw new Error(`satır ${i}: geçersiz karakter`);
}
const all = rows.join("");
if ((all.match(/P/g) ?? []).length !== 1) throw new Error(`P sayısı ≠ 1`);
if ((all.match(/E/g) ?? []).length !== 1) throw new Error(`E sayısı ≠ 1`);
if (platforms.length !== 3) throw new Error(`platform sayısı ${platforms.length} ≠ 3`);

/* -------------------------------------------------------------------------- yaz */
const platOut = platforms.map((p) => `      ${JSON.stringify(p)}`).join(",\n");
const secOut = sections.map((s) => `    { name: ${JSON.stringify(s.name)}, sub: ${JSON.stringify(s.sub)}, hint: ${JSON.stringify(s.hint)}, from: ${s.from}, to: ${s.to}, ambience: ${JSON.stringify(s.ambience)} }`).join(",\n");
const rowOut = rows.map((r) => `      "${r}"`).join(",\n");

const out = `/**
 * UMBRA — KESİNTİSİZ dünya verisi (tek harita, bitişik bölümler).
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
 * Tek harita: bölümler bitişiktir, geçişte yükleme/durma yok. Oyuncu X konumuna
 * göre bulunduğu bölümü görür (sections.from/to sütunları) ve ambiyan yumuşakça
 * kayar. chaseFrom: avcının başladığı sütun (Bölüm V).
 *
 * platforms: hareketli platformlar — { col, row, w (karo), axis, dist (karo),
 *             speed (px/sn) }.  axis 'x' yatay.
 * ambience: başlangıç sahne ayarı (bölümlerininki sections.ambience içinde).
 */

export const WORLD = {
  name: "UMBRA",
  rows: [
${rowOut}
  ],
  platforms: [
${platOut}
  ],
  ambience: ${JSON.stringify(AMB.I)},
  chaseFrom: ${chaseFrom},
  sections: [
${secOut}
  ],
};

export const SECTIONS = WORLD.sections;
`;

writeFileSync(new URL("./src/levels/index.js", import.meta.url), out, "utf8");
console.log(`src/levels/index.js üretildi: ${W} sütun, ${sections.length} bölüm, ${platforms.length} platform.`);
for (const s of sections) console.log(`  ${s.sub.padEnd(10)} ${s.name.padEnd(9)} sütun ${String(s.from).padStart(4)}–${s.to}  (${((s.to - s.from) * 40 / 330).toFixed(0)}s düz yürüyüş)`);
