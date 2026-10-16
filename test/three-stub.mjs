/**
 * "three" için kafaüstü STUB.
 *
 * Amacı SADECE geometri mantığını Node'da doğrulamak (ör. zemin perdesinin
 * yüzey yükseklikleri, indeks sınırları, NaN kontrolü). Gerçek çizim yapmaz,
 * GPU/renk/gölgelemez. Render katmanının tamamı tarayıcıda test edilmez.
 */

class Vector3Like {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
}

class Transform extends Vector3Like {
  constructor() { super(); this.scale = new Vector3Like(1, 1, 1); this.rotation = new Vector3Like(); }
}

export class BufferGeometry {
  constructor() { this.attributes = {}; this.index = null; }
  setAttribute(name, attr) { this.attributes[name] = attr; return this; }
  setIndex(idx) { this.index = idx; return this; }
  computeVertexNormals() { return this; }
  dispose() {}
}

export class BufferAttribute {
  constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; this.needsUpdate = false; }
}

export class Float32BufferAttribute extends BufferAttribute {
  constructor(array, itemSize) { super(Float32Array.from(array), itemSize); }
}

export class Mesh {
  constructor(geometry, material) {
    this.geometry = geometry;
    this.material = material;
    this.position = new Transform();
    this.userData = {};
    this.renderOrder = 0;
    this.castShadow = false;
    this.receiveShadow = false;
    this.visible = true;
  }
}

export class Group {
  constructor() {
    this.children = [];
    this.position = new Transform();
    this.userData = {};
  }
  add(...objs) { this.children.push(...objs); return this; }
  traverse(fn) { for (const c of this.children) fn(c); }
}

class Material {
  constructor(params = {}) { Object.assign(this, params); this.opacity = params.opacity ?? 1; }
  dispose() {}
}
export class MeshStandardMaterial extends Material {}
export class MeshBasicMaterial extends Material {}

export const DoubleSide = 2;

export class IcosahedronGeometry extends BufferGeometry {
  constructor() { super(); this.attributes.position = { count: 0, getX: () => 0, getY: () => 0, getZ: () => 0, setXYZ() {} }; }
}

export class Color {
  constructor(c) { this.hex = typeof c === "number" ? c : 0; }
  lerp() { return this; }
  setHex(h) { this.hex = h; return this; }
  multiplyScalar() { return this; }
}
