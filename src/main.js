import { Application, Container, Graphics } from "pixi.js";

import { Input } from "./core/input.js";
import { blocked, overlaps } from "./core/physics.js";
import { LEVELS } from "./levels/index.js";
import { parseLevel, buildLevelGraphics } from "./game/level.js";
import { Camera } from "./game/camera.js";
import {
  TUNE,
  createPlayer,
  updatePlayer,
  createPlayerGraphics,
  paintAura,
  syncPlayerGraphics,
} from "./game/player.js";

/* ------------------------------------------------------------------ sahne */

const app = new Application();
await app.init({
  resizeTo: window,
  backgroundAlpha: 0,
  antialias: true,
  autoDensity: true,
  resolution: Math.min(window.devicePixelRatio || 1, 2),
});
document.getElementById("game").appendChild(app.canvas);

const far = new Container();   // paralaks: tepeler + sis
const world = new Container(); // kameraya bağlı oyun dünyası
app.stage.addChild(far, world);

const hud = {
  level: document.getElementById("level-name"),
  phase: document.getElementById("phase"),
  hint: document.getElementById("hint"),
  deaths: document.getElementById("deaths"),
  flash: document.getElementById("flash"),
};

const input = new Input();
const camera = new Camera();

const state = {
  index: 0,
  phase: "light",
  deaths: 0,
  dead: false,
  done: false,
  respawnAt: 0,
};

let level = null;
let player = null;
let levelGfx = null;
let playerGfx = null;
let backdrop = null;

/* ------------------------------------------------------------- arka plan */

function makeBackdrop(index, pxW, pxH) {
  const g = new Container();
  const hills = new Graphics();
  const fog = new Graphics();

  let seed = 1337 + index * 977;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  // uzak tepe silüetleri (paralaks 0.35)
  const base = pxH * 0.72;
  for (let layer = 0; layer < 2; layer++) {
    const tone = layer === 0 ? 0x12161b : 0x0c0f13;
    const amp = 90 - layer * 25;
    const y0 = base - layer * 40;
    const pts = [-200, pxH + 100, -200, y0];
    for (let x = -200; x <= pxW + 200; x += 90) {
      pts.push(x, y0 - rnd() * amp);
    }
    pts.push(pxW + 200, pxH + 100);
    hills.poly(pts).fill(tone);
  }

  // sis küteleri (paralaks 0.55)
  for (let i = 0; i < 9; i++) {
    fog.circle(rnd() * pxW, pxH * (0.35 + rnd() * 0.5), 90 + rnd() * 190)
      .fill({ color: 0xdfe6ee, alpha: 0.02 + rnd() * 0.03 });
  }

  g.addChild(hills, fog);
  return g;
}

/* ---------------------------------------------------------------- seviye */

function loadLevel(i) {
  state.index = i;

  if (levelGfx) { world.removeChild(levelGfx.root); levelGfx.root.destroy({ children: true }); }
  if (playerGfx) { world.removeChild(playerGfx.root); playerGfx.root.destroy({ children: true }); }
  if (backdrop) { far.removeChild(backdrop); backdrop.destroy({ children: true }); }

  level = parseLevel(LEVELS[i]);
  levelGfx = buildLevelGraphics(level);
  world.addChild(levelGfx.root);

  backdrop = makeBackdrop(i, level.pxW, level.pxH);
  far.addChild(backdrop);

  player = createPlayer(level.spawn, level.startPhase);
  playerGfx = createPlayerGraphics(player);
  world.addChild(playerGfx.root);

  state.phase = level.startPhase;
  state.dead = false;
  state.done = false;

  applyPhase();
  sync();
  camera.snap(player, level, app.screen);

  hud.level.textContent = LEVELS[i].name;
  hud.hint.textContent = LEVELS[i].hint;
  updateDeaths();
}

function respawn() {
  player = createPlayer(level.spawn, level.startPhase);
  state.phase = level.startPhase;
  state.dead = false;
  applyPhase();
  sync();
  camera.snap(player, level, app.screen);
}

function die() {
  if (state.dead) return;
  state.dead = true;
  state.deaths += 1;
  updateDeaths();
  hud.flash.classList.add("on");
  setTimeout(() => hud.flash.classList.remove("on"), 70);
  setTimeout(respawn, 420);
}

function updateDeaths() {
  hud.deaths.textContent = `${state.deaths} ölüm`;
}

/* ------------------------------------------------------------------ faz */

function applyPhase() {
  const isLight = state.phase === "light";
  levelGfx.gLight.alpha = isLight ? 1 : 0.16;
  levelGfx.gShadow.alpha = isLight ? 0.16 : 1;
  player.phase = state.phase;
  paintAura(playerGfx, player);
  hud.phase.dataset.phase = state.phase;
  hud.phase.textContent = isLight ? "Faz · Işık" : "Faz · Gölge";
}

function tryTogglePhase() {
  if (state.dead || state.done) return;
  const next = state.phase === "light" ? "shadow" : "light";

  // o an yeni faza ait bir bloğun içine giriyorsak geçiş iptal (içinde kalma bug'ı yok)
  if (blocked(player, level.solidsFor(next))) {
    hud.hint.textContent = "Burada faz değiştirilemez — bloğun içine girerdin.";
    clearTimeout(tryTogglePhase._t);
    tryTogglePhase._t = setTimeout(() => {
      hud.hint.textContent = LEVELS[state.index].hint;
    }, 1400);
    return;
  }

  state.phase = next;
  applyPhase();
}

/* ------------------------------------------------------------------ çizim */

function sync() {
  syncPlayerGraphics(player, playerGfx);
}

app.ticker.add((ticker) => {
  const dt = Math.min(ticker.deltaMS, 50) / 1000;

  if (input.hit("KeyR")) {
    loadLevel(state.done ? 0 : state.index);
  } else if (!state.dead && !state.done) {
    if (input.hit("ShiftLeft", "ShiftRight", "KeyQ")) tryTogglePhase();

    const events = updatePlayer(player, dt, input, level);
    if (events.died) die();
    else if (events.exited) {
      const next = state.index + 1;
      if (next < LEVELS.length) loadLevel(next);
      else {
        state.done = true;
        hud.level.textContent = "Demo sonu";
        hud.hint.textContent = "İki aşama tamamlandı. R ile başa dön — Aşama 3 (kaçış sahnesi) sıradaki commit'te.";
      }
    }
  }

  sync();
  camera.follow(player, level, app.screen, dt);
  world.position.set(-camera.x, -camera.y);
  far.position.set(-camera.x * 0.4, -camera.y * 0.55);

  // çıkış nabzı
  if (levelGfx) levelGfx.gExit.alpha = 0.65 + Math.sin(performance.now() / 320) * 0.35;

  input.endFrame();
});

loadLevel(0);
