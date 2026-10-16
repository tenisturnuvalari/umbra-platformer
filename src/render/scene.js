/**
 * Three.js render katmanı.
 *
 * Oyun mantığından (world.js) tamamen bağımsızdır: world durumunu okur,
 * 3D sahneyi çizer. Bu sayede mantık Node'da test edilebilirken görsel
 * katman tarayıcıda kalır.
 */

import * as THREE from "three";
import { Character, Creature } from "./character.js";
import { buildTerrainCurtain, buildRidge, buildForeground } from "./terrain.js";

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
    this.bokehPass = null;
    this.shake = 0;
    this.bolt = 0;
    this.boltIn = 3;
    this.disposables = [];
  }

  /**
   * Bloom + derinlik alanını (DOF) kurar.
   * Herhangi biri kurulamazsa sessizce eksik devam eder; düz render'a düşer.
   */
  async enablePost(strength, dof = true) {
    try {
      const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }] = await Promise.all([
        import("three/addons/postprocessing/EffectComposer.js"),
        import("three/addons/postprocessing/RenderPass.js"),
        import("three/addons/postprocessing/UnrealBloomPass.js"),
        import("three/addons/postprocessing/OutputPass.js"),
      ]);

      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));

      // derinlik alanı: odak oyuncuda, uzağın ve yakın kadrajın bulanıklaşması
      if (dof) {
        try {
          const { BokehPass } = await import("three/addons/postprocessing/BokehPass.js");
          this.bokehPass = new BokehPass(this.scene, this.camera, {
            focus: 1000,           // oyuncunun kameraya uzaklığı sync() içinde güncellenir
            aperture: 0.00002,      // yalnız uç noktalar bulanıklaşsın (zemin keskin kalır)
            maxblur: 0.011,
          });
          this.composer.addPass(this.bokehPass);
        } catch (err) {
          console.warn("[umbra] DOF kurulamadı, devam", err);
          this.bokehPass = null;
        }
      }

      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(this.width, this.height), strength, 0.72, 0.55,
      );
      this.composer.addPass(this.bloomPass);
      this.composer.addPass(new OutputPass());
      this.resize();
    } catch (err) {
      console.warn("[umbra] post-process zinciri kurulamadı, düz render ile devam", err);
      this.composer = null;
      this.bokehPass = null;
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
    const stage = world.stage;
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

    // --- uzak sırt silüetleri: uzağa doğru gökyüzüne solan katmanlar
    this.ridges = new THREE.Group();
    const ridgeLayers = [
      { z: -1550, amp: 640, baseY: -stage.pxH * 0.04, depth01: 0.02, seed: 41, span: 9200, k: 0.86 },
      { z: -1180, amp: 500, baseY: -stage.pxH * 0.10, depth01: 0.24, seed: 77, span: 7600, k: 0.72 },
      { z: -840, amp: 370, baseY: -stage.pxH * 0.15, depth01: 0.46, seed: 129, span: 6300, k: 0.54 },
      { z: -560, amp: 255, baseY: -stage.pxH * 0.19, depth01: 0.70, seed: 211, span: 5200, k: 0.34 },
      { z: -330, amp: 165, baseY: -stage.pxH * 0.22, depth01: 0.92, seed: 307, span: 4300, k: 0.14 },
    ];
    for (const L of ridgeLayers) {
      const ridge = buildRidge({ ...L, sky: amb.skyTop, fog: amb.fog, segments: 300 });
      ridge.userData.k = L.k;
      this.ridges.add(ridge);
      this._track(ridge.geometry, ridge.material);
    }
    this.scene.add(this.ridges);

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
    moon.shadow.camera.updateProjectionMatrix();
    moon.shadow.bias = -0.0012;
    moon.shadow.normalBias = 1.6;
    this.scene.add(moon, moon.target);
    this.moon = moon;
    this.moonBase = amb.moonI;

    // oyuncunun feneri (yumuşak, oyuncuyu takip eden ışık)
    const spot = new THREE.SpotLight(0xffc98f, 55000, 1500, Math.PI / 4.4, 0.65, 1.6);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.bias = -0.002;
    spot.shadow.normalBias = 2.2;
    this.scene.add(spot, spot.target);
    this.spot = spot;

    // --- bloklar (instance edilmiş)
    const tileGeo = new THREE.BoxGeometry(TILE, TILE, DEPTH);
    const edgeGeo = new THREE.BoxGeometry(TILE, 3.4, DEPTH * 0.42);
    this._track(tileGeo, edgeGeo);

    const mkMat = (color, emissive, ei) => new THREE.MeshStandardMaterial({
      color, roughness: 0.94, metalness: 0.02, emissive, emissiveIntensity: ei, transparent: true,
    });

    this.blockGroups = {};
    const defs = {
      // zemin: neredeyse saf siyah (referanstaki Limbo silüeti gibi)
      solid: { fill: mkMat(0x04060a, 0x000000, 0), rim: new THREE.MeshBasicMaterial({ color: amb.rim, transparent: true, opacity: 0.3 }) },
    };
    this._track(defs.solid.fill, defs.solid.rim);

    for (const key of Object.keys(defs)) {
      const tiles = stage.sets[key];
      if (!tiles.length) { this.blockGroups[key] = null; continue; }
      const meshes = new THREE.Group();
      const m = new THREE.InstancedMesh(tileGeo, defs[key].fill, tiles.length);
      m.castShadow = true;
      m.receiveShadow = true;

      const exposed = tiles.filter((t) => {
        const above = stage.grid[t.y / TILE - 1]?.[t.x / TILE] ?? "#";
        return above !== "#";
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

    // --- organik zemin silüeti: kutu ızgarasının üstünü örten perde.
    //     Çarpışma hâlâ ızgaradadır; bu yalnızca görsel katmandır.
    const curtain = buildTerrainCurtain(stage, {
      seed: 17 + stage.cols * 3, amp: 15, color: amb.ground ?? 0x04060a,
    });
    curtain.position.z = DEPTH / 2 + 3;
    curtain.receiveShadow = true;
    curtain.renderOrder = 1;
    this.scene.add(curtain);
    this.curtain = curtain;
    this._track(curtain.geometry, curtain.material);

    // --- yakın kadraj kütleleri (DOF ile bulanıklaşacak, çerçeveyi kapatan karanlık)
    this.foreground = buildForeground({
      count: 4, span: stage.pxW + 3000, stageH: stage.pxH, seed: 23 + stage.cols,
    });
    this.foreground.userData.k = -0.26;     // negatif = dünyadan hızlı hareket (yakın hissi)
    this.scene.add(this.foreground);
    this._track(this.foreground.userData.geometry, this.foreground.userData.material);

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

    // --- merdivenler: iki dikey ray + basamaklar
    this.ladderMeshes = new THREE.Group();
    const ladRailGeo = new THREE.BoxGeometry(4.5, 1, DEPTH * 0.3);
    const ladRungGeo = new THREE.BoxGeometry(TILE - 8, 3.4, DEPTH * 0.24);
    const ladMat = new THREE.MeshStandardMaterial({ color: 0x1a2028, roughness: 0.7, metalness: 0.3, emissive: 0x0a1018, emissiveIntensity: 0.3 });
    this._track(ladRailGeo, ladRungGeo, ladMat);
    for (const l of stage.ladders) {
      const grp = new THREE.Group();
      const cxL = l.x + l.w / 2;
      for (const side of [-1, 1]) {
        const rail = new THREE.Mesh(ladRailGeo, ladMat);
        rail.scale.y = l.h;
        rail.position.set(cxL + side * (l.w / 2 - 3), -(l.y + l.h / 2), 0);
        rail.castShadow = true;
        grp.add(rail);
      }
      const rungs = Math.max(1, Math.floor(l.h / TILE));
      for (let i = 0; i < rungs; i++) {
        const rung = new THREE.Mesh(ladRungGeo, ladMat);
        rung.position.set(cxL, -(l.y + (i + 0.5) * TILE), 0);
        rung.castShadow = true;
        grp.add(rung);
      }
      this.ladderMeshes.add(grp);
    }
    this.scene.add(this.ladderMeshes);

    // --- hareketli platformlar
    this.platformMeshes = new THREE.Group();
    const platGeo = new THREE.BoxGeometry(1, 1, DEPTH * 0.7);
    const platMat = new THREE.MeshStandardMaterial({ color: 0x141a22, roughness: 0.6, metalness: 0.4, emissive: 0x0c141c, emissiveIntensity: 0.4 });
    const platRim = new THREE.MeshBasicMaterial({ color: amb.rim, transparent: true, opacity: 0.55 });
    this._track(platGeo, platMat, platRim);
    for (const pl of world.platforms) {
      const grp = new THREE.Group();
      const body = new THREE.Mesh(platGeo, platMat);
      body.scale.set(pl.w, pl.h, 1);
      body.castShadow = true;
      body.receiveShadow = true;
      const rimTop = new THREE.Mesh(platGeo, platRim);
      rimTop.scale.set(pl.w, 3.2, 1);
      rimTop.position.y = pl.h / 2 - 1.6;
      grp.add(body, rimTop);
      this.platformMeshes.add(grp);
    }
    this.scene.add(this.platformMeshes);

    // --- sandıklar: 40×80 ahşap kasa
    this.crateMeshes = new THREE.Group();
    const crateGeo = new THREE.BoxGeometry(1, 1, DEPTH * 0.62);
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x241d16, roughness: 0.85, metalness: 0.05, emissive: 0x120d08, emissiveIntensity: 0.25 });
    const crateRim = new THREE.MeshBasicMaterial({ color: amb.glowLight, transparent: true, opacity: 0.4 });
    this._track(crateGeo, crateMat, crateRim);
    for (const c of world.crates) {
      const grp = new THREE.Group();
      const body = new THREE.Mesh(crateGeo, crateMat);
      body.scale.set(c.w, c.h, 1);
      body.castShadow = true;
      body.receiveShadow = true;
      // kenar çerçevesi: ince dikdörtgen halka hissi
      const frame = new THREE.Mesh(crateGeo, crateRim);
      frame.scale.set(c.w - 5, c.h - 5, 1);
      frame.position.z = DEPTH * 0.31;
      grp.add(body, frame);
      this.crateMeshes.add(grp);
    }
    this.scene.add(this.crateMeshes);

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
    kill(this.backdrop); kill(this.ridges); kill(this.curtain); kill(this.foreground);
    kill(this.fogCards); kill(this.rain); kill(this.exitGroup);
    kill(this.ladderMeshes); kill(this.platformMeshes); kill(this.crateMeshes);
    this.ridges = null; this.curtain = null; this.foreground = null;
    this.exitGroup = null; this.fogCards = null; this.rain = null; this.backdrop = null;
    this.ladderMeshes = null; this.platformMeshes = null; this.crateMeshes = null;
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
    // Mesafe, FOV'dan türetilir: ekranda tam olarak view.w × view.h dünya
    // birimi görünür. Böylece TUNE değerleri (px) ekranda birebir okunur ve
    // world.js'in kenar kırpma matematiği gerçek görüş alanıyla örtüşür.
    const t20 = Math.tan((this.camera.fov * Math.PI) / 360);
    const dist = Math.max(
      (world.view.h / 2) / t20,
      (world.view.w / 2) / (t20 * this.camera.aspect),
    );
    const cx = world.cam.x + world.view.w / 2;
    const cy = -(world.cam.y + world.view.h / 2);

    this.shake = Math.max(0, this.shake - dt * 2.6);
    const sx = (Math.random() - 0.5) * this.shake;
    const sy = (Math.random() - 0.5) * this.shake;

    this.camera.position.set(cx - 74, cy + 92, dist * 1.03);
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

    // --- fener (oyuncuyu takip eden yumuşak ışık)
    const k = 1 - Math.exp(-9 * dt);
    this.spot.intensity = 42000;
    this.spot.position.set(p.x + p.w / 2, -(p.y + 8), 150);
    this.spot.target.position.set(p.x + p.w / 2 + p.facing * 320, -(p.y + p.h) - 40, -20);

    // --- zemin bloğu opaklığı sabit
    if (this.blockGroups.solid?.fill) this.blockGroups.solid.fill.opacity = 1;
    if (this.blockGroups.solid?.rim) this.blockGroups.solid.rim.opacity = 0.8;

    // --- hareketli platform / sandık / merdiven konumları
    if (this.platformMeshes) {
      const pl = world.platforms;
      for (let i = 0; i < this.platformMeshes.children.length; i++) {
        const m = this.platformMeshes.children[i];
        const d = pl[i];
        if (!d) continue;
        m.position.set(d.x + d.w / 2, -(d.y + d.h / 2), 0);
      }
    }
    if (this.crateMeshes) {
      const cr = world.crates;
      for (let i = 0; i < this.crateMeshes.children.length; i++) {
        const m = this.crateMeshes.children[i];
        const d = cr[i];
        if (!d) continue;
        m.position.set(d.x + d.w / 2, -(d.y + d.h / 2), 0);
      }
    }

    // --- oyuncu
    const root = this.player.root;
    root.position.set(p.x + p.w / 2, -(p.y + p.h), 0);
    const mode = world.dead ? "dead"
      : p.climbing ? "climb"
      : !p.onGround ? "air"
      : Math.abs(p.vx) > 30 ? "run" : "idle";
    this.player.pose({ mode, speed: Math.abs(p.vx), facing: p.facing, dt });
    if (world.dead) root.rotation.z -= dt * 6;
    else root.rotation.z += (0 - root.rotation.z) * k;

    // iniş squash'ı: havadan yere inişte tetikle
    const air = !p.onGround;
    if (this._wasAir && !air) this.player.land();
    this._wasAir = air;

    // --- avcı
    if (this.creature && world.chase) {
      this.creature.root.position.set(world.chaseX, -(world.chaseY ?? 0) - 2, -26);
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

    // --- atmosferik paralaks: her katman kendi hızında kayar
    //     ekran hızı = (1 - k): k küçük → yakın (hızlı), k büyük → uzak (yavaş)
    this.backdrop.position.x = cx * 0.06;
    this.backdrop.position.y = cy * 0.05;

    if (this.ridges) {
      for (const r of this.ridges.children) {
        const k = r.userData.k;
        r.position.x = cx * k;
        r.position.y = cy * k;
      }
    }

    if (this.foreground) {
      const k = this.foreground.userData.k;      // -0.26 → dünyadan hızlı
      this.foreground.position.x = cx * k;
      this.foreground.position.y = cy * k * 0.55;
    }

    // --- derinlik alanı: odak her zaman oyuncuda
    if (this.bokehPass) {
      const d = Math.hypot(
        this.camera.position.x - (p.x + p.w / 2),
        this.camera.position.y - (-(p.y + p.h / 2)),
        this.camera.position.z,
      );
      this.bokehPass.uniforms.focus.value += (d - this.bokehPass.uniforms.focus.value) * (1 - Math.exp(-6 * dt));
    }

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
