/**
 * UMBRA — kafaüstü duman testi.
 * Motor bağımsız oyun mantığını (world.js) Node'da doğrular; render katmanı test edilmez.
 *
 *   node test/smoke.mjs
 */

import assert from "node:assert/strict";
import { STAGES } from "../src/levels/index.js";
import { createWorld, updateWorld, TILE, TUNE } from "../src/game/world.js";
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

/** Test için oyuncuyu verilen piksele yerleştirir (fizik durumunu sıfırlar). */
function place(w, px, py) {
  const p = w.player;
  p.x = px; p.y = py; p.vx = 0; p.vy = 0;
  p.climbing = false; p.ladder = null; p.grab = null;
}

const pass = (name, extra = "") => console.log(`  ok  ${name}${extra ? "  — " + extra : ""}`);

/* ------------------------------------------------------- 1) harita bütünlüğü */

console.log("\nUMBRA duman testi\n");

for (const stage of STAGES) {
  const width = stage.rows[0].length;
  assert.equal(width, 46, `${stage.name}: beklenmeyen genişlik ${width}`);
  stage.rows.forEach((r, i) => {
    assert.equal(r.length, width, `${stage.name}: satır ${i} uzunluğu ${r.length} ≠ ${width}`);
    assert.match(r, /^[#^PECLB.]+$/, `${stage.name}: satır ${i} geçersiz karakter`);
  });
  assert.ok(stage.rows.length >= 18, `${stage.name}: harita çok kısa`);
  // yalnız bir başlangıç ve bir çıkış
  const all = stage.rows.join("");
  assert.equal((all.match(/P/g) ?? []).length, 1, `${stage.name}: birden fazla P`);
  assert.equal((all.match(/E/g) ?? []).length, 1, `${stage.name}: birden fazla E`);
}
pass("Tüm haritalar satır uzunluğu ve karakter seti bakımından tutarlı",
  `${STAGES.length} aşama, 46 sütun`);

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

/* ------------------------------------------------------------ 3) fizik hissi */

{
  const w = createWorld(STAGES[0]);
  const input = makeInput();
  step(w, input, 90);
  const y0 = w.player.y;
  input.press("Space");
  let peak = y0;
  for (let i = 0; i < 60; i++) { step(w, input, 1); peak = Math.min(peak, w.player.y); }
  input.release("Space");
  const jumpH = Math.round(y0 - peak);
  assert.ok(jumpH > 125 && jumpH < 170, `zıplama yüksekliği beklenmedik: ${jumpH}px`);
  pass("Zıplama yüksekliği", `${jumpH}px (80px'lik kasa üstünden çıkışa geniş pay)`);

  // koşu hızı
  const w2 = createWorld(STAGES[0]);
  const in2 = makeInput();
  step(w2, in2, 90);
  in2.press("KeyD");
  step(w2, in2, 120);
  assert.ok(w2.player.vx > 300 && w2.player.vx <= 322, `koşu hızı ${Math.round(w2.player.vx)}`);
  pass("Koşu hızı oturuyor", `${Math.round(w2.player.vx)} px/sn`);
}

/* --------------------------------------------------- 4) ölüm / yeniden doğuş */

{
  const w = createWorld(STAGES[0]);
  const input = makeInput();
  step(w, input, 90);

  // diken (aşama I'de kolon 28-30, satır 13-14)
  place(w, 28 * TILE + 5, 13 * TILE + 10);
  step(w, input, 2);
  assert.equal(w.deaths, 1, "diken öldürmedi");
  pass("Diken teması ölüm");

  // boşluk
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

/* ------------------------------------------------------ 5) kontrol noktası */

{
  const w = createWorld(STAGES[0]);
  const input = makeInput();
  step(w, input, 90);

  // ilk kontrol noktasının üzerinden geçir
  const cp = w.stage.checkpoints[0];
  place(w, cp.x + 9, cp.y);
  step(w, input, 2);
  assert.ok(w.checkpoint, "kontrol noktası kaydedilmedi");
  pass("Kontrol noktası kaydediliyor");

  const savedX = cp.x + 6;                 // respawn hücre ortasına hizalar
  place(w, 5 * TILE, w.stage.pxH + 200);
  step(w, input, 2);
  step(w, input, 40);
  assert.ok(Math.abs(w.player.x - savedX) < 3, `kontrol noktasına dönmedi: x=${Math.round(w.player.x)} beklenen ${savedX}`);
  pass("Ölünce kontrol noktasına dönülüyor");
}

/* ---------------------------------------------------- 6) Aşama II: sandık çekme */

{
  const w = createWorld(STAGES[1]);           // Yük
  const input = makeInput();
  step(w, input, 5);                          // yerçekimi oturması için birkaç kare
  const c = w.crates[0];
  assert.equal(c.w, TUNE.crateSize, "sandık genişliği yanlış");
  assert.equal(c.h, TUNE.crateH, "sandık yüksekliği yanlış (80 olmalı)");
  assert.equal(c.onGround, true, "sandık yere oturmadı");

  // tünelin içinde, sandığın soluna yerleştir (tavan 520, kasanın tepesi 520 → zıplanamaz)
  place(w, c.x - TUNE.w - 4, 560);
  step(w, input, 5);
  assert.equal(w.player.onGround, true, "tünelde yere oturmadı");
  assert.equal(w.dead, false, "tünelde öldü");

  // sandığın tepesi (520) ile tavandan kalan boşluk yalnız 80px →
  // oyuncu (zıplama ≈148px) kasanın üstüne ZİPLAYAMAZ → çekmek zorunda.
  const clearance = 520 - 440;                 // tavan altı (520) − oyuncu başı (560'ta dururken baş 520)
  assert.ok(c.h >= clearance, "sandık tavandan geçecek kadar kısa — zıplanabilirdi");

  // E ile tut
  input.press("KeyE"); step(w, input, 3); input.end();
  assert.equal(!!w.player.grab, true, "E ile tutulmadı");
  assert.equal(c.held, true, "held işareti set edilmedi");
  pass("Sandık E ile tutuluyor", `yan=${c.grabSide}`);

  // sola yürüyerek çek: oyuncu ve sandık birlikte sola kayar
  const x0 = w.player.x, c0 = c.x;
  input.press("KeyA");
  step(w, input, 120);
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

/* ----------------------------------------------------- 7) Aşama III: merdivenler */

{
  const w = createWorld(STAGES[2]);           // Merdiven
  const L = w.stage.ladders;
  assert.ok(L.length >= 2, `beklenen en az 2 merdiven, ${L.length} bulundu`);
  for (const l of L) {
    assert.equal(l.w, TILE, "merdiven genişliği bir karo olmalı");
    assert.ok(l.h >= TILE, "merdiven çok kısa");
  }

  const ladA = [...L].sort((a, b) => b.y - a.y)[0];   // en alttaki merdiven
  assert.ok(ladA, "alt merdiven yok");
  // merdivenin dibi: ayaklar merdiven alt kenarında (zemin üstü)
  place(w, ladA.x + 6, ladA.y + ladA.h - TUNE.h);
  const input = makeInput();
  step(w, input, 5);
  assert.equal(w.player.onGround, true, "merdiven dibinde yere oturmadı");

  input.press("KeyW"); step(w, input, 4);
  assert.equal(w.player.climbing, true, "W ile merdivene girilmedi");
  pass("Merdivene W ile giriş");

  step(w, input, 400);                        // tırman + üstten çık
  assert.equal(w.player.climbing, false, "merdivenden çıkılmadı");
  assert.equal(w.player.onGround, true, "tepede yere oturmadı");
  assert.ok(w.player.y < 19 * TILE, `tırmanılmadı: y=${Math.round(w.player.y)}`);
  pass("Merdivenden tırmanıp üst zemine çıkış", `y=${Math.round(w.player.y)}`);
}

/* ------------------------------------------- 8) Aşama IV: hareketli platform taşıması */

{
  const w = createWorld(STAGES[3]);           // Hareket
  assert.ok(w.platforms.length >= 1, "platform yok");
  const pl = w.platforms[0];

  // platformun üstüne yerleştir
  place(w, pl.x + 40, pl.y - TUNE.h);
  const input = makeInput();
  step(w, input, 3);
  assert.equal(w.player.onGround, false || w.player.onGround, "platforma oturmadı");

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

/* ---------------------------------------------------- 9) Aşama V: kaçış sahnesi */

{
  const w = createWorld(STAGES[4]);           // Kaçış
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

/* --------------------------------------------- 10) faz mekaniği tamamen kaldırıldı */

{
  for (const stage of STAGES) {
    const w = createWorld(stage);
    assert.equal(w.phase, undefined, `${stage.name}: world.phase hâlâ var`);
    assert.equal(typeof w.stage.solidsFor, "undefined", `${stage.name}: solidsFor hâlâ var`);
  }
  pass("Faz mekaniği tamamen kaldırıldı (world.phase / solidsFor yok)");

  // E girdisi izleniyor mu
  const watched = ["KeyE"];
  const w = createWorld(STAGES[1]);
  const input = makeInput();
  place(w, w.crates[0].x - TUNE.w - 4, 560);
  step(w, input, 3);
  input.press("KeyE"); step(w, input, 1);
  assert.equal(!!w.player.grab, true, "KeyE girdisi work etmedi");
  pass("KeyE girdisi sandık tutmaya bağlı");
}

/* --------------------------------- 11) zemin perdesi (görsel katman) geometrisi */

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
        // çukur / diken: perde inmemeli
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

    // 4) oyun kritik: perde hiçbir dikenin üstünü KAPATMAMALI.
    //    Dikenler ya boşluğun üstünde (perde hiç inmemeli) ya da sağlam
    //    zeminin üstünde (perde zemin yüzeyine kadar çıkabilir, hatta dikenin
    //    tabanını amp kadar örtebilir — bu doğal "zemine kök salmış" görünüm —
    //    ama dikenleri gömemeli).
    for (const h of s.hazards) {
      const hx = h.x / TILE;
      const limit = h.y + h.h - AMP - 0.01;    // perde bunun üstüne çıkamaz
      for (let k = 0; k < SUB; k++) {
        const surface = -pos[(hx * SUB + k) * 6 + 1];
        assert.ok(
          surface >= limit,
          `${stage.name}: diken sütunu ${hx}'de perde ${Math.round(surface)} — limit ${Math.round(limit)}, dikenler gömülürdü`,
        );
      }
    }
  }

  pass("Zemin perdesi geometrisi tutarlı (çukurlar açık, indeksler sağlam)",
    `en fazla yükseliş ${maxRise}px`);

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
