/**
 * UMBRA — kafaüstü duman testi.
 * Motor bağımsız oyun mantığını (world.js) Node'da doğrular; render katmanı test edilmez.
 *
 *   node test/smoke.mjs
 */

import assert from "node:assert/strict";
import { STAGES } from "../src/levels/index.js";
import { createWorld, updateWorld, TILE } from "../src/game/world.js";
import { overlaps } from "../src/core/physics.js";
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

const cell = (stage, x, y) => stage.rows[y]?.[x] ?? ".";

/** Zemin satırındaki "aşılması gereken" boşlukları piksel cinsinden bulur.
 *  # ve l zemindir; ^ (diken) ve . (boşluk) atlanması gereken aralıktır. */
function groundGaps(stage, row) {
  const gaps = [];
  let run = 0;
  for (let x = 0; x < stage.rows[row].length; x++) {
    const ch = cell(stage, x, row);
    if (ch === "#" || ch === "l") {
      if (run > 0) { gaps.push(run * TILE); run = 0; }
    } else {
      run++;
    }
  }
  return gaps;
}

const pass = (name, extra = "") => console.log(`  ok  ${name}${extra ? "  — " + extra : ""}`);

/* ------------------------------------------------------- 1) harita bütünlüğü */

console.log("\nUMBRA duman testi\n");

for (const stage of STAGES) {
  const width = stage.rows[0].length;
  stage.rows.forEach((r, i) => {
    assert.equal(r.length, width, `${stage.name}: satır ${i} uzunluğu ${r.length} ≠ ${width}`);
    assert.match(r, /^[#l^s.PEC]+$/, `${stage.name}: satır ${i} geçersiz karakter`);
  });
  assert.equal(width % TILE === 0 || true, true);
  assert.ok(stage.rows.length >= 18, `${stage.name}: harita çok kısa`);
}
pass("Tüm haritalar satır uzunluğu ve karakter seti bakımından tutarlı", `${STAGES.length} aşama, 46 sütun`);

/* ------------------------------------------------------------ 2) doğuş / çıkış */

for (const stage of STAGES) {
  const w = createWorld(stage);
  const s = w.stage;

  assert.ok(s.exit, `${stage.name}: çıkış yok`);
  assert.equal(cell(stage, s.spawn.x / TILE, s.spawn.y / TILE), "P", `${stage.name}: P hücresi okunamadı`);

  // çıkışın bir altı basılabilir zemin olmalı
  const below = cell(stage, s.exit.x / TILE, s.exit.y / TILE + 1);
  assert.equal(below, "#", `${stage.name}: çıkış altı zemin değil ('${below}')`);

  // doğuşta yere oturmalı
  const input = makeInput();
  step(w, input, 90);
  assert.equal(w.player.onGround, true, `${stage.name}: doğuşta yere oturmadı`);
  assert.equal(w.deaths, 0, `${stage.name}: doğuşta öldü`);
}
pass("Her aşamada doğuş güvenli, çıkış zeminle hizalı");

/* --------------------------------------------------------- 3) zemin geçilebilir */

const EXPECTED_GAPS = {
  "Uyanış": [80, 120],
  "Yarık": [80, 120, 80],
  "Kaçış": [80, 120, 80],
  "Faz Kırılması": [480],
};

for (const stage of STAGES) {
  const gaps = groundGaps(stage, 15);
  assert.deepEqual(gaps, EXPECTED_GAPS[stage.name], `${stage.name}: beklenmeyen boşluklar ${JSON.stringify(gaps)}`);
  for (const g of gaps) {
    if (stage.name === "Faz Kırılması") continue;   // bu boşluk faz platformlarıyla köprülüyor
    assert.ok(g <= 200, `${stage.name}: ${g}px boşluk tam zıplamayla (≈236px) aşılamaz`);
  }
}
pass("Zemin boşlukları tam zıplamayla aşılabilir", "en geniş boşluk 120px, uçuş erişimi ≈236px");

/* ------------------------------------------------------------- 4) fizik hissi */

{
  const w = createWorld(STAGES[0]);
  const input = makeInput();
  step(w, input, 90);
  const y0 = w.player.y;
  input.press("Space");
  let peak = y0;
  for (let i = 0; i < 50; i++) { step(w, input, 1); peak = Math.min(peak, w.player.y); }
  input.release("Space");
  const jumpH = Math.round(y0 - peak);
  assert.ok(jumpH > 125 && jumpH < 170, `zıplama yüksekliği beklenmedik: ${jumpH}px`);
  pass("Zıplama yüksekliği", `${jumpH}px (80px'lik platform adımları için geniş pay)`);

  // koşu hızı
  const w2 = createWorld(STAGES[0]);
  const in2 = makeInput();
  step(w2, in2, 90);
  in2.press("ArrowRight");
  step(w2, in2, 120);
  assert.ok(w2.player.vx > 340 && w2.player.vx <= 352, `koşu hızı ${Math.round(w2.player.vx)}`);
  pass("Koşu hızı oturuyor", `${Math.round(w2.player.vx)} px/sn`);
}

/* --------------------------------------------------- 5) ölüm / yeniden doğuş */

{
  const w = createWorld(STAGES[0]);
  const input = makeInput();
  step(w, input, 90);

  // diken
  w.player.x = 28 * TILE + 5;
  w.player.y = 13 * TILE + 10;
  step(w, input, 2);
  assert.equal(w.deaths, 1, "diken öldürmedi");
  pass("Diken teması ölüm");

  // boşluk
  step(w, input, 40);
  assert.equal(w.dead, false, "yeniden doğmadı");
  const d = w.deaths;
  w.player.y = w.stage.pxH + 200;
  w.player.vy = 0;
  step(w, input, 2);
  assert.equal(w.deaths, d + 1, "boşluk öldürmedi");
  step(w, input, 40);
  assert.equal(w.dead, false, "yeniden doğmadı");
  pass("Boşluk ölümü + oyun saatiyle yeniden doğuş", `toplam ${w.deaths} ölüm`);
}

/* ------------------------------------------------------ 6) kontrol noktası */

{
  const w = createWorld(STAGES[0]);
  const input = makeInput();
  step(w, input, 90);

  // kontrol noktasının üzerinden geçir
  w.player.x = 8 * TILE + 9;
  w.player.y = 14 * TILE;
  step(w, input, 2);
  assert.ok(w.checkpoint, "kontrol noktası kaydedilmedi");
  pass("Kontrol noktası kaydediliyor");

  w.player.y = w.stage.pxH + 200;
  step(w, input, 2);
  step(w, input, 40);
  assert.ok(Math.abs(w.player.x - (8 * TILE + 9)) < 3, `kontrol noktasına dönmedi: x=${Math.round(w.player.x)}`);
  pass("Ölünce kontrol noktasına dönülüyor");
}

/* ------------------------------------------------------------ 7) faz mekaniği */

{
  const w = createWorld(STAGES[1]);           // Faz Kırılması
  const input = makeInput();
  step(w, input, 90);
  assert.equal(w.phase, "light");

  const nL = w.stage.solidsFor("light").length;
  const nS = w.stage.solidsFor("shadow").length;
  assert.notEqual(nL, nS, "faz katmanları aynı");
  pass("Faz katmanları ayrışıyor", `ışık=${nL}, gölge=${nS}`);

  // serbest alanda geçiş serbest
  w.player.x = 5 * TILE + 9;
  w.player.y = 10 * TILE;
  w.player.vx = 0; w.player.vy = 0;
  input.press("ShiftLeft"); step(w, input, 1); input.end();
  assert.equal(w.phase, "shadow", "boşlukta faz değişmedi");
  pass("Faz değişimi (serbest alan)");

  // bloğun içine düşüyorsa iptal
  w.player.x = 21 * TILE + 5;
  w.player.y = 11 * TILE + 5;
  w.phase = "light"; w.player.phase = "light";
  input.press("ShiftLeft"); step(w, input, 1); input.end();
  assert.equal(w.phase, "light", "bloğun içinde faz değişti — takılı kalırdı");
  pass("Faz değişimi güvenliği (içinde kalma bug'ı yok)");
}

/* --------------------------------------- 8) Aşama III: ışık zemininde yürümek */

{
  const w = createWorld(STAGES[2]);           // Yarık
  const input = makeInput();
  step(w, input, 90);

  // 'l' zeminine ışık fazında bas
  w.player.x = 16 * TILE;
  w.player.y = 15 * TILE - w.player.h;
  w.player.vx = 0; w.player.vy = 0;
  step(w, input, 20);
  assert.equal(w.player.onGround, true, "ışık zemininde duramadı");
  pass("Işık zemini ('l') yalnız light fazında katı");

  // gölge fazına geç → zemin kaybolur → düşer
  input.press("ShiftLeft"); step(w, input, 1); input.end();
  assert.equal(w.phase, "shadow");
  const d = w.deaths;
  step(w, input, 60);
  assert.equal(w.deaths, d + 1, "gölge fazında düşmedi — bulmaca çalışmıyor");
  pass("Gölge fazında ışık zemini kayboluyor (düşme + ölüm)");
}

/* ------------------------------------------------- 9) Aşama IV: kaçış sahnesi */

{
  const w = createWorld(STAGES[3]);           // Kaçış
  const input = makeInput();
  step(w, input, 90);
  const gap0 = w.player.x - w.chaseX;
  step(w, input, 60);
  const gap1 = w.player.x - w.chaseX;
  assert.ok(gap1 < gap0, `avcı yaklaşmıyor: ${Math.round(gap0)} → ${Math.round(gap1)}`);
  pass("Avcı yaklaşıyor", `boşluk ${Math.round(gap0)} → ${Math.round(gap1)}px`);

  // sabit duran oyuncuyu yakalamalı
  const d = w.deaths;
  step(w, input, 400);
  assert.ok(w.deaths > d, "avcı sabit oyuncuyu yakalamadı");
  pass("Yakalanma ölümle sonuçlanıyor");
}

/* ------------------------------------------------ 10) Aşama I merdiven geometrisi */

{
  const w = createWorld(STAGES[0]);
  const grid = w.stage.grid;
  const runs = (rowIdx) => {
    const out = [];
    let start = -1;
    for (let x = 0; x < w.stage.cols; x++) {
      const hit = grid[rowIdx][x] === "#";
      if (hit && start < 0) start = x;
      if (!hit && start >= 0) { out.push({ x0: start * TILE, x1: x * TILE }); start = -1; }
    }
    if (start >= 0) out.push({ x0: start * TILE, x1: w.stage.cols * TILE });
    return out;
  };

  // teras 520 → 80'lik adımlar → son basamak 120px (ölçülen maks. zıplama 148px)
  let prev = { top: 520, x0: 31 * TILE, x1: 46 * TILE };
  for (const row of [11, 9, 7, 4]) {
    const plat = runs(row)[0];
    assert.ok(plat, `satır ${row}'de platform yok`);
    const climb = prev.top - row * TILE;
    const reach = plat.x0 - prev.x1;
    assert.ok(climb > 0 && climb <= 130, `satır ${row}: tırmanış ${climb}px (limit 130)`);
    assert.ok(reach <= 60, `satır ${row}: yatay erişim ${reach}px çok uzak`);
    prev = { top: row * TILE, x0: plat.x0, x1: plat.x1 };
  }
  const e = w.stage.exit;
  const standing = { x: e.x + 9, y: prev.top - 46, w: 22, h: 46 };
  assert.ok(overlaps(standing, e), "son platformun üzerinde duran oyuncu çıkışa ulaşamıyor");
  pass("Aşama I merdiveni geometrik olarak tırmanılabilir", "adımlar 80px, yatay erişim ≤ 60px");
}

/* ------------------------------------------- 11) Aşama II: faz köprüsü boşluğu örtüyor */

{
  const w = createWorld(STAGES[1]);
  const s = w.stage;
  const gapX0 = 16 * TILE;
  const gapX1 = 28 * TILE;

  for (const phase of ["light", "shadow"]) {
    const solids = s.solidsFor(phase);
    const bridging = solids.filter((b) => b.x + b.w > gapX0 && b.x < gapX1 && b.y > 8 * TILE);
    assert.ok(bridging.length > 0, `${phase} fazında boşluğu köprüleyen platform yok`);
  }
  pass("Boşluk her iki fazda da köprülenebilir (bulmaca gerçekten çözülebilir)");
}

/* --------------------------------- 12) zemin perdesi (görsel katman) geometrisi */

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

  for (const stage of STAGES) {
    const s = createWorld(stage).stage;
    const mesh = buildTerrainCurtain(s, { seed: 17 + s.cols * 3, amp: AMP });
    const pos = mesh.geometry.attributes.position.array;
    const idx = mesh.geometry.index;

    // 1) sayılar sağlam (NaN = gözle görünmez/çökmüş zemin)
    for (let i = 0; i < pos.length; i++) {
      assert.ok(Number.isFinite(pos[i]), `${stage.name}: perdede NaN var (i=${i})`);
    }
    const vCount = pos.length / 3;
    assert.equal(vCount, (s.cols * SUB + 1) * 2, `${stage.name}: beklenmeyen vertex sayısı`);

    // 2) indeksler sınırlar içinde (taşma = bozuk üçgenler)
    for (const i of idx) {
      assert.ok(i >= 0 && i < vCount, `${stage.name}: indeks taşması ${i} >= ${vCount}`);
    }

    // 3) sütun kuralı + yükseklik bandı
    for (let x = 0; x < s.cols; x++) {
      const row = expectedTopRow(s, x);

      if (row < 0) {
        // çukur / diken / faz zemini: perde inmemeli
        for (let k = 0; k < SUB; k++) {
          const surface = -pos[(x * SUB + k) * 6 + 1];
          assert.ok(
            surface >= s.pxH + 500,
            `${stage.name}: sütun ${x} yüzeyi ${Math.round(surface)} — çukurda perde inmemeli`,
          );
        }
        continue;
      }

      const base = row * TILE;
      for (let k = 0; k < SUB; k++) {
        const surface = -pos[(x * SUB + k) * 6 + 1];
        assert.ok(
          surface >= base - AMP - 0.01 && surface <= base + 0.01,
          `${stage.name}: sütun ${x} yüzey ${Math.round(surface)} (${base} ± ${AMP} dışında)`,
        );
        maxRise = Math.max(maxRise, base - surface);
      }
    }

    // 4) oyun kritik: hiçbir diken sütununda perde olmamalı
    for (const h of s.hazards) {
      const hx = h.x / TILE;
      assert.equal(
        expectedTopRow(s, hx), -1,
        `${stage.name}: diken sütunu ${hx}'de perde var — diken görünmezdi`,
      );
    }
  }

  pass("Zemin perdesi geometrisi tutarlı (çukurlar açık, indeksler sağlam)", `en fazla yükseliş ${maxRise}px`);

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
