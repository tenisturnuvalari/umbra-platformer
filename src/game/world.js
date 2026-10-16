/**
 * UMBRA oyun mantığı — MOTOR BAĞIMSIZ.
 * Hiçbir render kütüphanesi import etmez; bu sayede Node'da kafaüstü test edilebilir.
 * Görsel katman (Three.js) yalnızca bu durumu okur.
 */

import { moveBody, overlaps, blocked, approach } from "../core/physics.js";

export const TILE = 40;

export const TUNE = {
  w: 22,
  h: 46,

  run: 352,
  accelGround: 3600,
  accelAir: 2100,
  frictionGround: 3900,
  frictionAir: 520,

  gravity: 2500,
  maxFall: 1400,
  jump: 840,
  jumpCut: 0.42,

  coyote: 0.1,
  buffer: 0.12,
  lookAhead: 90,
};

/* --------------------------------------------------------------- ayrıştır */

function classOf(ch) {
  if (ch === "#") return "solid";
  if (ch === "l") return "light";
  if (ch === "s") return "shadow";
  return null;
}

export function parseStage(def) {
  const rows = def.rows;
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));

  const grid = [];
  const sets = { solid: [], light: [], shadow: [] };
  const hazards = [];
  const checkpoints = [];
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
      else if (ch === "l") sets.light.push(box);
      else if (ch === "s") sets.shadow.push(box);
      else if (ch === "^") hazards.push(box);
      else if (ch === "P") spawn = { x: px, y: py };
      else if (ch === "E") exit = box;
      else if (ch === "C") checkpoints.push(box);
    }
    grid.push(gridRow);
  }

  const cache = {};

  return {
    def, grid, cols: w, rows: h,
    pxW: w * TILE, pxH: h * TILE,
    sets, hazards, checkpoints,
    spawn: spawn ?? { x: TILE, y: TILE },
    exit,
    solidsFor(phase) {
      const key = phase === "shadow" ? "shadow" : "light";
      if (!cache[key]) cache[key] = sets.solid.concat(sets[key]);
      return cache[key];
    },
  };
}

/* ------------------------------------------------------------------ dünya */

export function createWorld(def, view = { w: 1280, h: 720 }) {
  const stage = parseStage(def);
  const w = {
    stage,
    def,
    view,
    phase: def.startPhase ?? "light",
    chase: !!def.chase,

    player: null,
    cam: { x: 0, y: 0 },

    deaths: 0,
    dead: false,
    respawnIn: 0,
    done: false,
    finished: false,

    checkpoint: null,
    denyIn: 0,          // "burada değiştirilemez" mesajı için geri sayım
    chaseX: -9999,      // kaçış sahnesinde avcının konumu
    events: [],         // bu karede oluşan olaylar (render/audio tarafı tüketir)
  };

  respawn(w, true);
  snapCam(w);
  return w;
}

function makePlayer(x, y, phase) {
  return {
    x, y, w: TUNE.w, h: TUNE.h,
    vx: 0, vy: 0,
    onGround: false,
    facing: 1,
    phase,
    coyote: 0, buffer: 0, jumpHeld: false,
    step: 0, anim: 0,
    alive: true,
  };
}

export function respawn(w, first = false) {
  const at = first || !w.checkpoint ? w.stage.spawn : w.checkpoint;
  w.player = makePlayer(
    at.x + (TILE - TUNE.w) / 2,
    at.y + TILE - TUNE.h,
    w.def.startPhase ?? "light",
  );
  w.phase = w.player.phase;
  w.dead = false;
  snapCam(w);
  if (w.chase) w.chaseX = w.player.x - 620;
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

/* --------------------------------------------------------------------- faz */

export function togglePhase(w) {
  const next = w.phase === "light" ? "shadow" : "light";
  if (blocked(w.player, w.stage.solidsFor(next))) {
    w.denyIn = 1.4;
    w.events.push({ type: "deny" });
    return false;
  }
  w.phase = next;
  w.player.phase = next;
  w.events.push({ type: "phase", phase: next });
  return true;
}

/* ------------------------------------------------------------------- akış */

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
  const solids = s.solidsFor(w.phase);

  const left = input.down("ArrowLeft", "KeyA");
  const right = input.down("ArrowRight", "KeyD");
  const jumpHeld = input.down("Space", "ArrowUp", "KeyW");
  const jumpHit = input.hit("Space", "ArrowUp", "KeyW");

  const dir = (right ? 1 : 0) - (left ? 1 : 0);

  const wasAir = !p.onGround;

  if (dir !== 0) {
    const accel = p.onGround ? TUNE.accelGround : TUNE.accelAir;
    p.vx = approach(p.vx, dir * TUNE.run, accel * dt);
    p.facing = dir;
  } else {
    const fric = (p.onGround ? TUNE.frictionGround : TUNE.frictionAir) * dt;
    p.vx = approach(p.vx, 0, fric);
  }

  p.vy = Math.min(p.vy + TUNE.gravity * dt, TUNE.maxFall);

  p.coyote = p.onGround ? TUNE.coyote : Math.max(0, p.coyote - dt);
  p.buffer = jumpHit ? TUNE.buffer : Math.max(0, p.buffer - dt);

  if (p.buffer > 0 && p.coyote > 0) {
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

  moveBody(p, p.vx * dt, p.vy * dt, solids);

  if (wasAir && p.onGround) w.events.push({ type: "land" });

  // adım sesi için yürüyüş birikimi
  if (p.onGround && Math.abs(p.vx) > 30) {
    const before = p.step;
    p.step += Math.abs(p.vx) * dt;
    if (Math.floor(p.step / 46) !== Math.floor(before / 46)) w.events.push({ type: "step" });
  } else if (p.onGround) {
    p.step = 0;
  }

  p.anim += (p.onGround ? Math.abs(p.vx) : 120) * dt;

  // tehlike
  for (let i = 0; i < s.hazards.length; i++) {
    if (overlaps(p, s.hazards[i])) { die(w, "hazard"); return; }
  }
  if (p.y > s.pxH + 160) { die(w, "void"); return; }

  // kontrol noktası
  for (let i = 0; i < s.checkpoints.length; i++) {
    const c = s.checkpoints[i];
    if (overlaps(p, c) && w.checkpoint !== c) {
      w.checkpoint = c;
      w.events.push({ type: "checkpoint" });
    }
  }

  // çıkış
  if (s.exit && overlaps(p, s.exit)) w.events.push({ type: "exit" });
}

function updateChase(w, dt) {
  if (!w.chase || w.dead) return;
  const p = w.player;
  const speed = TUNE.run * 0.72 + Math.sin(performanceNow() / 900) * 26;
  // avcı hep geride kalır ama çok yaklaşırsa yakalar
  w.chaseX = Math.min(w.chaseX + speed * dt, p.x - 40);
  if (w.chaseX > p.x - 96) die(w, "chase");
}

let _now = 0;
function performanceNow() { return _now; }

export function updateWorld(w, dt, input) {
  _now += dt * 1000;
  w.events.length = 0;

  if (w.denyIn > 0) w.denyIn -= dt;

  if (input.hit("KeyR")) {
    respawn(w);
    w.checkpoint = null;
    w.events.push({ type: "restart" });
  } else if (w.dead) {
    w.respawnIn -= dt;
    if (w.respawnIn <= 0) respawn(w);
  } else if (!w.done) {
    if (input.hit("ShiftLeft", "ShiftRight", "KeyQ")) togglePhase(w);
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
