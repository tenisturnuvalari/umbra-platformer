const LOOK = 70;
const SMOOTH = 7; // büyük = daha hızlı takip

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
  }

  #desired(p, level, screen) {
    const cx = p.x + p.w / 2 + p.facing * LOOK;
    const cy = p.y + p.h / 2 - 36;
    let x = cx - screen.width / 2;
    let y = cy - screen.height / 2;

    if (level.pxW <= screen.width) x = (level.pxW - screen.width) / 2;
    else x = clamp(x, 0, level.pxW - screen.width);

    if (level.pxH <= screen.height) y = (level.pxH - screen.height) / 2;
    else y = clamp(y, 0, level.pxH - screen.height);

    return { x, y };
  }

  snap(p, level, screen) {
    const d = this.#desired(p, level, screen);
    this.x = d.x;
    this.y = d.y;
  }

  follow(p, level, screen, dt) {
    const d = this.#desired(p, level, screen);
    const k = 1 - Math.exp(-SMOOTH * dt);
    this.x += (d.x - this.x) * k;
    this.y += (d.y - this.y) * k;
  }
}
