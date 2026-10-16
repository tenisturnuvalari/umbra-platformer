import { WORLD, SECTIONS } from "./levels/index.js";
import { createWorld, updateWorld, respawn } from "./game/world.js";
import { Input } from "./core/input.js";
import { GameAudio } from "./core/audio.js";
import { StageScene } from "./render/scene.js";

const TILE = 40;

const el = {
  boot: document.getElementById("boot"),
  start: document.getElementById("start"),
  hud: document.getElementById("hud"),
  title: document.querySelector("#stage-title b"),
  sub: document.getElementById("stage-sub"),
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

// bloom + derinlik alanı; başarısız olursa sahne düz render ile çalışır
await scene.enablePost(WORLD.ambience.bloom);

let world = null;
let started = false;
let totalDeaths = 0;
let finished = false;
let curSec = 0;          // içinde bulunulan bölüm (index)

function flash(kind) {
  el.flash.classList.remove("hit", "death");
  void el.flash.offsetWidth;          // animasyonu yeniden tetikle
  el.flash.classList.add(kind);
}

/* ------------------------------------------------------------- dünya yükleme */

function loadWorld() {
  finished = false;
  curSec = 0;
  world = createWorld(WORLD, { w: scene.width, h: scene.height });
  scene.load(world);
  scene.aimAmbience(SECTIONS[0].ambience);
  setHudSection(0);
}

function setHudSection(i) {
  const s = SECTIONS[i];
  el.title.textContent = s.name;
  el.sub.textContent = s.sub;
  el.deaths.textContent = `${totalDeaths} ölüm`;
}

// oyuncunun X konumuna göre bölüm → HUD başlığı + ambiyan geçişi (kesintisiz)
function syncSection() {
  const p = world.player;
  const col = (p.x + p.w / 2) / TILE;
  let i = SECTIONS.length - 1;
  for (let k = 0; k < SECTIONS.length; k++) {
    if (col < SECTIONS[k].to) { i = k; break; }
  }
  if (i !== curSec) {
    curSec = i;
    setHudSection(i);
    scene.aimAmbience(SECTIONS[i].ambience);
    const a = SECTIONS[i].ambience;
    audio.setAmbience({ rain: a.rain, wind: a.wind });
  }
}

scene.onLightning = () => audio.thunder(0.5 + Math.random() * 1.6);

/* ------------------------------------------------------------------ olaylar */

function handleEvents(events) {
  for (const e of events) {
    switch (e.type) {
      case "jump": audio.jump(); break;
      case "land": audio.land(); break;
      case "step": audio.step(); break;
      case "grab": audio.grab(); break;
      case "grabOff": audio.grabOff(); break;
      case "ladderOn": audio.ladder(); break;
      case "climbStep": audio.climbStep(); break;
      case "checkpoint": audio.checkpoint(); break;
      case "death":
        totalDeaths += 1;
        audio.death();
        flash("death");
        scene.shake = 1.3;
        el.deaths.textContent = `${totalDeaths} ölüm`;
        break;
      case "exit": finishGame(); break;
      default: break;
    }
  }
}

function finishGame() {
  finished = true;
  world.done = true;
  audio.exit();
  el.title.textContent = "Demo sonu";
  el.sub.textContent = "UMBRA";
  el.hint.textContent =
    "Kesintisiz dünya tamamlandı · R ile baştan başla · Yeni bölümler için repo'ya bak";
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
      syncSection();               // X konumu → başlık + ambiyan
    }
    input.endFrame();               // "bu karede yeni basılanlar" (edge) temizlenir — yoksa hit() hep true kalır

    // ipucu metni (içinde bulunulan bölüm)
    if (!finished) el.hint.textContent = SECTIONS[curSec].hint;

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
  if (finished) { loadWorld(); return; }
  world.checkpoint = null;
  respawn(world);
  setHudSection(curSec);
});

window.addEventListener("keydown", (e) => {
  if (e.code === "Enter" && !started) el.start.click();
});

loadWorld();
requestAnimationFrame(frame);
