/**
 * Three.js render katmanı.
 *
 * Oyun mantığından (world.js) tamamen bağımsızdır: world durumunu okur,
 * 3D sahneyi çizer. Bu sayede mantık Node'da test edilebilirken görsel
 * katman tarayıcıda kalır.
 */

import * as THREE from "three";
import { Character, Creature } from "./character.js";

export const TILE = 40;
const DEPTH = 150;

const hex = (n) => `#${n.toString(16).padStart(6, "0")}`;

/* ------------------------------------------------------------ canvas dokular */

function radialTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, "rgba(255,255,255,0.85)");
  grd.addColorStop(0.45, "rgba(255,255,255,0.22)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function gradientTexture(top, bottom) {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 256;
  const g = c.getContext("2d");
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, hex(top));
  grd.addColorStop(0.55, hex(bottom));
  grd.addColorStop(1, hex(bottom));
  g.fillStyle = grd;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ------------------------------------------------------------------- sahne */

export class StageScene {
  constructor(container) {
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 5, 6000);

    this.groups = new THREE.Group();
    this.scene.add(this.groups);

    this._onResize = () => this.resize();
    window.addEventListener("resize", this._onResize);
    this.resize();

    this.composer = null;
    this.bloomPass = null;
    this.shake = 0;
    this.bolt = 0;
    this.boltIn = 3;
    this.disposables = [];
  }

  /** Bloom varsa kurar, yoksa sessizce düz render'a döner. */
  async enableBloom(strength) {
    try {
      const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }] = await Promise.all([
        import("three/addons/postprocessing/EffectComposer.js"),
        import("three/addons/postprocessing/RenderPass.js"),
        import("three/addons/postprocessing/UnrealBloomPass.js"),
        import("three/addons/postprocessing/OutputPass.js"),
      ]);
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(this.width, this.height), strength, 0.72, 0.55,
      );
      this.composer.addPass(this.bloomPass);
      this.composer.addPass(new OutputPass());
      this.resize();
    } catch (err) {
      console.warn("[umbra] bloom kurulamadı, düz render ile devam", err);
      this.composer = null;
    }
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.composer) this.composer.setSize(w, h);
    if (this.bloomPass) this.bloomPass.resolution.set(w, h);
  }

  /* -------------------------------------------------------- sahne kurulumu */

  load(world) {
    this.disposeObjects();

    const amb = world.def.ambience;
    this.ambience = amb;

    this.scene.fog = new THREE.FogExp2(amb.fog, amb.fogDensity);
    this.scene.background = new THREE.Color(amb.fog);

    // --- arka plan (gradient) + uzak enkaz
    this.backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(9000, 4200),
      new THREE.MeshBasicMaterial({ map: gradientTexture(amb.skyTop, amb.skyBottom), depthWrite: false, fog: false }),
    );
    this.backdrop.position.set(0, 0, -1000);
    this.scene.add(this.backdrop);
    this._track(this.backdrop);

    this.ruins = new THREE.Group();
    const ruinMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(amb.fog).multiplyScalar(1.25) });
    let seed = 91 + world.stage.cols;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    for (let i = 0; i < 16; i++) {
      const hgt = 160 + rnd() * 620;
      const m = new THREE.Mesh(new THREE.BoxGeometry(70 + rnd() * 190, hgt, 60), ruinMat);
      m.position.set(rnd() * 4200 - 400, -world.stage.pxH * 0.2 + hgt / 2 - rnd() * 300, -520 - rnd() * 380);
      this.ruins.add(m);
      this._track(m.geometry);
    }
    this.scene.add(this.ruins);
    this._track(ruinMat);

    // --- ışıklar
    const hemi = new THREE.HemisphereLight(amb.skyTop, 0x05070a, 0.55);
    this.scene.add(hemi);
    this.hemi = hemi;

    const moon = new THREE.DirectionalLight(amb.moon, amb.moonI);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    moon.shadow.camera.near = 200;
    moon.shadow.camera.far = 3200;
    const S = 1100;
    Object.assign(moon.shadow.camera, { left: -S, right: S, top: S, bottom: -S });
    moon.shadow.bias = -0.0012;
    moon.shadow.normalBias = 1.6;
    this.scene.add(moon, moon.target);
    this.moon = moon;
    this.moonBase = amb.moonI;

    // oyuncunun feneri (ışık fazında)
    const spot = new THREE.SpotLight(0xffc98f, 55000, 1500, Math.PI / 4.4, 0.65, 1.6);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.bias = -0.002;
    spot.shadow.normalBias = 2.2;
    this.scene.add(spot, spot.target);
    this.spot = spot;

    // --- bloklar (instance edilmiş)
    const stage = world.stage;
    const tileGeo = new THREE.BoxGeometry(TILE, TILE, DEPTH);
    const edgeGeo = new THREE.BoxGeometry(TILE, 3.4, DEPTH * 0.42);
    this._track(tileGeo, edgeGeo);

    const mkMat = (color, emissive, ei) => new THREE.MeshStandardMaterial({
      color, roughness: 0.94, metalness: 0.02, emissive, emissiveIntensity: ei, transparent: true,
    });

    this.blockGroups = {};
    const defs = {
      solid: { fill: mkMat(0x0b0e13, 0x000000, 0), rim: new THREE.MeshBasicMaterial({ color: amb.rim, transparent: true, opacity: 0.85 }) },
      light: { fill: mkMat(0x1b1510, 0xff9a45, 0.55), rim: new THREE.MeshBasicMaterial({ color: amb.glowLight, transparent: true, opacity: 0.95 }) },
      shadow: { fill: mkMat(0x0a1420, 0x3fc9ff, 0.5), rim: new THREE.MeshBasicMaterial({ color: amb.glowShadow, transparent: true, opacity: 0.95 }) },
    };
    this._track(defs.solid.fill, defs.solid.rim, defs.light.fill, defs.light.rim, defs.shadow.fill, defs.shadow.rim);

    for (const key of Object.keys(defs)) {
      const tiles = stage.sets[key];
      if (!tiles.length) { this.blockGroups[key] = null; continue; }   // bu aşamada o faz bloğu yok
      const meshes = new THREE.Group();
      const m = new THREE.InstancedMesh(tileGeo, defs[key].fill, tiles.length);
      m.castShadow = true;
      m.receiveShadow = true;

      const exposed = tiles.filter((t) => {
        const above = stage.grid[t.y / TILE - 1]?.[t.x / TILE] ?? "#";
        return !(key === "solid" ? above === "#" : above === (key === "light" ? "l" : "s"));
      });
      const rimCount = exposed.length;
      const rim = rimCount > 0 ? new THREE.InstancedMesh(edgeGeo, defs[key].rim, rimCount) : null;

      const mat = new THREE.Matrix4();
      tiles.forEach((t, i) => {
        mat.makeTranslation(t.x + TILE / 2, -(t.y + TILE / 2), 0);
        m.setMatrixAt(i, mat);
      });
      exposed.forEach((t, i) => {
        mat.makeTranslation(t.x + TILE / 2, -(t.y + 1.5), DEPTH * 0.16);
        rim.setMatrixAt(i, mat);
      });
      m.instanceMatrix.needsUpdate = true;
      if (rim) rim.instanceMatrix.needsUpdate = true;
      meshes.add(m);
      if (rim) meshes.add(rim);
      this.scene.add(meshes);
      this.blockGroups[key] = { meshes, fill: defs[key].fill, rim: defs[key].rim, active: 1 };
    }

    // --- dikenler
    const spikeTiles = stage.hazards.filter((h, i, a) =>
      a.findIndex((o) => o.x === h.x && o.y === h.y) === i &&
      stage.grid[h.y / TILE - 1]?.[h.x / TILE] !== "^");
    const spikeGeo = new THREE.ConeGeometry(15, 40, 4);
    const spikeMat = new THREE.MeshStandardMaterial({ color: 0x1d232b, roughness: 0.35, metalness: 0.75, emissive: 0x101820, emissiveIntensity: 0.4 });
    this._track(spikeGeo, spikeMat);
    const spikes = new THREE.InstancedMesh(spikeGeo, spikeMat, spikeTiles.length * 3);
    spikes.castShadow = true;
    const sm = new THREE.Matrix4();
    const sq = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 4, 0));
    const sv = new THREE.Vector3(1, 1, 1);
    spikeTiles.forEach((t, i) => {
      for (let k = 0; k < 3; k++) {
        const x = t.x + 7 + k * 13;
        const y = -(t.y + TILE - 20);
        sm.compose(new THREE.Vector3(x, y, 0), sq, sv);
        spikes.setMatrixAt(i * 3 + k, sm);
      }
    });
    spikes.instanceMatrix.needsUpdate = true;
    this.scene.add(spikes);
    this.spikesMesh = spikes;

    // --- çıkış: ışık yarığı + nokta ışığı
    if (stage.exit) {
      const e = stage.exit;
      const grp = new THREE.Group();
      const core = new THREE.Mesh(
        new THREE.PlaneGeometry(16, TILE * 1.35),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      const halo = new THREE.Mesh(
        new THREE.PlaneGeometry(150, TILE * 2.6),
        new THREE.MeshBasicMaterial({ color: amb.glowLight, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, map: radialTexture() }),
      );
      grp.add(halo, core);
      grp.position.set(e.x + TILE / 2, -(e.y + TILE / 2), DEPTH * 0.28);
      this.scene.add(grp);
      this.exitGroup = grp;
      this._track(core.geometry, core.material, halo.geometry, halo.material);
    }

    // --- sis kartları
    const fogTex = radialTexture();
    this.fogTex = fogTex;
    this.fogCards = new THREE.Group();
    for (let i = 0; i < 16; i++) {
      const w = 700 + Math.random() * 900;
      const card = new THREE.Mesh(
        new THREE.PlaneGeometry(w, w * 0.42),
        new THREE.MeshBasicMaterial({
          map: fogTex, transparent: true, opacity: 0.04 + Math.random() * 0.07,
          depthWrite: false, color: amb.fog, blending: THREE.AdditiveBlending,
        }),
      );
      card.position.set(Math.random() * stage.pxW + 200, -Math.random() * stage.pxH * 0.7 - 40, -460 + Math.random() * 560);
      card.userData.speed = 6 + Math.random() * 16;
      this.fogCards.add(card);
      this._track(card.geometry, card.material);
    }
    this.scene.add(this.fogCards);

    // --- yağmur
    this.buildRain(amb.rain);

    // --- figürler
    this.player = new Character(amb.rim);
    this.scene.add(this.player.root);

    if (world.chase) {
      this.creature = new Creature(0xff6a5a);
      this.scene.add(this.creature.root);
    } else {
      this.creature = null;
    }

    this.phaseMix = { light: 1, shadow: 0 };
    this.spotMix = 1;
  }

  buildRain(intensity) {
    const N = Math.round(500 + intensity * 900);
    const pos = new Float32Array(N * 6);
    const spd = new Float32Array(N);
    this.rainVol = { top: 620, bottom: -680, w: 1700, depth: 620 };

    for (let i = 0; i < N; i++) {
      const x = (Math.random() - 0.5) * this.rainVol.w;
      const y = Math.random() * (this.rainVol.top - this.rainVol.bottom) + this.rainVol.bottom;
      const z = (Math.random() - 0.5) * this.rainVol.depth;
      const len = 26 + Math.random() * 34;
      pos[i * 6 + 0] = x; pos[i * 6 + 1] = y; pos[i * 6 + 2] = z;
      pos[i * 6 + 3] = x; pos[i * 6 + 4] = y - len; pos[i * 6 + 5] = z;
      spd[i] = 900 + Math.random() * 700;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xa8c6de, transparent: true, opacity: 0.16 + intensity * 0.3, depthWrite: false });
    this.rain = new THREE.LineSegments(geo, mat);
    this.rain.frustumCulled = false;
    this.rainSpeeds = spd;
    this.rainIntensity = intensity;
    this.scene.add(this.rain);
    this._track(geo, mat);
  }

  _track(...objs) {
    for (const o of objs) this.disposables.push(o);
  }

  disposeObjects() {
    for (const d of this.disposables) {
      try { d.dispose(); } catch { /* yoksay */ }
    }
    this.disposables.length = 0;

    if (this.player) { this.player.dispose(); this.player = null; }
    if (this.creature) { this.creature.dispose(); this.creature = null; }

    const kill = (o) => {
      if (!o) return;
      this.scene.remove(o);
      o.traverse?.((c) => {
        if (c.isMesh || c.isInstancedMesh || c.isLineSegments) {
          c.geometry?.dispose?.();
          if (c.material) (Array.isArray(c.material) ? c.material : [c.material]).forEach((m) => m.dispose());
        }
      });
    };
    kill(this.backdrop); kill(this.ruins); kill(this.fogCards); kill(this.rain); kill(this.exitGroup);
    if (this.blockGroups) for (const k of Object.keys(this.blockGroups)) kill(this.blockGroups[k]?.meshes);
    if (this.moon) { this.scene.remove(this.moon.target); kill(this.moon); this.moon = null; }
    if (this.spot) { this.scene.remove(this.spot.target); kill(this.spot); this.spot = null; }
    if (this.hemi) { kill(this.hemi); this.hemi = null; }
    if (this.spikesMesh) { kill(this.spikesMesh); this.spikesMesh = null; }
    this.blockGroups = null;
  }

  /* --------------------------------------------------------------- animasyon */

  sync(world, dt) {
    const amb = this.ambience;
    const p = world.player;

    // --- kamera
    const zoom = THREE.MathUtils.clamp(this.width / 1280, 0.78, 1.7);
    const cx = world.cam.x + world.view.w / 2;
    const cy = -(world.cam.y + world.view.h / 2);

    this.shake = Math.max(0, this.shake - dt * 2.6);
    const sx = (Math.random() - 0.5) * this.shake;
    const sy = (Math.random() - 0.5) * this.shake;

    this.camera.position.set(cx - 74, cy + 92, 720 * zoom);
    this.camera.lookAt(cx + 26, cy - 12, 0);
    this.camera.position.x += sx;
    this.camera.position.y += sy;

    // --- aydınlatma hedefleri
    this.moon.position.set(cx + amb.moonDir[0] * 1400, cy + amb.moonDir[1] * 1400, amb.moonDir[2] * 1400);
    this.moon.target.position.set(cx, cy, 0);

    // şimşek
    if (amb.lightning) {
      this.boltIn -= dt;
      if (this.boltIn <= 0) {
        this.bolt = 1;
        this.boltIn = 3.5 + Math.random() * 8;
        this.onLightning?.();
      }
    }
    this.bolt = Math.max(0, this.bolt - dt * 4.5);
    this.moon.intensity = this.moonBase * (1 + this.bolt * 8);
    this.hemi.intensity = 0.55 * (1 + this.bolt * 5);

    // --- faz geçişinin sönümü
    const targetLight = world.phase === "light" ? 1 : 0.1;
    const targetShadow = world.phase === "shadow" ? 1 : 0.1;
    const k = 1 - Math.exp(-9 * dt);
    for (const [key, target] of [["light", targetLight], ["shadow", targetShadow]]) {
      const g = this.blockGroups[key];
      if (!g) continue;
      g.fill.opacity += (target - g.fill.opacity) * k;
      g.rim.opacity += ((target > 0.5 ? 0.95 : 0.12) - g.rim.opacity) * k;
      g.fill.emissiveIntensity = (target > 0.5 ? 0.62 : 0.06) * (1 + Math.sin(performance.now() / 700) * 0.08);
    }
    this.blockGroups.solid.fill.opacity = 1;
    if (this.blockGroups.solid.rim) this.blockGroups.solid.rim.opacity = 0.8;

    // --- fener
    const spotTarget = world.phase === "light" ? 1 : 0.06;
    this.spotMix += (spotTarget - this.spotMix) * k;
    this.spot.intensity = 55000 * this.spotMix;
    this.spot.position.set(p.x + p.w / 2, -(p.y + 8), 150);
    this.spot.target.position.set(p.x + p.w / 2 + p.facing * 320, -(p.y + p.h) - 40, -20);

    // --- oyuncu
    const root = this.player.root;
    root.position.set(p.x + p.w / 2, -(p.y + p.h), 0);
    const mode = world.dead ? "dead" : !p.onGround ? "air" : Math.abs(p.vx) > 30 ? "run" : "idle";
    this.player.pose({ mode, speed: Math.abs(p.vx), facing: p.facing, dt });
    if (world.dead) root.rotation.z -= dt * 6;
    else root.rotation.z += (0 - root.rotation.z) * k;

    // --- avcı
    if (this.creature && world.chase) {
      const gy = root.position.y;
      this.creature.root.position.set(world.chaseX, gy - 2, -26);
      this.creature.root.scale.x = 1;
      this.creature.pose(dt, 300);
    }

    // --- çıkış nabzı
    if (this.exitGroup) {
      const pulse = 0.6 + Math.sin(performance.now() / 340) * 0.4;
      this.exitGroup.children[1].material.opacity = 0.55 + pulse * 0.45;
      this.exitGroup.children[0].material.opacity = 0.1 + pulse * 0.12;
    }

    // --- sis kartları
    if (this.fogCards) {
      for (const c of this.fogCards.children) {
        c.position.x += c.userData.speed * dt * (0.5 + this.rainIntensity);
        if (c.position.x > cx + 1800) c.position.x = cx - 2200;
      }
    }

    // --- arka plan paralaks
    this.backdrop.position.x = cx * 0.18;
    this.backdrop.position.y = cy * 0.12;
    this.ruins.position.x = cx * 0.45;
    this.ruins.position.y = cy * 0.3;

    // --- yağmur
    if (this.rain) {
      this.rain.position.set(cx * 0.92, 0, 0);
      const arr = this.rain.geometry.attributes.position.array;
      const V = this.rainVol;
      const windX = 120 * (amb.wind ?? 0.4);
      for (let i = 0; i < this.rainSpeeds.length; i++) {
        const dy = this.rainSpeeds[i] * dt;
        arr[i * 6 + 1] -= dy;
        arr[i * 6 + 4] -= dy;
        arr[i * 6 + 0] += windX * dt;
        arr[i * 6 + 3] += windX * dt;
        if (arr[i * 6 + 4] < V.bottom) {
          const x = (Math.random() - 0.5) * V.w;
          const z = (Math.random() - 0.5) * V.depth;
          const len = 26 + Math.random() * 34;
          arr[i * 6 + 0] = x; arr[i * 6 + 1] = V.top; arr[i * 6 + 2] = z;
          arr[i * 6 + 3] = x + windX * 0.02; arr[i * 6 + 4] = V.top - len; arr[i * 6 + 5] = z;
        }
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }
  }

  render() {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    window.removeEventListener("resize", this._onResize);
    this.disposeObjects();
    this.renderer.dispose();
  }
}
