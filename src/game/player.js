import { Container, Graphics } from "pixi.js";
import { moveBody, overlaps, approach } from "../core/physics.js";

/**
 * Oyuncu "hissi" burada ayarlanır.
 * Bu değerleri değiştirmek oyunun tamamen farklı hissettirmesini sağlar;
 * ben test edemediğim için son karar senin denemene kalmalı.
 */
export const TUNE = {
  w: 22,
  h: 44,

  run: 330,           // azami koşu hızı (px/sn)
  accelGround: 3400,  // yere ivme
  accelAir: 2000,     // havada ivme (daha az = "ağırlık" hissi)
  frictionGround: 3800,
  frictionAir: 520,

  gravity: 2500,
  maxFall: 1350,
  jump: 830,          // zıplama hızı → ~135px yükseklik
  jumpCut: 0.42,      // tuşu erken bırakınca zıplama kesilir (klasik "kisa zıplama")

  coyote: 0.1,        // platformdan düştükten sonra hâlâ zıplayabilme (sn)
  buffer: 0.12,       // yere değmeden önce basılan zıplama tamponu (sn)
  lookAhead: 70,      // kamera ileri bakışı
};

export function createPlayer(spawn, phase = "light") {
  return {
    x: spawn.x + (TUNE.w > 0 ? (40 - TUNE.w) / 2 : 0),
    y: spawn.y + 40 - TUNE.h,
    w: TUNE.w,
    h: TUNE.h,
    vx: 0,
    vy: 0,
    onGround: false,
    facing: 1,
    phase,
    coyote: 0,
    buffer: 0,
    jumpHeld: false,
    step: 0,
  };
}

/** @returns {{died:boolean, exited:boolean}} */
export function updatePlayer(p, dt, input, level) {
  const solids = level.solidsFor(p.phase);

  const left = input.down("ArrowLeft", "KeyA");
  const right = input.down("ArrowRight", "KeyD");
  const jumpHeld = input.down("Space", "ArrowUp", "KeyW");
  const jumpHit = input.hit("Space", "ArrowUp", "KeyW");

  const dir = (right ? 1 : 0) - (left ? 1 : 0);

  if (dir !== 0) {
    const accel = p.onGround ? TUNE.accelGround : TUNE.accelAir;
    p.vx = approach(p.vx, dir * TUNE.run, accel * dt);
    p.facing = dir;
  } else {
    const fric = (p.onGround ? TUNE.frictionGround : TUNE.frictionAir) * dt;
    p.vx = approach(p.vx, 0, fric);
  }

  p.vy = Math.min(p.vy + TUNE.gravity * dt, TUNE.maxFall);

  // coyote time + jump buffer: "olması gerektiğinde" zıplama duygusu
  p.coyote = p.onGround ? TUNE.coyote : Math.max(0, p.coyote - dt);
  p.buffer = jumpHit ? TUNE.buffer : Math.max(0, p.buffer - dt);

  if (p.buffer > 0 && p.coyote > 0) {
    p.vy = -TUNE.jump;
    p.buffer = 0;
    p.coyote = 0;
    p.onGround = false;
    p.jumpHeld = true;
  }
  if (!jumpHeld && p.vy < 0 && p.jumpHeld) {
    p.vy *= TUNE.jumpCut;
    p.jumpHeld = false;
  }
  if (p.vy >= 0) p.jumpHeld = false;

  moveBody(p, p.vx * dt, p.vy * dt, solids);
  if (p.onGround && Math.abs(p.vx) > 10) p.step += Math.abs(p.vx) * dt;
  else if (p.onGround) p.step = 0;

  const events = { died: false, exited: false };

  for (let i = 0; i < level.hazards.length; i++) {
    if (overlaps(p, level.hazards[i])) { events.died = true; break; }
  }
  if (p.y > level.pxH + 200) events.died = true;   // boşluğa düşme
  if (level.exit && overlaps(p, level.exit)) events.exited = true;

  return events;
}

/** Silüet görseli: siyah gövde, beyaz gözler, faza göre aura. */
export function createPlayerGraphics(p) {
  const root = new Container();

  const aura = new Graphics();
  const body = new Graphics();
  const eyes = new Graphics();

  body.roundRect(-p.w / 2, -p.h / 2, p.w, p.h, 7).fill(0x05060a);
  body.circle(0, -p.h / 2 + 2, 9).fill(0x05060a);          // baş
  body.rect(-4, p.h / 2 - 10, 3, 10).fill(0x05060a);       // bacaklar (basit)
  body.rect(1, p.h / 2 - 10, 3, 10).fill(0x05060a);

  eyes.circle(-3, 0, 2.5).fill(0xffffff);
  eyes.circle(3.5, 0, 2.5).fill(0xffffff);

  root.addChild(aura, body, eyes);
  return { root, aura, body, eyes };
}

export function paintAura(gfx, p) {
  const color = p.phase === "light" ? 0xf0a03c : 0x4fd6ff;
  gfx.aura.clear();
  gfx.aura
    .roundRect(-p.w / 2 - 2, -p.h / 2 - 2, p.w + 4, p.h + 4, 9)
    .stroke({ width: 2, color, alpha: 0.75 });
}

export function syncPlayerGraphics(p, gfx) {
  gfx.root.position.set(p.x + p.w / 2, p.y + p.h / 2);
  gfx.body.scale.x = p.facing;
  gfx.eyes.position.set(p.facing > 0 ? 3.5 : -3.5, -p.h / 2 + 4);
  gfx.eyes.scale.x = p.facing;
}
