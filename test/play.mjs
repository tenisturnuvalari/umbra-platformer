// Kesintisiz dünyayı oynayan bot — tüm bölümleri geçebiliyor mu? (geçici araç)
import { WORLD } from "../src/levels/index.js";
import { createWorld, updateWorld } from "../src/game/world.js";

function makeInput() {
  const held = new Set();
  const pressed = new Set();
  return {
    down: (...c) => c.some((x) => held.has(x)),
    hit: (...c) => c.some((x) => pressed.has(x)),
    set(keys) { held.clear(); for (const k of keys) held.add(k); },
    tap(k) { pressed.add(k); },
    end() { pressed.clear(); },
  };
}

const solidAt = (w, col, row) => w.stage.grid[row]?.[col] === "#";
const ladderCell = (w, col, row) => w.stage.grid[row]?.[col] === "L";

// Tek karar: yürü / tırman / platformu bekle / çukuru zıpla
function decide(w) {
  const p = w.player;
  if (w.dead) return { keys: [] };
  if (p.climbing) return { keys: ["KeyW"] };          // merdivende yukarı

  const feetY = p.y + p.h;
  const feetRow = Math.floor(feetY / 40);
  const aheadX = p.x + p.w + 5;                        // hemen önümüzdeki nokta (piksel)
  const aheadCol = Math.floor(aheadX / 40);
  const playerCol = Math.floor((p.x + p.w / 2) / 40);

  // 1) önde destek var mı? (statik zemin / 1 basamak yukarı / platform)
  const staticAhead = solidAt(w, aheadCol, feetRow) || solidAt(w, aheadCol, feetRow - 1);
  const platAhead = w.platforms.some(
    (pl) => aheadX >= pl.x && aheadX < pl.x + pl.w && Math.abs(feetY - pl.y) < 6,
  );
  if (staticAhead || platAhead) return { keys: ["KeyD"] };

  // 2) altta zemin var mı → güvenle in (sırık sonu / basamak aşağı)
  for (let r = feetRow; r <= feetRow + 6; r++) if (solidAt(w, aheadCol, r)) return { keys: ["KeyD"] };

  // 3) derin boşluk
  if (ladderCell(w, playerCol, feetRow - 1) || ladderCell(w, playerCol, feetRow - 2)) {
    return { keys: ["KeyW"] };                          // çıkış merdiveni → tırman
  }
  const shoreEdge = aheadCol * 40;                      // boşluğun başlangıcı
  const nearPlat = w.platforms.some(
    (pl) => pl.x + pl.w > shoreEdge - 40 && pl.x < shoreEdge + 900,
  );
  if (nearPlat) return { keys: [] };                    // bu boşlukta platform var → hizasını bekle
  return { keys: ["KeyD"], tap: "Space" };              // çukur → küçük sıçrama
}

const w = createWorld(WORLD, { w: 1280, h: 720 });
const input = makeInput();
for (let i = 0; i < 90; i++) { updateWorld(w, 1 / 60, input); input.end(); }

const maxFrames = 60 * 300;
let frames = 0;
let lastSec = -1;
const log = [];
let jumpHold = 0;           // zıplamada Space'i tepeye kadar basılı tut (jumpCut'a karşı)

while (frames < maxFrames && !w.finished) {
  if (w.dead) { input.set([]); updateWorld(w, 1 / 60, input); input.end(); frames++; continue; }

  const d = decide(w);
  const keys = [...d.keys];
  let jumpNow = false;
  if (d.tap === "Space" && jumpHold <= 0) { jumpHold = 16; jumpNow = true; }
  if (jumpHold > 0) { keys.push("Space"); jumpHold--; }
  input.set(keys);
  if (jumpNow) input.tap("Space");
  updateWorld(w, 1 / 60, input);
  input.end();
  frames++;

  if (process.env.DBG) {
    const c = (w.player.x + w.player.w / 2) / 40;
    if (c > 768 && c < 805 && frames % 10 === 0) {
      const pl0 = w.platforms[0];
      console.log(`f${frames} x=${Math.round(w.player.x)} y=${Math.round(w.player.y)} onG=${w.player.onGround} plat.x=${Math.round(pl0.x)} keys=${keys.join("+")}`);
    }
  }

  const col = (w.player.x + w.player.w / 2) / 40;
  const sec = WORLD.sections.findIndex((s) => col < s.to);
  if (sec !== lastSec) { lastSec = sec; log.push({ sec, frame: frames }); }
  if (w.events.some((e) => e.type === "exit")) break;
}

const reached = w.events.some((e) => e.type === "exit");

console.log("Bölümler:");
const durs = [];
for (let i = 0; i < log.length; i++) {
  const s = WORLD.sections[log[i].sec];
  const from = log[i].frame;
  const to = i + 1 < log.length ? log[i + 1].frame : frames;
  const dur = (to - from) / 60;
  durs.push(dur);
  console.log(`  ${s.sub} ${s.name.padEnd(8)} ${dur.toFixed(1)} sn`);
}

console.log(`\nToplam: ${frames} kare = ${(frames / 60).toFixed(1)} sn, ölüm: ${w.deaths}`);
console.log(`x=${Math.round(w.player.x)} / çıkış=${w.stage.exit.x}`);
console.log(reached ? "ÇIKIŞA ULAŞTI ✓" : "ÇIKIŞA ULAŞAMADI ✗");

if (!reached) {
  console.error("\nHATA: bot dünyayı tamamlayamadı.");
  process.exit(1);
}
const shortSec = durs.findIndex((d) => d < 38);
if (shortSec >= 0) {
  console.error(`\nHATA: Bölüm ${WORLD.sections[log[shortSec].sec].sub} çok kısa (${durs[shortSec].toFixed(1)}sn < 38sn).`);
  process.exit(1);
}
