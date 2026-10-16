/**
 * Prosedürel 3D penguen iskeleti.
 *
 * Dürüst not: burada sculpt edilmiş/rig'lenmiş bir karakter modeli YOK.
 * Penguen tamamen kodla kurulmuş küre + kutu parçalardan oluşur; animasyon
 * prosedüreldir. Yan görünümde bacaklar/kanatlar `rotation.z` ile sallanır
 * (yanal salınım görünür); eski rig'deki `rotation.x` hatası gövdeyi
 * kameradan uzaklaştırıp yaklaştırırdı — yan oyunda görünmezdi.
 */

import * as THREE from "three";

const DARK = 0x0b0e13;      // gövde: neredeyse silüet
const BELLY = 0x161d26;     // hafif açık karın — pengueni okunur kılar
const BEAK = 0x2a2f38;      // gagalar biraz daha seçik

function std(color, rough = 0.82, metal = 0.06) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}

function rimMaterial(color) {
  return new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
}

/** karanlık gövde + dış hat (outline) çiftini üretir */
function part(geo, rimMat, mat = null) {
  const g = new THREE.Group();
  const inner = new THREE.Mesh(geo, mat ?? std(DARK));
  inner.castShadow = true;
  const outer = new THREE.Mesh(geo, rimMat);
  outer.scale.setScalar(1.1);
  g.add(outer, inner);
  return g;
}

export class Character {
  constructor(rimColor = 0x7d97b2) {
    this.rimMat = rimMaterial(rimColor);
    this.root = new THREE.Group();

    // --- kalça: tüm gövde bundan sarkar; yürüyüşte sallanma (waddle) ve
    //     öne eğilme (lean) burada döner.
    this.hips = new THREE.Group();
    this.hips.position.y = 14;            // penguen kısa bacaklı → kalça alçak
    this.root.add(this.hips);

    // --- gövde (yumurta)
    const bodyGeo = new THREE.SphereGeometry(9, 18, 14);
    const body = part(bodyGeo, this.rimMat, std(DARK, 0.85));
    body.scale.set(0.9, 1.22, 0.98);
    body.position.y = 7;
    this.hips.add(body);

    // karın (hafif açık, yalnız ön yüzde)
    const bellyGeo = new THREE.SphereGeometry(6.6, 16, 12);
    const belly = new THREE.Mesh(bellyGeo, std(BELLY, 0.9));
    belly.scale.set(0.72, 1.12, 0.66);
    belly.position.set(2.4, 6, 0);
    this.hips.add(belly);

    // --- baş
    const head = new THREE.Group();
    head.position.y = 19;
    this.hips.add(head);
    this.head = head;

    const skullGeo = new THREE.SphereGeometry(6.2, 18, 14);
    const skull = part(skullGeo, this.rimMat, std(DARK, 0.85));
    head.add(skull);

    // gaga: ileri (+x) bakan koni
    const beakGeo = new THREE.ConeGeometry(2.3, 7, 10);
    const beak = new THREE.Mesh(beakGeo, std(BEAK, 0.6, 0.1));
    beak.rotation.z = -Math.PI / 2;        // koni +x'e bakar
    beak.position.set(6.4, -0.6, 0);
    beak.castShadow = true;
    head.add(beak);

    // gözler: başın ön-yan tarafında (±z)
    const eyeGeo = new THREE.SphereGeometry(1.35, 10, 8);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xeef6ff });
    const e1 = new THREE.Mesh(eyeGeo, eyeMat);
    const e2 = new THREE.Mesh(eyeGeo, eyeMat);
    e1.position.set(4.3, 1.6, 3.4);
    e2.position.set(4.3, 1.6, -3.4);
    head.add(e1, e2);

    // --- kanatlar (flipper): gövdenin iki yanında (±z), aşağı sarkar.
    //     Salınım rotation.z ile (yanal) — yan oyunda görünür.
    this.wings = [-1, 1].map((side) => {
      const sh = new THREE.Group();
      sh.position.set(0, 12, side * 8);
      const wingGeo = new THREE.BoxGeometry(3.2, 15, 5.5);
      const wing = part(wingGeo, this.rimMat, std(DARK, 0.8));
      wing.position.y = -7.5;
      wing.rotation.x = side * 0.12;       // hafif dışa açı
      sh.add(wing);
      this.hips.add(sh);
      return sh;
    });

    // --- bacaklar: kalçadan (dünya y≈14) yere kadar kısa; ayaklar webbed.
    //     Salınım rotation.z ile; biri ileri giderken diğeri geri.
    this.legs = [-1, 1].map((side) => {
      const hip = new THREE.Group();
      hip.position.set(0, -14, side * 3.8);   // dünya y≈0 (zemin)

      const thighGeo = new THREE.BoxGeometry(4, 7, 4.4);
      const thigh = part(thighGeo, this.rimMat, std(DARK, 0.8));
      thigh.position.y = -3.5;
      hip.add(thigh);

      const knee = new THREE.Group();
      knee.position.y = -7;
      const shinGeo = new THREE.BoxGeometry(3.4, 6, 3.8);
      const shin = part(shinGeo, this.rimMat, std(DARK, 0.8));
      shin.position.y = -3;
      knee.add(shin);

      // webbed ayak: öne (+x) uzanan yassı plaka
      const footGeo = new THREE.BoxGeometry(9, 2.2, 5.4);
      const foot = part(footGeo, this.rimMat, std(0x14181f, 0.7));
      foot.position.set(2.4, -6.4, 0);
      knee.add(foot);

      hip.add(knee);
      this.hips.add(hip);
      return { hip, knee };
    });

    this.phase = 0;
    this.breathe = Math.random() * 10;
    this.squash = 0;          // iniş squash'ı (0..1)
    this.size = 1.5;          // pengueni daha iri göster (çarpışma kutusu 40px'te sabit)
    this.root.scale.set(this.size, this.size, this.size);
  }

  setRim(color) {
    this.rimMat.color.setHex(color);
  }

  /**
   * @param {object} o  { mode:'idle'|'run'|'air'|'climb'|'dead', speed, facing, dt }
   */
  pose(o) {
    const { mode, speed = 0, facing = 1, dt = 1 / 60 } = o;
    this.breathe += dt;
    this.root.scale.x = facing * this.size;

    // iniş squash sönümlenir
    this.squash = Math.max(0, this.squash - dt * 4.5);
    const sq = 1 - this.squash * 0.18;
    const sqY = 1 + this.squash * 0.22;
    this.hips.scale.set(1 / sq, sqY, 1 / sq);

    let hipRotZ = 0;   // öne eğilme (lean)
    let waddle = 0;    // yan sallanma (hips.rotation.x)
    let legF = 0, legB = 0;      // bacak salınımı (rotation.z)
    let kneeF = 0, kneeB = 0;
    let wingF = 0, wingB = 0;
    let bob = 0;
    let headTilt = 0;

    if (mode === "air") {
      // havada: bacaklar öne-kıvrık, kanatlar denge için dışarıda
      legF = 0.7; legB = 0.35;
      kneeF = 0.9; kneeB = 0.55;
      wingF = -0.9; wingB = -0.75;
      hipRotZ = -0.16;
      headTilt = -0.08;
    } else if (mode === "climb") {
      // merdiven: alternatif kol-bacak (rotation.z ile reach)
      this.phase += dt * 7.5;
      const s = Math.sin(this.phase);
      const c = Math.cos(this.phase);
      wingF = 0.9 + s * 0.7;    // bir kol yukarı
      wingB = 0.9 - s * 0.7;    // diğeri aşağı
      legF = -s * 0.6; legB = s * 0.6;
      kneeF = Math.max(0, s) * 0.7 + 0.2;
      kneeB = Math.max(0, -s) * 0.7 + 0.2;
      hipRotZ = -0.1;
      bob = c * 0.6;
    } else if (mode === "dead") {
      legF = 0.4; legB = -0.3;
      kneeF = 0.3; kneeB = 0.2;
      wingF = 1.4; wingB = -1.2;
      hipRotZ = -0.5;
      headTilt = 0.5;
    } else {
      // yürüyüş/koşu: hızla kadans ve adım boyu artar (tek tuş, yumuşak geçiş)
      const run01 = Math.min(Math.max((speed - 90) / 190, 0), 1);   // 0=yürüyüş, 1=koşu
      const cadence = 0.35 + Math.min(speed / 320, 1) * 0.65;
      this.phase += dt * (6 + cadence * 9 + run01 * 3);
      const s = Math.sin(this.phase);
      const c = Math.cos(this.phase);

      const swing = 0.55 + run01 * 0.5;      // adım açısı
      legF = s * swing;
      legB = -s * swing;
      kneeF = Math.max(0, -c) * (0.5 + run01 * 0.6);
      kneeB = Math.max(0, c) * (0.5 + run01 * 0.6);
      wingF = -s * (0.4 + run01 * 0.35);
      wingB = s * (0.4 + run01 * 0.35);
      bob = Math.abs(c) * (0.8 + run01 * 1.1);
      waddle = s * (0.06 + run01 * 0.03);     // penguen yalpalması
      hipRotZ = -(0.04 + run01 * 0.16);       // koşarken öne eğil
      headTilt = 0.02 - run01 * 0.04;

      if (mode === "idle" || cadence < 0.12) {
        // durma: hafif nefes, kanatlar kapalı, bacaklar düz
        legF = 0; legB = 0; kneeF = 0; kneeB = 0;
        wingF = 0.06; wingB = -0.06;
        hipRotZ = 0.02;
        waddle = 0;
        bob = Math.sin(this.breathe * 1.5) * 0.5;
        this.hips.position.y = 14 + bob;
        this.hips.rotation.set(0, 0, hipRotZ);
        this.head.rotation.z = Math.sin(this.breathe * 0.8) * 0.03;
        this.legs.forEach((l) => { l.hip.rotation.z = 0; l.knee.rotation.z = 0; });
        this.wings[0].rotation.z = wingF;
        this.wings[1].rotation.z = wingB;
        return;
      }
    }

    this.hips.position.y = 14 + bob;
    this.hips.rotation.x = waddle;         // yan sallanma
    this.hips.rotation.z = hipRotZ;        // öne eğilme
    this.head.rotation.z = headTilt;

    this.legs[0].hip.rotation.z = legF;
    this.legs[1].hip.rotation.z = legB;
    this.legs[0].knee.rotation.z = kneeF;
    this.legs[1].knee.rotation.z = kneeB;

    this.wings[0].rotation.z = wingF;
    this.wings[1].rotation.z = wingB;
  }

  land() {
    this.squash = 1;    // inişte hafif squash
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
