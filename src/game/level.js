import { Container, Graphics } from "pixi.js";

export const TILE = 40;

const FILL = { solid: 0x07080a, light: 0x1d150c, shadow: 0x0b1220 };
const RIM = { solid: 0x6b7480, light: 0xf0a03c, shadow: 0x4fd6ff };
const HAZARD = 0xe6e9ec;

function classOf(ch) {
  if (ch === "#") return "solid";
  if (ch === "l") return "light";
  if (ch === "s") return "shadow";
  return null;
}

/** ASCII haritayı çalışılabilir bir seviyeye çevirir. */
export function parseLevel(def) {
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
    def,
    grid,
    cols: w,
    rows: h,
    pxW: w * TILE,
    pxH: h * TILE,
    hazards,
    checkpoints,
    spawn: spawn ?? { x: TILE, y: TILE },
    exit,
    startPhase: def.startPhase ?? "light",

    /** Verilen fazda katı olan tüm dikdörtgenler. */
    solidsFor(phase) {
      const key = phase === "shadow" ? "shadow" : "light";
      if (!cache[key]) cache[key] = sets.solid.concat(sets[key]);
      return cache[key];
    },
  };
}

/** Seviyenin görselini üretir (faz platformları ayrı katmanda, alpha ile söndürülür). */
export function buildLevelGraphics(level) {
  const root = new Container();
  const gSolid = new Graphics();
  const gLight = new Graphics();
  const gShadow = new Graphics();
  const gHaz = new Graphics();
  const gExit = new Graphics();

  const target = { solid: gSolid, light: gLight, shadow: gShadow };

  for (let y = 0; y < level.rows; y++) {
    for (let x = 0; x < level.cols; x++) {
      const ch = level.grid[y][x];
      const cls = classOf(ch);
      const px = x * TILE;
      const py = y * TILE;

      if (cls) {
        const g = target[cls];
        g.rect(px, py, TILE, TILE).fill(FILL[cls]);

        // sadece üst komşusu farklıysa "kenar ışığı" çiz — kütle bütünleşik görünür
        const above = y > 0 ? level.grid[y - 1][x] : "#";
        if (classOf(above) !== cls) g.rect(px, py, TILE, 3).fill(RIM[cls]);
      }

      if (ch === "^") {
        const above = y > 0 ? level.grid[y - 1][x] : ".";
        if (above !== "^") {
          const teeth = 4;
          const tw = TILE / teeth;
          for (let k = 0; k < teeth; k++) {
            const x0 = px + k * tw;
            gHaz.poly([
              x0, py + TILE,
              x0 + tw, py + TILE,
              x0 + tw / 2, py + 3,
            ]).fill(HAZARD);
          }
        }
      }

      if (ch === "E") {
        gExit.rect(px + 2, py + 2, TILE - 4, TILE - 4).fill({ color: 0xffffff, alpha: 0.1 });
        gExit.rect(px + TILE / 2 - 4, py + 6, 8, TILE - 12).fill({ color: 0xffffff, alpha: 0.92 });
      }
    }
  }

  root.addChild(gSolid, gLight, gShadow, gHaz, gExit);
  return { root, gLight, gShadow, gExit };
}
