/**
 * UMBRA — bağımsız AABB süpürme fizigi.
 *
 * Neden kendi fizik motorumuz: PixiJS sadece çizim yapar, kutu-fizik vermez.
 * Süpürme (sweep) + alt adım (substep) yaklaşımı, hızlı düşen cisimlerin
 * duvarların içinden geçmesini ("tunneling") engeller.
 */

/** Tek adımda en fazla hareket edilecek piksel. Büyüdükçe içinden geçme riski artar. */
const MAX_SUBSTEP = 4;

export function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function approach(value, target, delta) {
  if (value < target) return Math.min(value + delta, target);
  if (value > target) return Math.max(value - delta, target);
  return target;
}

function sweep(body, amount, axis, solids, out) {
  if (amount === 0) return;
  let rest = amount;

  while (Math.abs(rest) > 1e-6) {
    const step = rest > 0 ? Math.min(rest, MAX_SUBSTEP) : Math.max(rest, -MAX_SUBSTEP);
    rest -= step;

    if (axis === "x") body.x += step;
    else body.y += step;

    for (let i = 0; i < solids.length; i++) {
      const s = solids[i];
      if (!overlaps(body, s)) continue;

      if (axis === "x") {
        body.x = step > 0 ? s.x - body.w : s.x + s.w;
        body.vx = 0;
        out.hitX = true;
      } else {
        body.y = step > 0 ? s.y - body.h : s.y + s.h;
        body.vy = 0;
        out.hitY = true;
        if (step > 0) out.landed = true;
        else out.bonked = true;
      }
    }
  }
}

/**
 * Cisimleri kaydırır ve çarpışmaları çözer.
 * @returns {{hitX:boolean, hitY:boolean, landed:boolean, bonked:boolean}}
 */
export function moveBody(body, dx, dy, solids) {
  const out = { hitX: false, hitY: false, landed: false, bonked: false };
  sweep(body, dx, "x", solids, out);
  sweep(body, dy, "y", solids, out);
  body.onGround = out.landed;
  return out;
}

/** Verilen dikdörtgen herhangi bir solid ile kesişiyor mu? (faz değişimi güvenliği için) */
export function blocked(box, solids) {
  for (let i = 0; i < solids.length; i++) {
    if (overlaps(box, solids[i])) return true;
  }
  return false;
}

export { approach };
