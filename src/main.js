import { STAGES } from "./levels/index.js";
import { createWorld, updateWorld, respawn } from "./game/world.js";
import { Input } from "./core/input.js";
import { GameAudio } from "./core/audio.js";
import { StageScene } from "./render/scene.js";

const el = {
  boot: document.getElementById("boot"),
  start: document.getElementById("start"),
  hud: document.getElementById("hud"),
  title: document.querySelector("#stage-title b"),
  sub: document.getElementById("stage-sub"),
  phase: document.getElementById("phase"),
  hint: document.getElementById("hint"),
  deaths: document.getElementById("deaths"),
  sound: document.getElementById("sound"),
  restart: document.getElementById("restart"),
  flash: document.getElementById("flash"),
};

const container = document.getElementById("stage");

let scene;
try {
  scene = new StageScene(container);
} catch (err) {
  el.boot.querySelector(".boot-inner").innerHTML =
    "<h1>UMBRA</h1><p class='sub'>WebGL başlatılamadı — donanım hızlandırma kapalı olabilir.</p>";
  throw err;
}

const input = new Input();
const audio = new GameAudio();

let index = 0;
let world = null;
let started = false;
let totalDeaths = 0;
let finished = false;

function flash(kind) {
  el.flash.classList.remove("hit", "death");
  void el.flash.offsetWidth;          // animasyonu yeniden tetikle
  el.flash.classList.add(kind);
}

function updateHud() {
  const def = STAGES[index];
  el.title.textContent = def.name;
  el.sub.textContent = def.sub;
  el.phase.dataset.phase = world.phase;
  el.phase.textContent = world.phase === "light" ? "Faz · Işık" : "Faz · Gölge";
  el.deaths.textContent = `${totalDeaths} ölüm`;
}

function loadStage(i) {
  index = i;
  finished = false;
  world = createWorld(STAGES[i], { w: scene.width, h: scene.height });
  scene.load(world);
  if (scene.bloomPass) scene.bloomPass.strength = STAGES[i].ambience.bloom;
  audio.setAmbience({ rain: STAGES[i].ambience.rain, wind: STAGES[i].ambience.wind });
  updateHud();
}

scene.onLightning = () => audio.thunder(0.5 + Math.random() * 1.6);

/* ------------------------------------------------------------------ olaylar */

function handleEvents(events) {
  for (const e of events) {
    switch (e.type) {
      case "jump": audio.jump(); break;
      case "land": audio.land(); break;
      case "step": audio.step(); break;
      case "phase": audio.phase(); updateHud(); break;
      case "deny": audio.deny(); break;
      case "checkpoint": audio.checkpoint(); break;
      case "death":
        totalDeaths += 1;
        audio.death();
        flash("death");
        scene.shake = 1.3;
        el.deaths.textContent = `${totalDeaths} ölüm`;
        break;
      case "exit": nextStage(); break;
      default: break;
    }
  }
}

function nextStage() {
  const next = index + 1;
  if (next < STAGES.length) {
    audio.exit();
    flash("hit");
    loadStage(next);
  } else {
    finished = true;
    world.done = true;
    audio.exit();
    el.title.textContent = "Demo sonu";
    el.sub.textContent = "UMBRA";
    el.hint.textContent =
      "Dört aşama tamamlandı · R ile baştan başla · Yeni aşamalar için repo'ya bak";
  }
}

/* --------------------------------------------------------------- ana döngü */

let last = performance.now();

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  if (world) {
    if (started && !finished) {
      world.view.w = scene.width;
      world.view.h = scene.height;
      handleEvents(updateWorld(world, dt, input));
    }

    // ipucu metni (faz değişimi reddedildiyse geçici uyarı)
    if (!finished) {
      el.hint.textContent = world.denyIn > 0
        ? "Burada faz değiştirilemez — bloğun içine girerdin."
        : STAGES[index].hint;
      if (el.phase.dataset.phase !== world.phase) updateHud();
    }

    scene.sync(world, dt);
    scene.render();
  }

  requestAnimationFrame(frame);
}

/* ------------------------------------------------------------------- başlat */

el.start.addEventListener("click", () => {
  audio.init();
  audio.resume();
  started = true;
  el.boot.classList.add("off");
  el.hud.classList.add("on");
  last = performance.now();
});

el.sound.addEventListener("click", () => {
  audio.enabled = !audio.enabled;
  audio.setMuted(!audio.enabled);
  el.sound.textContent = audio.enabled ? "Ses · Açık" : "Ses · Kapalı";
});

el.restart.addEventListener("click", () => {
  if (!world) return;
  if (finished) { loadStage(0); return; }
  world.checkpoint = null;
  respawn(world);
  updateHud();
});

window.addEventListener("keydown", (e) => {
  if (e.code === "Enter" && !started) el.start.click();
});

loadStage(0);
requestAnimationFrame(frame);
