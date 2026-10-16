/**
 * UMBRA — kafaüstü duman testi (tek kesintisiz dünya).
 * Motor bağımsız oyun mantığını (world.js) Node'da doğrular; render katmanı test edilmez.
 *
 *   node test/smoke.mjs        (veya: npm test)
 */

import assert from "node:assert/strict";
import { WORLD, SECTIONS } from "../src/levels/index.js";
import { createWorld, updateWorld, TILE, TUNE } from "../src/game/world.js";
import { buildTerrainCurtain, makeNoise, fbm } from "../src/render/terrain.js";

/* ------------------------------------------------------------------ yardımcı */

function makeInput() {
  const held = new Set();
  const pressed = new Set();
  return {
    down: (...c) => c.some((x) => held.has(x)),
    hit: (...c) => c.some((x) => pressed.has(x)),
    press: (c) => { held.add(c); pressed.add(c); },
    release: (c) => held.delete(c),
    end: () => pressed.clear(),
  };
}

const step = (w, input, n = 1) => {
  for (let i = 0; i < n; i++) { updateWorld(w, 1 / 60, input); input.end(); }
};

const cell = (def, x, y) => def.rows[y]?.[x] ?? ".";

/** Test için oyuncuyu verilen piksele yerleştirir (fizik durumunu sıfırlar). */
function place(w, px, py) {
  const p = w.player;
  p.x = px; p.y = py; p.vx = 0; p.vy = 0;
  p.climbing = false; p.ladder = null; p.grab = null;
}

const pass = (name, extra = "") => console.log(`  ok  ${name}${extra ? "  — " + extra : ""}`);

/* ------------------------------------------------------- 1) dünya bütünlüğü */

console.log("\nUMBRA duman testi\n");

const WIDTH = WORLD.rows[0].length;
assert.ok(WIDTH > 800, `harita beklenenden dar: ${WIDTH} sütun`);
WORLD.rows.forEach((r, i) => {
  assert.equal(r.length, WIDTH, `satır ${i}: uzunluk ${r.length} ≠ ${WIDTH}`);
  assert.match(r, /^[#^PECLB.]+$/, `satır ${i}: geçersiz karakter`);
});
assert.equal(WORLD.rows.length, 18, `satır sayısı ${WORLD.rows.length} ≠ 18`);
{
  const all = WORLD.rows.join("");
  assert.equal((all.match(/P/g) ?? []).length, 1, "birden fazla P");
  assert.equal((all.match(/E/g) ?? []).length, 1, "birden fazla E");
}
pass("Dünya satır uzunluğu ve karakter seti tutarlı", `${WIDTH} sütun, 18 satır`);

/* --------------------------------------------------- 2) bölüm yapısı ve süre */

{
  assert.equal(SECTIONS.length, 5, `5 bölüm bekleniyor, ${SECTIONS.length}`);
  assert.equal(SECTIONS[0].from, 0, "ilk bölüm 0'dan başlamalı");
  for (let i = 0; i < SECTIONS.length; i++) {
    const s = SECTIONS[i];
    assert.ok(s.to > s.from, `${s.sub}: to ≤ from`);
    assert.ok(s.name && s.sub && s.hint, `${s.sub}: başlık/altbaşlık/ipucu eksik`);
    assert.ok(s.ambience && typeof s.ambience.fog === "number", `${s.sub}: ambiyans eksik`);
    if (i > 0) assert.equal(s.from, SECTIONS[i - 1].to, `${s.sub} önceki bölüme bitişik değil`);
  }
  assert.equal(SECTIONS[4].to, WIDTH, "son bölüm haritanın sonuna uzanmalı");
  // her bölüm makul yürüyüş süresine sahip (40px karo, 330 px/sn)
  for (const s of SECTIONS) {
    const sec = (s.to - s.from) * TILE / TUNE.run;
    assert.ok(sec >= 25 && sec <= 65, `${s.sub}: düz yürüyüş ${sec.toFixed(0)}s — 45-60s hedefinin çok dışında`);
  }
  pass("Bölümler bitişik, 5 bölüm, her biri ~45-60s yürüyüş",
    SECTIONS.map((s) => `${s.sub} ${((s.to - s.from) * TILE / TUNE.run).toFixed(0)}s`).join(" · "));
}

/* ------------------------------------------------- 3) chaseFrom (yalnız Bölüm V) */

{
  const w = createWorld(WORLD);
  const input = makeInput();
  step(w, input, 5);
  assert.equal(w.chase, false, "başlangıçta avcı aktif olmamalı");
  assert.ok(w.chaseFrom != null, "chaseFrom tanımlı değil");
  assert.equal(WORLD.chaseFrom, SECTIONS[4].from, "chaseFrom Bölüm V başlangıcı değil");

  place(w, (SECTIONS[3].from + 20) * TILE, 13 * TILE);   // Bölüm IV (chaseFrom öncesi)
  step(w, input, 3);
  assert.equal(w.chase, false, "chaseFrom öncesi avcı başlamamalı");

  place(w, WORLD.chaseFrom * TILE + 80, 13 * TILE);       // Bölüm V (chaseFrom sonrası)
  step(w, input, 3);
  assert.equal(w.chase, true, "chaseFrom sonrası avcı başlamalı");
  pass("Avcı yalnız Bölüm V'de (chaseFrom) başlıyor");
}

/* ------------------------------------------------------------ 4) doğuş / çıkış */

{
  const w = createWorld(WORLD);
  const s = w.stage;

  assert.ok(s.exit, "çıkış yok");
  assert.equal(cell(WORLD, s.spawn.x / TILE, s.spawn.y / TILE), "P", "P hücresi okunamadı");

  // çıkışın bir altı basılabilir zemin olmalı
  const below = cell(WORLD, s.exit.x / TILE, s.exit.y / TILE + 1);
  assert.equal(below, "#", `çıkış altı zemin değil ('${below}')`);

  const input = makeInput();
  step(w, input, 90);
  assert.equal(w.player.onGround, true, "doğuşta yere oturmadı");
  assert.equal(w.deaths, 0, "doğuşta öldü");
  pass("Doğuş güvenli, çıkış zeminle hizalı");
}

/* ------------------------------------------------------------ 5) fizik hissi */

{
  const w = createWorld(WORLD);
  const input = makeInput();
  step(w, input, 90);
  const y0 = w.player.y;
  input.press("Space");
  let peak = y0;
  for (let i = 0; i < 60; i++) { step(w, input, 1); peak = Math.min(peak, w.player.y); }
  input.release("Space");
  const jumpH = Math.round(y0 - peak);
  assert.ok(jumpH >= 35 && jumpH <= 60, `zıplama yüksekliği beklenmedik: ${jumpH}px`);
  pass("Küçük zıplama (hop) yüksekliği", `${jumpH}px — 80px'lik kasanın üstüne ZİPLANAMAZ`);

  const w2 = createWorld(WORLD);
  const in2 = makeInput();
  step(w2, in2, 90);
  in2.press("KeyD");
  step(w2, in2, 120);
  assert.ok(w2.player.vx > 300 && w2.player.vx <= 332, `koşu hızı ${Math.round(w2.player.vx)}`);
  pass("Koşu hızı oturuyor", `${Math.round(w2.player.vx)} px/sn`);
}

/* ----------------------------------- 6) adım tırmanma / inme (zıplamasız) */

{
  // Bölüm I terasları: kolon 44(row14)→45(row13) yukarı, kolon 70(row13)→71(row14) aşağı.
  const w = createWorld(WORLD);
  const input = makeInput();
  step(w, input, 90);
  place(w, 40 * TILE, 13 * TILE);                         // row14 zemin, y=520
  step(w, input, 3);
  assert.equal(w.player.onGround, true, "basamak altında yere oturmadı");
  const yBefore = w.player.y;
  input.press("KeyD");
  step(w, input, 60);                                     // zıplamadan sadece yürü
  input.release("KeyD");
  const climbed = yBefore - w.player.y;
  assert.ok(climbed > 20, `basamak yukarı tırmanılmadı (Δy=${Math.round(climbed)}px)`);
  assert.ok(w.deaths === 0, "basamak tırmanırken öldü");
  assert.equal(w.player.onGround, true, "tırmanışta yere basmadı");
  pass("Basamak yukarı tırmanılıyor (Space'siz)", `Δy=${Math.round(climbed)}px`);

  const w2 = createWorld(WORLD);
  const in2 = makeInput();
  step(w2, in2, 90);
  place(w2, 66 * TILE, 12 * TILE);                        // row13 teras, y=480
  step(w2, in2, 3);
  assert.equal(w2.player.onGround, true, "yukarıda yere oturmadı");
  const yTop = w2.player.y;
  in2.press("KeyD");
  step(w2, in2, 50);
  in2.release("KeyD");
  const dropped = w2.player.y - yTop;
  assert.ok(dropped > 20, `basamak aşağı inilmedi (Δy=${Math.round(dropped)}px)`);
  assert.ok(w2.player.y < 15 * TILE, `aşırı düştü: y=${Math.round(w2.player.y)}`);
  assert.equal(w2.player.onGround, true, "indikten sonra yere oturmadı");
  assert.ok(w2.deaths === 0, "basamak inerken öldü");
  pass("Basamak aşağı iniliyor (yumuşak iniş)", `Δy=${Math.round(dropped)}px`);
}

/* ------------------------- 7) Bölüm I: yalnız D ile yürüyerek geçiş */

{
  const w = createWorld(WORLD);
  const input = makeInput();
  step(w, input, 90);                                     // doğ, yere otur

  input.press("KeyD");                                    // yalnız D: zıplama yok
  const target = SECTIONS[1].from * TILE;                 // Bölüm II başlangıcı
  let frames = 0;
  while (frames < 4200 && w.deaths === 0 && w.player.x < target - 4) {
    step(w, input, 1); frames++;
  }
  input.release("KeyD");

  assert.equal(w.deaths, 0, "Bölüm I'de yürüyüşte öldü");
  assert.ok(w.player.x >= target - 4,
    `Bölüm II'ye yürüyerek ulaşılamadı (x=${Math.round(w.player.x)}, hedef ${target}, ${frames} kare)`);
  pass("Bölüm I — yalnız D ile Bölüm II'ye yürüme", `${frames} kare, zıplanmadı`);
}

/* --------------------------------------------------- 8) ölüm / yeniden doğuş */

{
  const w = createWorld(WORLD);
  const input = makeInput();
  step(w, input, 90);
  assert.ok(w.stage.hazards.length, "hiç diken yok");

  const hz = w.stage.hazards[0];
  place(w, hz.x + 5, hz.y + 10);
  step(w, input, 2);
  assert.equal(w.deaths, 1, "diken öldürmedi");
  pass("Diken teması ölüm");

  step(w, input, 40);
  assert.equal(w.dead, false, "yeniden doğmadı");
  const d = w.deaths;
  place(w, 5 * TILE, w.stage.pxH + 200);
  step(w, input, 2);
  assert.equal(w.deaths, d + 1, "boşluk öldürmedi");
  step(w, input, 40);
  assert.equal(w.dead, false, "yeniden doğmadı");
  pass("Boşluk ölümü + oyun saatiyle yeniden doğuş", `toplam ${w.deaths} ölüm`);
}

/* ------------------------------------------------------ 9) kontrol noktası */

{
  const w = createWorld(WORLD);
  const input = makeInput();
  step(w, input, 90);

  const cp = w.stage.checkpoints[0];
  place(w, cp.x + 9, cp.y);
  step(w, input, 2);
  assert.ok(w.checkpoint, "kontrol noktası kaydedilmedi");
  pass("Kontrol noktası kaydediliyor");

  const savedX = cp.x + 6;                // respawn hücre ortasına hizalar
  place(w, 5 * TILE, w.stage.pxH + 200);
  step(w, input, 2);
  step(w, input, 40);
  assert.ok(Math.abs(w.player.x - savedX) < 3,
    `kontrol noktasına dönmedi: x=${Math.round(w.player.x)} beklenen ${savedX}`);
  pass("Ölünce kontrol noktasına dönülüyor");
}

/* ---------------------------------------------------- 10) Bölüm II: sandık */

{
  const w = createWorld(WORLD);
  const input = makeInput();
  step(w, input, 5);
  assert.equal(w.crates.length, 3, `3 sandık bekleniyor, ${w.crates.length}`);
  const c = w.crates[0];
  assert.equal(c.w, TUNE.crateSize, "sandık genişliği yanlış");
  assert.equal(c.h, TUNE.crateH, "sandık yüksekliği yanlış (80 olmalı)");
  assert.equal(c.onGround, true, "sandık yere oturmadı");
  assert.ok(c.h > 60, `sandık zıplanarak aşılabilir kadar kısa: ${c.h}px`);

  // sandığın solundaki açık zemine yerleştir (row14 zemin, y=520)
  place(w, c.x - TUNE.w - 4, 13 * TILE);
  step(w, input, 5);
  assert.equal(w.player.onGround, true, "zeminde yere oturmadı");
  assert.equal(w.dead, false, "zeminde öldü");

  // E ile tut
  input.press("KeyE"); step(w, input, 3); input.end();
  assert.equal(!!w.player.grab, true, "E ile tutulmadı");
  assert.equal(c.held, true, "held işareti set edilmedi");
  pass("Sandık E ile tutuluyor", `yan=${c.grabSide}`);

  // sola yürüyerek çek: oyuncu ve sandık birlikte sola kayar
  const x0 = w.player.x, c0 = c.x;
  input.press("KeyA");
  step(w, input, 80);
  assert.ok(w.player.x < x0 - 100, `oyuncu çekmedi: ${Math.round(x0)} → ${Math.round(w.player.x)}`);
  assert.ok(c.x < c0 - 100, `sandık sürüklenmedi: ${Math.round(c0)} → ${Math.round(c.x)}`);
  assert.equal(w.dead, false, "çekerken öldü");
  assert.equal(!!w.player.grab, true, "çekme sırasında bırakıldı");
  pass("Sandık çekiliyor (oyuncu + sandık birlikte hareket)",
    `oyuncu ${Math.round(x0)}→${Math.round(w.player.x)}, kasa ${Math.round(c0)}→${Math.round(c.x)}`);

  // bırak
  input.release("KeyA"); step(w, input, 10);
  input.press("KeyE"); step(w, input, 3); input.end();
  assert.equal(!!w.player.grab, false, "E ile bırakılmadı");
  pass("Sandık bırakılıyor");
}

/* ----------------------------------------------------- 11) Bölüm III: merdivenler */

{
  const w = createWorld(WORLD);
  const L = w.stage.ladders;
  assert.ok(L.length >= 2, `beklenen en az 2 merdiven, ${L.length} bulundu`);
  for (const l of L) {
    assert.equal(l.w, TILE, "merdiven genişliği bir karo olmalı");
    assert.ok(l.h >= TILE, "merdiven çok kısa");
  }

  const ladA = [...L].sort((a, b) => b.y - a.y)[0];    // en alçak (ilk) merdiven
  assert.ok(ladA, "merdiven yok");
  place(w, ladA.x + 6, ladA.y + ladA.h - TUNE.h);      // dibine: ayaklar zemin üstü
  const input = makeInput();
  step(w, input, 5);
  assert.equal(w.player.onGround, true, "merdiven dibinde yere oturmadı");

  input.press("KeyW"); step(w, input, 4);
  assert.equal(w.player.climbing, true, "W ile merdivene girilmedi");
  pass("Merdivene W ile giriş");

  step(w, input, 400);                                 // tırman + üstten çık
  assert.equal(w.player.climbing, false, "merdivenden çıkılmadı");
  assert.equal(w.player.onGround, true, "üstte yere oturmadı");
  assert.ok(w.player.y < 10 * TILE, `tırmanılmadı: y=${Math.round(w.player.y)}`);
  pass("Merdivenden tırmanıp üst zemine çıkış", `y=${Math.round(w.player.y)}`);
}

/* ------------------------------------------- 12) Bölüm IV: hareketli platform */

{
  const w = createWorld(WORLD);
  assert.equal(w.platforms.length, 3, `3 platform bekleniyor, ${w.platforms.length}`);
  const pl = w.platforms[0];

  place(w, pl.x + 40, pl.y - TUNE.h);                  // platformun üstü
  const input = makeInput();
  step(w, input, 3);
  assert.equal(w.player.onGround, true, "platforma oturmadı");

  let minX = Infinity, maxX = -Infinity;
  for (let i = 0; i < 300; i++) {
    updateWorld(w, 1 / 60, input); input.end();
    minX = Math.min(minX, w.player.x);
    maxX = Math.max(maxX, w.player.x);
  }
  assert.ok(maxX - minX > 60, `platform oyuncuyu taşımadı: ${Math.round(minX)}→${Math.round(maxX)}`);
  assert.equal(w.dead, false, "platformdayken öldü");
  pass("Hareketli platform oyuncuyu taşıyor", `${Math.round(minX)}→${Math.round(maxX)}px`);
}

/* ---------------------------------------------------- 13) Bölüm V: kaçış */

{
  const w = createWorld(WORLD);
  const input = makeInput();
  step(w, input, 90);
  place(w, WORLD.chaseFrom * TILE + 80, 13 * TILE);     // Bölüm V'ye ışınla
  step(w, input, 5);
  assert.equal(w.chase, true, "Bölüm V'de avcı başlamadı");

  const gap0 = w.player.x - w.chaseX;
  step(w, input, 60);                                   // duran oyuncuya yaklaşıyor
  const gap1 = w.player.x - w.chaseX;
  assert.ok(gap1 < gap0, `avcı yaklaşmıyor: ${Math.round(gap0)} → ${Math.round(gap1)}`);
  pass("Avcı yaklaşıyor", `boşluk ${Math.round(gap0)} → ${Math.round(gap1)}px`);

  const d = w.deaths;
  step(w, input, 400);                                  // sabit duran oyuncu yakalanır
  assert.ok(w.deaths > d, "avcı sabit oyuncuyu yakalamadı");
  pass("Yakalanma ölümle sonuçlanıyor");

  // ölünce avcı arkadan yeniden başlar (döngü yok)
  step(w, input, 40);
  assert.equal(w.dead, false, "yeniden doğmadı");
  const gap2 = w.player.x - w.chaseX;
  assert.ok(gap2 > 400, `yeniden doğuşta avcı çok yakın: ${Math.round(gap2)}px`);
  pass("Yeniden doğuşta avcı sıfırlanıyor (ölüm döngüsü yok)", `boşluk ${Math.round(gap2)}px`);
}

/* --------------------------------------------- 14) faz mekaniği tamamen kaldırıldı */

{
  const w = createWorld(WORLD);
  assert.equal(w.phase, undefined, "world.phase hâlâ var");
  assert.equal(typeof w.stage.solidsFor, "undefined", "solidsFor hâlâ var");
  pass("Faz mekaniği tamamen kaldırıldı (world.phase / solidsFor yok)");

  // E girdisi izleniyor mu
  const c0 = w.crates[0];
  const input = makeInput();
  place(w, c0.x - TUNE.w - 4, 13 * TILE);
  step(w, input, 3);
  input.press("KeyE"); step(w, input, 1);
  assert.equal(!!w.player.grab, true, "KeyE girdisi çalışmadı");
  pass("KeyE girdisi sandık tutmaya bağlı");
}

/* --------------------------------- 15) zemin perdesi (görsel katman) geometrisi */

{
  const AMP = 15;
  const SUB = 5;

  /** Beklenen perde yüzeyi satırı: en alttan yukarıya bitişik '#' kütleşi. */
  const expectedTopRow = (s, x) => {
    let y = s.rows - 1;
    if (s.grid[y][x] !== "#") return -1;
    while (y > 0 && s.grid[y - 1][x] === "#") y--;
    return y;
  };

  let maxRise = 0;
  const s = createWorld(WORLD).stage;
  const mesh = buildTerrainCurtain(s, { seed: 17 + s.cols * 3, amp: AMP });
  const pos = mesh.geometry.attributes.position.array;
  const idx = mesh.geometry.index;

  // 1) sayılar sağlam (NaN = gözle görünmez/çökmüş zemin)
  for (let i = 0; i < pos.length; i++) {
    assert.ok(Number.isFinite(pos[i]), `perdede NaN var (i=${i})`);
  }
  const vCount = pos.length / 3;
  assert.equal(vCount, (s.cols * SUB + 1) * 2, `beklenmeyen vertex sayısı ${vCount}`);

  // 2) indeksler sınırlar içinde (taşma = bozuk üçgenler)
  for (const i of idx) {
    assert.ok(i >= 0 && i < vCount, `indeks taşması ${i} >= ${vCount}`);
  }

  // 3) sütun kuralı + yükseklik bandı
  for (let x = 0; x < s.cols; x++) {
    const row = expectedTopRow(s, x);

    if (row < 0) {
      // çukur / boşluk: perde inmemeli
      for (let k = 0; k < SUB; k++) {
        const surface = -pos[(x * SUB + k) * 6 + 1];
        assert.ok(
          surface >= s.pxH + 500,
          `sütun ${x} yüzeyi ${Math.round(surface)} — çukurda perde inmemeli`,
        );
      }
      continue;
    }

    const base = row * TILE;
    for (let k = 0; k < SUB; k++) {
      const surface = -pos[(x * SUB + k) * 6 + 1];
      assert.ok(
        surface >= base - AMP - 0.01 && surface <= base + 0.01,
        `sütun ${x} yüzey ${Math.round(surface)} (${base} ± ${AMP} dışında)`,
      );
      maxRise = Math.max(maxRise, base - surface);
    }
  }

  // 4) oyun kritik: perde hiçbir dikenin üstünü KAPATMAMALI.
  for (const h of s.hazards) {
    const hx = h.x / TILE;
    const limit = h.y + h.h - AMP - 0.01;
    for (let k = 0; k < SUB; k++) {
      const surface = -pos[(hx * SUB + k) * 6 + 1];
      assert.ok(
        surface >= limit,
        `diken sütunu ${hx}'de perde ${Math.round(surface)} — limit ${Math.round(limit)}, dikenler gömülürdü`,
      );
    }
  }

  pass("Zemin perdesi geometrisi tutarlı (çukurlar açık, indeksler sağlam)",
    `${s.cols} sütun, en fazla yükseliş ${maxRise}px`);

  // 5) gürültü: deterministik ve sınırlı
  const n1 = makeNoise(1234);
  assert.equal(n1(10.5), makeNoise(1234)(10.5), "gürültü deterministik değil");
  for (let i = 0; i < 200; i++) {
    const v = fbm(n1, i * 0.37, 4);
    assert.ok(v >= 0 && v <= 1, `fbm aralık dışı: ${v}`);
  }
  pass("Gürültü deterministik, fbm 0..1 aralığında");
}

console.log("\nTüm testler geçti.\n");
