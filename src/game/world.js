/**
 * UMBRA oyun mantığı — MOTOR BAĞIMSIZ.
 * Hiçbir render kütüphanesi import etmez; bu sayede Node'da kafaüstü test edilebilir.
 * Görsel katman (Three.js) yalnızca bu durumu okur.
 *
 * Mekanikler:
 *   - yürüme / koşma / değişken yükseklikte zıplama
 *   - merdiven tırmanma (W/S veya ↑/↓ ile in-çık, SPACE ile atla)
 *   - kutu İTME (yürüyerek) ve ÇEKME (E ile tut, geri yürü)
 *   - hareketli platformlar (oyuncuyu ve kutuları taşır)
 *   - arkadan gelen avcı (kaçış aşaması)
 *
 * Harita sözdizimi:
 *   # katı   ^ diken   P başlangıç   E çıkış   C kontrol noktası
 *   L merdiven (dikey runs'lar birleştirilir)   B sandık başlangıcı
 */

import { moveBody, moveXOnly, overlaps, blocked, approach } from "../core/physics.js";

export const TILE = 40;

export const TUNE = {
  w: 28,
  h: 40,

  run: 330,
  accelGround: 3400,
  accelAir: 1500,    // havada yön değişimi zayıf → zıplama manevrası zayıf, oyun yürüyüş eksenli
  frictionGround: 3800,
  frictionAir: 320,  // düşük → bırakınca süzülür, kısa hopta yine de ilerler

  gravity: 2600,
  maxFall: 1400,
  jump: 470,         // kısa hamle (~42px): engeli aşmak için, Mario zıplaması değil
  jumpCut: 0.55,

  coyote: 0.1,
  buffer: 0.12,
  lookAhead: 90,

  stepUp: 44,        // 1 karo (40px) adıma zıplamadan tırmanır — yürüyüş oyununun belkemiği
  climb: 215,        // merdivende çıkış hızı
  pull: 230,         // tutulan kutunun oyuncuya yetişme hızı
  grabGap: 6,        // tutulan kutu ile oyuncu arasındaki boşluk
  grabReach: 14,     // kutuya dokunabilmek için maks yatay mesafe
  crateSize: 40,
  crateH: 80,        // sandık: 40×80 — alçak geçitte zıplanamaz, çekilmeli
};

/* --------------------------------------------------------------- ayrıştır */

export function parseStage(def) {
  const rows = def.rows;
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));

  const grid = [];
  const sets = { solid: [] };
  const hazards = [];
  const checkpoints = [];
  const ladderCells = [];
  const crateSpawns = [];
  let spawn = null;
  let exit = null;

  for (let y = 0; y < h; y++) {
    const line = rows[y];
    const gridRow = [];
    for (let x = 0; x < w; x++) {
      const ch = line[x] ?? ".";
      gridRow.push(ch);
      const px = x * TILE;
      const py = y * TILE;
      const box = { x: px, y: py, w: TILE, h: TILE };

      if (ch === "#") sets.solid.push(box);
      else if (ch === "^") hazards.push(box);
      else if (ch === "P") spawn = { x: px, y: py };
      else if (ch === "E") exit = box;
      else if (ch === "C") checkpoints.push(box);
      else if (ch === "L") ladderCells.push({ col: x, row: y });
      else if (ch === "B") crateSpawns.push({ x: px, y: py });
    }
    grid.push(gridRow);
  }

  // 'L' hücrelerini sütun bazında dikey koşulara birleştir → birkaç büyük dikdörtgen
  const ladders = [];
  const byCol = new Map();
  for (const c of ladderCells) {
    if (!byCol.has(c.col)) byCol.set(c.col, []);
    byCol.get(c.col).push(c.row);
  }
  for (const [col, list] of byCol) {
    list.sort((a, b) => a - b);
    let start = list[0];
    let prev = list[0];
    for (let i = 1; i <= list.length; i++) {
      const r = list[i];
      if (r !== prev + 1) {
        ladders.push({ x: col * TILE, y: start * TILE, w: TILE, h: (prev - start + 1) * TILE });
        start = r;
      }
      prev = r;
    }
  }
  ladders.sort((a, b) => a.y - b.y);

  return {
    def, grid, cols: w, rows: h,
    pxW: w * TILE, pxH: h * TILE,
    sets, hazards, checkpoints, ladders, crateSpawns,
    spawn: spawn ?? { x: TILE, y: TILE },
    exit,
  };
}

/* ------------------------------------------------------------------ dünya */

export function createWorld(def, view = { w: 1280, h: 720 }) {
  const stage = parseStage(def);
  const w = {
    stage,
    def,
    view,
    chase: !!def.chase,

    player: null,
    cam: { x: 0, y: 0 },

    crates: [],
    platforms: [],
    pSolids: [],      // oyuncunun çarpışma listesi (statik + platform + kutular)
    cScratch: [],     // kutu güncellemeleri için geçici liste

    deaths: 0,
    dead: false,
    respawnIn: 0,
    done: false,
    finished: false,

    checkpoint: null,
    chaseX: -9999,
    chaseY: 0,
    events: [],
  };

  for (const pdef of stage.def.platforms ?? []) {
    const pl = {
      x: pdef.col * TILE,
      y: pdef.row * TILE,
      w: (pdef.w ?? 3) * TILE,
      h: (pdef.h ?? 1) * TILE,
      x0: pdef.col * TILE,
      y0: pdef.row * TILE,
      axis: pdef.axis ?? "x",
      dist: (pdef.dist ?? 4) * TILE,
      speed: pdef.speed ?? 60,
      phase: pdef.phase ?? 0,
      t: 0,
      dx: 0,
      dy: 0,
    };
    w.platforms.push(pl);
  }

  // 'B' hücresi sandığın ALT karozidir; kutu yukarı doğru 80px kaplar.
  for (const sp of stage.crateSpawns) {
    const y = sp.y + TILE - TUNE.crateH;
    w.crates.push({
      x: sp.x, y, w: TUNE.crateSize, h: TUNE.crateH,
      vx: 0, vy: 0, onGround: false,
      held: false, heldBlocked: false, grabSide: 1, pullDir: 0,
      spawn: { x: sp.x, y },
    });
  }

  respawn(w, true);
  snapCam(w);
  return w;
}

function makePlayer(x, y) {
  return {
    x, y, w: TUNE.w, h: TUNE.h,
    vx: 0, vy: 0,
    onGround: false,
    facing: 1,
    climbing: false,
    ladder: null,
    grab: null,
    coyote: 0, buffer: 0, jumpHeld: false,
    step: 0, climbStep: 0, anim: 0,
  };
}

export function respawn(w, first = false) {
  const at = first || !w.checkpoint ? w.stage.spawn : w.checkpoint;
  w.player = makePlayer(
    at.x + (TILE - TUNE.w) / 2,
    at.y + TILE - TUNE.h,
  );
  w.dead = false;
  snapCam(w);
  if (w.chase) { w.chaseX = w.player.x - 620; w.chaseY = w.player.y + w.player.h; }
  if (!first) w.events.push({ type: "respawn" });
}

/* -------------------------------------------------------------------- kamera */

function clamp(v, min, max) { return v < min ? min : v > max ? max : v; }

function desiredCam(w) {
  const p = w.player;
  const s = w.stage;
  const vw = w.view.w;
  const vh = w.view.h;

  let x = p.x + p.w / 2 + p.facing * TUNE.lookAhead - vw / 2;
  let y = p.y + p.h / 2 - 46 - vh / 2;

  if (s.pxW <= vw) x = (s.pxW - vw) / 2;
  else x = clamp(x, 0, s.pxW - vw);

  if (s.pxH <= vh) y = (s.pxH - vh) / 2;
  else y = clamp(y, 0, s.pxH - vh);

  return { x, y };
}

export function snapCam(w) {
  const d = desiredCam(w);
  w.cam.x = d.x;
  w.cam.y = d.y;
}

function followCam(w, dt) {
  const d = desiredCam(w);
  const k = 1 - Math.exp(-7 * dt);
  w.cam.x += (d.x - w.cam.x) * k;
  w.cam.y += (d.y - w.cam.y) * k;
}

/* --------------------------------------------------------- hareketli platform */

/** Üçgen dalga: sabit hızla ileri/geri, uçlarda yön değiştirir. */
function stepPlatforms(w, dt) {
  for (const pl of w.platforms) {
    pl.t += dt;
    const period = (2 * pl.dist) / Math.max(pl.speed, 1);
    let ph = (pl.t / period + pl.phase) % 1;
    if (ph < 0) ph += 1;
    const tri = ph < 0.5 ? ph * 2 : 2 - ph * 2;
    const off = tri * pl.dist;
    const nx = pl.axis === "x" ? pl.x0 + off : pl.x0;
    const ny = pl.axis === "y" ? pl.y0 - off : pl.y0;
    pl.dx = nx - pl.x;
    pl.dy = ny - pl.y;
    pl.x = nx;
    pl.y = ny;
  }
}

function standingOn(b, pl) {
  const feet = b.y + b.h;
  if (feet < pl.y - 3 || feet > pl.y + 12) return false;
  return b.x + b.w > pl.x + 2 && b.x < pl.x + pl.w - 2;
}

/** Platform üzerinde duran oyuncuyu ve kutuları taşı. Tavana gömülürse geri al. */
function carry(w) {
  const need = w.platforms.some((p) => p.dx !== 0 || p.dy !== 0);
  if (!need) return;
  const st = w.stage.sets.solid;

  const move = (b) => {
    for (const pl of w.platforms) {
      if (pl.dx === 0 && pl.dy === 0) continue;
      if (!standingOn(b, pl)) continue;
      const bx = b.x, by = b.y;
      b.x += pl.dx;
      b.y += pl.dy;
      if (blocked(b, st)) { b.x = bx; b.y = by; }
    }
  };

  move(w.player);
  for (const c of w.crates) move(c);
}

/* -------------------------------------------------------------------- kutular */

function rebuildSolids(w) {
  const out = w.pSolids;
  out.length = 0;
  const st = w.stage.sets.solid;
  for (let i = 0; i < st.length; i++) out.push(st[i]);
  for (let i = 0; i < w.platforms.length; i++) out.push(w.platforms[i]);
  for (let i = 0; i < w.crates.length; i++) out.push(w.crates[i]);
  return out;
}

function crateSolids(w, self, out) {
  out.length = 0;
  const st = w.stage.sets.solid;
  for (let i = 0; i < st.length; i++) out.push(st[i]);
  for (let i = 0; i < w.platforms.length; i++) out.push(w.platforms[i]);
  for (let i = 0; i < w.crates.length; i++) {
    const c = w.crates[i];
    if (c !== self) out.push(c);
  }
  return out;
}

function adjacentCrate(w) {
  const p = w.player;
  for (const c of w.crates) {
    const gap = Math.max(
      0,
      Math.max(p.x - (c.x + c.w), c.x - (p.x + p.w)),
    );
    if (gap > TUNE.grabReach) continue;
    const vo = Math.min(p.y + p.h, c.y + c.h) - Math.max(p.y, c.y);
    if (vo < c.h * 0.3) continue;
    return c;
  }
  return null;
}

function releaseGrab(w) {
  const c = w.player.grab;
  if (!c) return;
  c.held = false;
  c.heldBlocked = false;
  w.player.grab = null;
}

/** E ile tutma / bırakma + tutulan kutunun oyuncuya yetişmesi (it + tek hareket). */
function gripUpdate(w, dt, input) {
  const p = w.player;

  if (input.hit("KeyE")) {
    if (p.grab) {
      releaseGrab(w);
      w.events.push({ type: "grabOff" });
    } else {
      const c = adjacentCrate(w);
      if (c) {
        p.grab = c;
        c.held = true;
        c.heldBlocked = false;
        c.grabSide = c.x + c.w / 2 >= p.x + p.w / 2 ? 1 : -1;
        w.events.push({ type: "grab" });
      } else {
        w.events.push({ type: "grabMiss" });
      }
    }
  }

  const c = p.grab;
  if (!c) return;
  if (w.crates.indexOf(c) < 0) { p.grab = null; return; }

  const target = c.grabSide > 0
    ? p.x + p.w + TUNE.grabGap
    : p.x - TUNE.grabGap - c.w;
  const want = target - c.x;
  const stepLen = Math.abs(want) < 1e-6
    ? 0
    : Math.sign(want) * Math.min(Math.abs(want), TUNE.pull * dt);

  // Kutunun bu karede hangi yöne sürüklenmek istendiği: oyuncunun yürüme
  // yönü ile aynıysa ve kutu takıldıysa oyuncu da durur (itme/çekme hissi).
  const pullDir = Math.sign(stepLen);
  let moved = 0;
  if (stepLen !== 0 && c.onGround) {
    moved = moveXOnly(c, stepLen, crateSolids(w, c, w.cScratch));
  }
  c.pullDir = pullDir;
  c.heldBlocked = Math.abs(moved) < Math.abs(stepLen) - 0.02;

  const dist = Math.abs((c.x + c.w / 2) - (p.x + p.w / 2));
  if (dist > TILE * 2.2) {
    releaseGrab(w);
    w.events.push({ type: "grabOff" });
  }
}

/**
 * Tutulan kutunun y-eksenini oyuncuya yaklaştırır: oyuncu bir basamaktan
 * çıkarken/inişte kutu hemen yanında kalsın. X takibi `gripUpdate`'te; burada
 * yalnızca dikey uyum. Yerçekimi `updateCrates`'ta uygulanır (burada tekrarlanmaz).
 */
function gripDrop(w) {
  const p = w.player;
  const c = p.grab;
  if (!c || c.heldBlocked) return;
  // kutu, oyuncunun basamak üstü/altına yumuşak oturması için en fazla bir karo kayar
  const targetY = p.y + p.h - c.h;       // ayak hizası
  const dy = targetY - c.y;
  const maxStep = TILE;
  const stepY = Math.abs(dy) <= maxStep ? dy : Math.sign(dy) * maxStep;
  if (stepY === 0) return;
  const solids = crateSolids(w, c, w.cScratch);
  const cand = { x: c.x, y: c.y + stepY, w: c.w, h: c.h };
  if (!blocked(cand, solids)) { c.y += stepY; c.vy = 0; c.onGround = false; }
}

/** Kutunun tam önündeki engeli ittirir — basamak tırmanması için değil, itmek için. */
function pushAhead(w, dx) {
  if (dx === 0) return;
  const p = w.player;
  if (!p.onGround) return;              // havadayken itilmez; itme yalniz yerdeyken
  const probe = { x: p.x + dx, y: p.y, w: p.w, h: p.h };
  for (const c of w.crates) {
    if (!overlaps(probe, c)) continue;
    if (c === p.grab) continue;         // tutulan kutu gripUpdate tarafından yönetilir
    if (!c.onGround) return;
    moveXOnly(c, dx, crateSolids(w, c, w.cScratch));
    return;
  }
}

/**
 * Basamak tırmanma (step-up): yürüyüş oyununun belkemiği. Önündeki basamak
 * `stepUp`'dan kısaysa oyuncu zıplamadan otomatik tırmanır ( Mario hissini kırar,
 * yürüyüşü akıcı kılar). Uygulanırsa true döner.
 */
function tryStepUp(w, dx) {
  const p = w.player;
  if (!p.onGround || dx === 0) return false;
  const s = w.stage.sets.solid;

  const probe = { x: p.x + dx, y: p.y, w: p.w, h: p.h };
  let hit = null;
  for (const b of s) { if (overlaps(probe, b)) { hit = b; break; } }
  if (!hit) return false;

  // basamak çok yüksekse tırmanma
  const rise = (p.y + p.h) - hit.y;              // basamağın üstüne kaç px yükselme
  if (rise <= 0 || rise > TUNE.stepUp) return false;

  const lifted = { x: p.x + dx, y: p.y - rise, w: p.w, h: p.h };
  if (blocked(lifted, w.pSolids)) return false;  // üstü kapalıysa tırmanma

  p.y -= rise;
  p.x += dx;
  p.onGround = true;
  p.vy = 0;
  return true;
}

/**
 * Aşağı basamak (step-down): yere basıyorken hemen önümüzde `stepUp` kadar
 * aşağıda zemin varsa düşmeden oturur → merdiven/teras inişi akıcı olur.
 * Zemin yoksa (uçurum) false döner ve normal yerçekimi devreye girer.
 * Güvenli: zemin bulunamazsa hiçbir şey yapmaz, oyun normal davranışa döner.
 */
function tryStepDown(w, dx) {
  const p = w.player;
  if (!p.onGround || dx === 0) return false;
  const feet = p.y + p.h;
  const tx = p.x + dx;

  // düz zemin ya da önüzde duvar/yukarı basamak → normal hareket
  if (blocked({ x: tx + 3, y: feet - 3, w: p.w - 6, h: 6 }, w.pSolids)) return false;
  if (blocked({ x: tx, y: p.y, w: p.w, h: p.h }, w.pSolids)) return false;

  // stepUp kadar aşağıda zemin yoksa uçurum → düş (adım yok)
  if (!blocked({ x: tx + 3, y: feet, w: p.w - 6, h: TUNE.stepUp + 6 }, w.pSolids)) return false;

  // var: yatay kay, sonra zemine otur
  moveXOnly(p, dx, w.pSolids);
  const out = moveBody(p, 0, TUNE.stepUp + 6, w.pSolids);
  if (out.landed) { p.onGround = true; p.vy = 0; return true; }
  return false;   // beklenmedik → bırak, yerçekimi halleder
}

function updateCrates(w, dt) {
  for (const c of w.crates) {
    // boşluğa düşen kutu başlangıca döner (kilidi kırmasın)
    if (c.y > w.stage.pxH + 120) {
      c.x = c.spawn.x; c.y = c.spawn.y;
      c.vx = 0; c.vy = 0; c.onGround = false;
      if (w.player.grab === c) releaseGrab(w);
    }
    c.vy = Math.min(c.vy + TUNE.gravity * dt, TUNE.maxFall);
    const solids = crateSolids(w, c, w.cScratch);
    const out = moveBody(c, 0, c.vy * dt, solids);
    c.onGround = out.landed;
  }
}

/* ------------------------------------------------------------------ merdiven */

function ladderAt(w, box) {
  const L = w.stage.ladders;
  for (let i = 0; i < L.length; i++) if (overlaps(box, L[i])) return L[i];
  return null;
}

function groundUnder(box, solids) {
  const probe = { x: box.x + 3, y: box.y + box.h, w: box.w - 6, h: 3 };
  return blocked(probe, solids);
}

function enterLadder(w, up, down) {
  const p = w.player;
  const probe = { x: p.x - 8, y: p.y, w: p.w + 16, h: p.h };
  const l = ladderAt(w, probe);
  if (!l) return false;
  // aşağı inmek için oyuncunun ayakları merdivenin tepesinde/üstünde olmalı
  if (down && !up && !(p.y + p.h <= l.y + TILE * 0.6)) return false;

  const nx = l.x + l.w / 2 - p.w / 2;
  const cand = { x: nx, y: p.y, w: p.w, h: p.h };
  if (!blocked(cand, w.pSolids)) p.x = nx;
  else if (blocked(p, w.pSolids)) return false;

  releaseGrab(w);
  p.climbing = true;
  p.ladder = l;
  p.vx = 0;
  p.vy = 0;
  p.climbStep = 0;
  w.events.push({ type: "ladderOn" });
  return true;
}

function exitClimb(w) {
  const p = w.player;
  p.climbing = false;
  p.ladder = null;
}

function climbUpdate(w, dt, input, dir, up, down, jumpHit) {
  const p = w.player;
  const l = p.ladder;

  if (jumpHit) {
    exitClimb(w);
    p.vy = -TUNE.jump * 0.7;
    p.vx = 0;
    p.jumpHeld = true;
    p.coyote = 0;
    w.events.push({ type: "jump" });
    return;
  }

  if (dir !== 0) {
    exitClimb(w);
    p.vx = dir * TUNE.run * 0.6;
    w.events.push({ type: "ladderOff" });
    return;
  }

  const v = (down ? 1 : 0) - (up ? 1 : 0);
  if (v !== 0) {
    p.vy = v * TUNE.climb;
    const out = moveBody(p, 0, p.vy * dt, w.pSolids);
    if (out.bonked && v < 0) p.vy = 0;

    p.climbStep += Math.abs(p.vy) * dt;
    if (p.climbStep > 46) { p.climbStep = 0; w.events.push({ type: "climbStep" }); }
  } else {
    p.vy = 0;
  }

  // tepeden çıkış: ayaklar merdivenin üst kenarına ulaştı → yanına basamakla
  if (p.y + p.h <= l.y + 1) { topExit(w, l); return; }

  // alttan çıkış: merdivenin dibini geçti ya da zemine değdi
  if (v > 0 && p.y + p.h >= l.y + l.h - 0.5) { exitClimb(w); p.vy = 0; return; }
  if (v > 0) {
    const probe = { x: p.x + 3, y: p.y + p.h, w: p.w - 6, h: 4 };
    if (blocked(probe, w.pSolids)) { exitClimb(w); p.vy = 0; w.events.push({ type: "ladderOff" }); return; }
  }
}

/** Merdivenin üstünden çıkış: en yakın zemine yanaş, yoksa düş. */
function topExit(w, l) {
  const p = w.player;
  exitClimb(w);
  p.vy = 0;
  p.y = l.y - p.h;

  if (!groundUnder(p, w.pSolids)) {
    const baseCol = Math.round((l.x + l.w / 2 - TILE / 2) / TILE);
    const order = [p.facing, -p.facing];
    let placed = false;
    outer: for (const d of order) {
      if (!d) continue;
      for (let k = 1; k <= 2; k++) {
        const col = baseCol + d * k;
        const nx = col * TILE + (TILE - p.w) / 2;
        const cand = { x: nx, y: p.y, w: p.w, h: p.h };
        if (blocked(cand, w.pSolids)) continue;
        if (!groundUnder(cand, w.pSolids)) continue;
        p.x = nx;
        placed = true;
        break outer;
      }
    }
    if (!placed) { p.onGround = false; return; }
  }

  p.onGround = true;
  w.events.push({ type: "ladderOff" });
}

/* -------------------------------------------------------------------- akış */

function die(w, cause) {
  if (w.dead) return;
  w.dead = true;
  w.respawnIn = 0.45;
  w.deaths += 1;
  w.events.push({ type: "death", cause });
}

function updatePlayer(w, dt, input) {
  const p = w.player;
  const s = w.stage;

  const left = input.down("ArrowLeft", "KeyA");
  const right = input.down("ArrowRight", "KeyD");
  const up = input.down("ArrowUp", "KeyW");
  const down = input.down("ArrowDown", "KeyS");
  const jumpHeld = input.down("Space");
  const jumpHit = input.hit("Space");

  const dir = (right ? 1 : 0) - (left ? 1 : 0);
  const wasAir = !p.onGround;

  if (p.climbing) {
    climbUpdate(w, dt, input, dir, up, down, jumpHit);
  } else {
    // --- tutma / bırakma
    gripUpdate(w, dt, input);
    const speedMax = p.grab ? TUNE.run * 0.55 : TUNE.run;

    if (dir !== 0) {
      const accel = p.onGround ? TUNE.accelGround : TUNE.accelAir;
      p.vx = approach(p.vx, dir * speedMax, accel * dt);
      p.facing = dir;
    } else {
      const fric = (p.onGround ? TUNE.frictionGround : TUNE.frictionAir) * dt;
      p.vx = approach(p.vx, 0, fric);
    }

    // arkadan çekilen kutu duvara takıldıysa oyuncu da durur
    if (p.grab && p.grab.heldBlocked && p.grab.pullDir !== 0 &&
        Math.sign(p.vx) === p.grab.pullDir) p.vx = 0;

    p.vy = Math.min(p.vy + TUNE.gravity * dt, TUNE.maxFall);

    p.coyote = p.onGround ? TUNE.coyote : Math.max(0, p.coyote - dt);
    p.buffer = jumpHit ? TUNE.buffer : Math.max(0, p.buffer - dt);

    if (p.buffer > 0 && p.coyote > 0) {
      releaseGrab(w);
      p.vy = -TUNE.jump;
      p.buffer = 0;
      p.coyote = 0;
      p.onGround = false;
      p.jumpHeld = true;
      w.events.push({ type: "jump" });
    }
    if (!jumpHeld && p.vy < 0 && p.jumpHeld) {
      p.vy *= TUNE.jumpCut;
      p.jumpHeld = false;
    }
    if (p.vy >= 0) p.jumpHeld = false;

    // --- merdivene gir (hareketten önce: düşerken de yakalanır)
    if (!(up || down) || !enterLadder(w, up, down)) {
      const dx = p.vx * dt;
      // tutulan kutuyla birlikte yürü: adım tırmanma veya yükseklik farkını yumuşak geç
      gripDrop(w);
      pushAhead(w, dx);
      if (!tryStepUp(w, dx) && !tryStepDown(w, dx)) moveBody(p, dx, p.vy * dt, w.pSolids);
    }

    if (wasAir && p.onGround) w.events.push({ type: "land" });

    // adım sesi
    if (p.onGround && Math.abs(p.vx) > 30) {
      const before = p.step;
      p.step += Math.abs(p.vx) * dt;
      if (Math.floor(p.step / 52) !== Math.floor(before / 52)) w.events.push({ type: "step" });
    } else if (p.onGround) {
      p.step = 0;
    }
    p.anim += (p.onGround ? Math.abs(p.vx) : 120) * dt;
  }

  // --- tehlike
  for (let i = 0; i < s.hazards.length; i++) {
    if (overlaps(p, s.hazards[i])) { die(w, "hazard"); return; }
  }
  if (p.y > s.pxH + 160) { die(w, "void"); return; }

  // --- kontrol noktası
  for (let i = 0; i < s.checkpoints.length; i++) {
    const c = s.checkpoints[i];
    if (overlaps(p, c) && w.checkpoint !== c) {
      w.checkpoint = c;
      w.events.push({ type: "checkpoint" });
    }
  }

  // --- çıkış
  if (s.exit && overlaps(p, s.exit)) w.events.push({ type: "exit" });
}

function updateChase(w, dt) {
  if (!w.chase || w.dead) return;
  const p = w.player;
  const speed = TUNE.run * 0.7 + Math.sin(_now / 900) * 24;
  w.chaseX = Math.min(w.chaseX + speed * dt, p.x - 40);
  if (w.chaseX > p.x - 96) die(w, "chase");
  const targetY = p.y + p.h;
  w.chaseY += (targetY - w.chaseY) * Math.min(1, dt * 3.4);
}

let _now = 0;
function performanceNow() { return _now; }

export function updateWorld(w, dt, input) {
  _now += dt * 1000;
  w.events.length = 0;

  if (input.hit("KeyR")) {
    respawn(w);
    w.checkpoint = null;
    w.events.push({ type: "restart" });
  } else if (w.dead) {
    w.respawnIn -= dt;
    if (w.respawnIn <= 0) respawn(w);
  } else if (!w.done) {
    stepPlatforms(w, dt);
    carry(w);
    rebuildSolids(w);
    updateCrates(w, dt);
    updatePlayer(w, dt, input);
    updateChase(w, dt);
  }

  followCam(w, dt);
  return w.events;
}

/** Render katmanı için: aşamanın bitip bitmediğini evaluate eder. */
export function consumeExit(w) {
  const i = w.events.findIndex((e) => e.type === "exit");
  if (i < 0) return false;
  w.events.splice(i, 1);
  return true;
}

export { performanceNow };
