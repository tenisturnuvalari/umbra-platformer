/**
 * Ortam geometrisi — "gerçekçi dağ/tepe/zemin" arayışının kodsal karşılığı.
 *
 * Dürüst not: burada fotogerçekçi bir arazi YOK. Limbo'nun görüntüsünü asıl
 * kuran şey dokular değil; **katmanlı silüet + atmosferik değer (atmospheric
 * perspective) + derinlik alanıdır**. Bu modül o üç şeyi üretir:
 *
 *   1) buildTerrainCurtain  → kutu ızgarasının üstünü örten organik zemin silüeti
 *   2) buildRidge           → uzağa doğru açılan, değeri solan dağ silüetleri
 *   3) buildForeground      → kadrajı kapatan, bulanık yakın kaya/dal kütleleri
 */

import * as THREE from "three";

const TILE = 40;

/* ------------------------------------------------------ deterministik gürültü */

export function makeNoise(seed = 1) {
  let s = (seed >>> 0) || 1;
  const rand = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const size = 512;
  const table = new Float32Array(size);
  for (let i = 0; i < size; i++) table[i] = rand();

  return (x) => {
    const i = Math.floor(x);
    const f = x - i;
    const a = table[((i % size) + size) % size];
    const b = table[(((i + 1) % size) + size) % size];
    const t = f * f * (3 - 2 * f);          // smoothstep enterpolasyon
    return a + (b - a) * t;
  };
}

/** fraktal toplam → 0..1 arası organik eğri */
export function fbm(noise, x, octaves = 4, lac = 2.05, gain = 0.5) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise(x * freq) * amp;
    norm += amp;
    amp *= gain;
    freq *= lac;
  }
  return sum / norm;
}

/* ------------------------------------------------------------- zemin perdesi */

/**
 * Kutu blokların üstünü örten, organik bir üst kenara sahip siyah zemin perdesi.
 * Çarpışma hâlâ kutu ızgarasındadır; bu yalnızca GÖRSEL katmandır, yani
 * oyuncunun ayakları hafifçe zeminin içine gömülür (istenen "yerine oturma" hissi).
 */
export function buildTerrainCurtain(stage, opts = {}) {
  const { seed = 7, amp = 15, sub = 5, color = 0x05070a, roughness = 1 } = opts;

  const noise = makeNoise(seed);
  const count = stage.cols * sub;
  const stepX = TILE / sub;
  const bottom = -(stage.pxH + 520);

  // Sütun başına PERDE yüzeyi = en alttan yukarıya doğru bitişik '#' kütleşinin tepesi.
  //   • En alt hücre '# değilse' (çukur/diken/boşluk) → perde hiç inmez:
  //     dikenler ve boşluklar açıkta kalır.
  //   • Uçan platformlar (arada '.' olan) hesaba katılmaz: perde yalnızca
  //     gerçekten zemin olan kütleyi örter.
  const topRow = new Int32Array(stage.cols).fill(-1);
  for (let x = 0; x < stage.cols; x++) {
    let y = stage.rows - 1;
    if (stage.grid[y][x] !== "#") continue;
    while (y > 0 && stage.grid[y - 1][x] === "#") y--;
    topRow[x] = y;
  }

  const positions = new Float32Array((count + 1) * 2 * 3);
  const normals = new Float32Array((count + 1) * 2 * 3);
  const indices = [];

  for (let i = 0; i <= count; i++) {
    const col = Math.min(Math.floor(i / sub), stage.cols - 1);
    const row = topRow[col];

    // boşluk sütunlarında perde dikey olarak aşağı iner (uçurum kenarı)
    let y = row < 0
      ? stage.pxH + 640
      : row * TILE - fbm(noise, i * 0.34, 3) * amp;

    const x = i * stepX;
    const o = i * 6;
    positions[o + 0] = x; positions[o + 1] = -y; positions[o + 2] = 0;
    positions[o + 3] = x; positions[o + 4] = bottom; positions[o + 5] = 0;
    normals[o + 2] = 1; normals[o + 5] = 1;

    if (i < count) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geo.setIndex(indices);

  const mat = new THREE.MeshStandardMaterial({
    color, roughness, metalness: 0, side: THREE.DoubleSide,
  });

  return new THREE.Mesh(geo, mat);
}

/* ------------------------------------------------------------ dağ silüetleri */

/**
 * Tek bir uzak sırt (ridge) silüeti.
 * `depth01`: 0 = en uzak (en soluk), 1 = en yakın (en koyu).
 */
export function buildRidge({
  span = 7000,
  baseY = 0,
  amp = 420,
  seed = 3,
  segments = 260,
  sky,
  fog,
  depth01 = 0.5,
  z = -800,
  octaveGain = 0.55,
}) {
  const noise = makeNoise(seed);
  const positions = [];
  const indices = [];
  const floorY = baseY - 2200;

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const x = t * span - span / 2;
    // iki katmanlı eğri: geniş kümeler + ince detay
    const big = fbm(noise, t * 5.5, 3) - 0.5;
    const detail = fbm(noise, t * 23 + 40, 3) - 0.5;
    const y = baseY + big * 2 * amp + detail * amp * 0.28 * octaveGain;
    positions.push(x, y, 0, x, floorY, 0);
  }

  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
  }

  // atmosferik perspektif: uzak olan gökyüzüne yaklaşır
  const c = new THREE.Color(fog).lerp(new THREE.Color(sky), 1 - depth01);
  const mat = new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide, fog: true });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.z = z;
  mesh.userData.baseColor = c;
  return mesh;
}

/* --------------------------------------------------------- yakın kadraj kütle */

/**
 * Kadrajın kenarlarını kapatan, kameraya yakın (dolayısıyla DOF ile bulanıklaşan)
 * büyük karanlık kütleler. Limbo'daki "çerçeveleme" hissinin kaynağı.
 *
 * Ölçek/koordinat notu: bu kütleler z ≈ +250'dedir ve kamera ~+1000'de durur;
 * yani ekranda ~1.4× büyürler. Konumlar görüş alanının üst/alt %30'una
 * yerleştirilecek şekilde seçilmiştir (ortayı kapatmamak için).
 */
export function buildForeground({ count = 4, span = 4000, color = 0x020304, seed = 11, stageH = 720 }) {
  const noise = makeNoise(seed);
  const group = new THREE.Group();
  const geo = new THREE.IcosahedronGeometry(1, 1);

  // kaya formu için köşeleri gürültüyle boz.
  // Index yerine KONUM gürültülüyor: paylaşılan köşeler aynı kaymayı alır,
  // aksi halde mesh çatlar.
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = 0.74 + fbm(noise, (x * 1.7 + y * 2.3 + z * 3.1) * 4.2, 3) * 0.55;
    pos.setXYZ(i, x * k, y * k, z * k);
  }
  geo.computeVertexNormals();

  const mat = new THREE.MeshBasicMaterial({ color, fog: false });

  // görüş alanı (dünya birimi) ≈ yükseklik kadar; kenar payını ona göre seç
  const viewH = stageH;
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(geo, mat);
    const fromTop = i % 2 === 0;
    const sx = 300 + noise(i * 3.1) * 260;
    const sy = 175 + noise(i * 7.7) * 130;

    m.scale.set(sx, sy, 210);

    // üstteki: alt kenarı görüşün üst çeyreğinde kalsın
    // alttaki: üst kenarı görüşün alt çeyreğinde kalsın
    const y = fromTop
      ? viewH * 0.30 + sy * 0.72 + noise(i * 2.3) * 70
      : -(viewH * 0.34 + sy * 0.72 + noise(i * 5.1) * 70);

    m.position.set(
      noise(i * 1.9) * span,
      y,
      210 + noise(i * 4.4) * 90,
    );
    m.rotation.z = noise(i * 9.3) * Math.PI;
    m.userData.parallax = 1.18 + noise(i * 6.2) * 0.35;
    group.add(m);
  }

  group.userData.material = mat;
  group.userData.geometry = geo;
  return group;
}
