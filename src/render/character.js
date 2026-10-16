/**
 * Prosedürel 3D karakter iskeleti.
 *
 * Dürüst not: burada sculpt edilmiş/rig'lenmiş bir karakter modeli YOK.
 * Figür tamamen kodla kurulmuş kutu + kapsül parçalardan oluşur; animasyon
 * prosedüreldir (kalça/diz/omuz rotasyonları). Amaç: sinematik silüet hissi.
 */

import * as THREE from "three";

const DARK = 0x090b0f;

const GEO = {
  pelvis: new THREE.BoxGeometry(13, 7, 8),
  torso: new THREE.BoxGeometry(14, 15, 8.5),
  head: new THREE.CapsuleGeometry(4.6, 5, 4, 14),
  thigh: new THREE.BoxGeometry(5, 11, 5.5),
  shin: new THREE.BoxGeometry(4.4, 11, 5),
  arm: new THREE.BoxGeometry(4, 15, 4.5),
  eye: new THREE.SphereGeometry(1.5, 10, 8),
};

const MAT = {
  body: new THREE.MeshStandardMaterial({ color: DARK, roughness: 0.78, metalness: 0.08 }),
  eye: new THREE.MeshBasicMaterial({ color: 0xf2f8ff }),
};

function rimMaterial(color) {
  return new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
}

/** karanlık gövde + dış hat (outline) çiftini üretir */
function part(geo, rimMat) {
  const g = new THREE.Group();
  const inner = new THREE.Mesh(geo, MAT.body);
  inner.castShadow = true;
  const outer = new THREE.Mesh(geo, rimMat);
  outer.scale.setScalar(1.11);
  g.add(outer, inner);
  return g;
}

export class Character {
  constructor(rimColor = 0x7d97b2) {
    this.rimMat = rimMaterial(rimColor);
    this.root = new THREE.Group();

    this.hips = new THREE.Group();
    this.hips.position.y = 15;
    this.root.add(this.hips);

    const pelvis = part(GEO.pelvis, this.rimMat);
    pelvis.position.y = 3.5;
    this.hips.add(pelvis);

    const torso = part(GEO.torso, this.rimMat);
    torso.position.y = 14;
    this.hips.add(torso);

    const head = part(GEO.head, this.rimMat);
    head.position.y = 27;
    this.hips.add(head);

    const eyes = new THREE.Group();
    const e1 = new THREE.Mesh(GEO.eye, MAT.eye);
    const e2 = new THREE.Mesh(GEO.eye, MAT.eye);
    e1.position.set(-2.1, 0, 4.1);
    e2.position.set(2.3, 0, 4.1);
    eyes.add(e1, e2);
    eyes.position.y = 28;
    this.hips.add(eyes);
    this.eyes = eyes;

    // bacaklar (kalça → diz)
    this.legs = [-1, 1].map((side) => {
      const hip = new THREE.Group();
      hip.position.set(side * 3.6, 0, 0);
      const thigh = part(GEO.thigh, this.rimMat);
      thigh.position.y = -5.5;
      hip.add(thigh);

      const knee = new THREE.Group();
      knee.position.y = -11;
      const shin = part(GEO.shin, this.rimMat);
      shin.position.y = -5.5;
      knee.add(shin);
      hip.add(knee);

      this.hips.add(hip);
      return { hip, knee };
    });

    // kollar (omuz)
    this.arms = [-1, 1].map((side) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 8.4, 20, 0);
      const arm = part(GEO.arm, this.rimMat);
      arm.position.y = -7.5;
      shoulder.add(arm);
      this.hips.add(shoulder);
      return { shoulder };
    });

    this.phase = 0;
    this.breathe = Math.random() * 10;
  }

  setRim(color) {
    this.rimMat.color.setHex(color);
  }

  /**
   * @param {object} o  { mode:'idle'|'run'|'air'|'dead', speed, facing, dt, airborne }
   */
  pose(o) {
    const { mode, speed = 0, facing = 1, dt = 1 / 60 } = o;
    this.breathe += dt;
    this.root.scale.x = facing;

    let hipRot = 0;
    let kneeRot = 0;
    let armRot = 0;
    let bob = 0;
    let lean = 0;

    if (mode === "air") {
      hipRot = -0.55;
      kneeRot = 0.85;
      armRot = -1.9;
      lean = 0.12;
      bob = 0;
    } else if (mode === "dead") {
      hipRot = 0.4;
      kneeRot = 0.3;
      armRot = 2.4;
      lean = 0.5;
    } else {
      const cadence = Math.min(speed / 240, 1.35);
      this.phase += dt * (5 + cadence * 9);
      const s = Math.sin(this.phase);
      const c = Math.cos(this.phase);

      hipRot = s * 0.85 * cadence;
      kneeRot = Math.max(0, -c) * 1.0 * cadence;
      armRot = -s * 0.72 * cadence;
      bob = Math.abs(c) * 1.4 * cadence;
      lean = 0.06 + cadence * 0.1;

      if (mode === "idle" || cadence < 0.05) {
        hipRot = 0; kneeRot = 0; armRot = 0; bob = 0; lean = 0.02;
        const br = Math.sin(this.breathe * 1.6) * 0.5;
        this.hips.position.y = 15 + br;
        this.hips.rotation.z = 0;
        this.arms[0].shoulder.rotation.z = -0.08 + br * 0.02;
        this.arms[1].shoulder.rotation.z = 0.08 - br * 0.02;
        this.legs.forEach((l) => { l.hip.rotation.x = 0; l.knee.rotation.x = 0; });
        return;
      }
    }

    this.hips.position.y = 15 + bob;
    this.hips.rotation.z = -lean * 0.35;
    this.hips.rotation.x = lean;

    this.legs[0].hip.rotation.x = hipRot;
    this.legs[1].hip.rotation.x = mode === "run" ? -hipRot : hipRot;
    this.legs[0].knee.rotation.x = kneeRot;
    this.legs[1].knee.rotation.x = mode === "run"
      ? Math.max(0, Math.sin(this.phase)) * 1.05
      : kneeRot * 0.5;

    this.arms[0].shoulder.rotation.x = armRot;
    this.arms[1].shoulder.rotation.x = -armRot;
    this.eyes.position.x = facing > 0 ? 1.2 : -1.2;
  }

  dispose() {
    this.rimMat.dispose();
  }
}

/** Arkadan gelen avcı: alçak, dört ayaklı, uzun kuyruklu silüet. */
export class Creature {
  constructor(rimColor = 0xff6a5a) {
    this.rimMat = rimMaterial(rimColor);
    this.root = new THREE.Group();

    const spine = new THREE.Group();
    spine.position.y = 22;
    this.root.add(spine);

    const body = part(new THREE.BoxGeometry(46, 15, 15), this.rimMat);
    spine.add(body);

    const neck = new THREE.Group();
    neck.position.set(20, 4, 0);
    const head = part(new THREE.BoxGeometry(17, 11, 11), this.rimMat);
    head.position.set(7, 0, 0);
    neck.add(head);
    spine.add(neck);
    this.neck = neck;

    const tail = new THREE.Group();
    tail.position.set(-23, 3, 0);
    const t = part(new THREE.BoxGeometry(30, 3.5, 3.5), this.rimMat);
    t.position.set(-15, 0, 0);
    tail.add(t);
    spine.add(tail);
    this.tail = tail;

    this.legs = [];
    for (const [sx, front] of [[14, true], [-14, false]]) {
      for (const sz of [-6, 6]) {
        const hip = new THREE.Group();
        hip.position.set(sx, -6, sz);
        const leg = part(new THREE.BoxGeometry(5, 22, 5), this.rimMat);
        leg.position.y = -11;
        hip.add(leg);
        spine.add(hip);
        this.legs.push({ hip, front, off: sz > 0 ? Math.PI : 0 });
      }
    }

    this.spine = spine;
    this.phase = Math.random() * 6;
  }

  setRim(color) { this.rimMat.color.setHex(color); }

  pose(dt, speed) {
    this.phase += dt * (6 + speed / 90);
    const s = Math.sin(this.phase);
    this.spine.position.y = 22 + Math.abs(Math.cos(this.phase)) * 2.4;
    this.spine.rotation.z = s * 0.045;
    this.legs.forEach((l) => {
      l.hip.rotation.x = Math.sin(this.phase + l.off + (l.front ? 0 : 0.5)) * 1.0;
    });
    this.tail.rotation.z = -0.5 + Math.sin(this.phase * 0.7) * 0.28;
    this.neck.rotation.z = -0.12 + Math.sin(this.phase * 0.5) * 0.05;
  }

  dispose() { this.rimMat.dispose(); }
}
