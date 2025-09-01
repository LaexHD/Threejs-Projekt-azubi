// three.js + Loader von CDN
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import { GLTFLoader }  from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/DRACOLoader.js";
import { KTX2Loader }  from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/meshopt_decoder.module.min.js";
// r160: kein Named Export -> Namespace
import * as SkeletonUtils from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/SkeletonUtils.js";

// ======= Konfiguration =======
const ASSET_PATHS = {
  character: "Business Man.glb", // dein Spieler-GLB (Leerzeichen ok)
};

// 👉👉👉 deine GLB-Modelle für Plattformen/Deko (Dateinamen ggf. anpassen)
const MODEL_PACK_PATHS = [
  "Computer Mouse.glb",
  "Computer.glb",
  "Desk.glb",
  "Headphones.glb",
  "Keyboard.glb",
  "Laptop.glb",
  "Monitor.glb",
  "Office Chair (1).glb",
  "Office Chair.glb",
  "Office Printer Copier.glb", // besser umbenennen in "Office Printer Copier.glb"
  "Phone.glb",
  "server rack.glb",
  "Standing Desk.glb",
  "Stapler.glb",
];

// Kategorien-Erkennung (per Dateiname)
const MODEL_CATEGORIES = {
  keyboard:  ["keyboard"],
  laptop:    ["laptop","notebook"],
  server:    ["server","rack"],
  printer:   ["printer","copier"],
  desk:      ["desk","table","standing desk"],
  monitor:   ["monitor","screen","display"],
  chair:     ["chair","seat"],
  computer:  ["computer","pc","tower","case"],
  mouse:     ["mouse"],
  phone:     ["phone","smartphone","mobile"],
  stapler:   ["stapler"],
  headphones:["headphones","headset"],
  generic:   [],
};

// Zielbreiten (XZ) je Kategorie – so sind Sprünge spielbar
const TARGET_WIDTH_BY_CAT = {
  desk: 4.5, server: 1.6, printer: 2.4, keyboard: 3.0, laptop: 2.8,
  monitor: 2.2, chair: 2.2, computer: 2.0, mouse: 2.0, phone: 2.0,
  stapler: 2.0, headphones: 2.0, generic: 2.5,
};

const SETTINGS = {
  gravity: 24, moveSpeed: 7.0, sprintMult: 1.5, jumpSpeed: 9.5,
  airControl: 0.45, camDistance: 5.5, camHeight: 2.2, camLag: 0.12,
  playerRadius: 0.35, playerHeight: 1.7, fallY: -50,
};

// ======= Renderer/Scene/Camera =======
const canvas = document.getElementById("app");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

// Hellblauer Himmel + Nebel
const SKY = new THREE.Color(0xBFE8FF);
const FOG_NEAR = 40, FOG_FAR = 160;

const scene = new THREE.Scene();
scene.background = SKY;
scene.fog = new THREE.Fog(SKY, FOG_NEAR, FOG_FAR);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.05, 500);
camera.position.set(0, 2, 6);

// ======= Licht =======
const hemi = new THREE.HemisphereLight(0xdfefff, 0xbfd4e6, 0.85);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffffff, 0.9);
sun.position.set(6, 12, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 120;
sun.shadow.normalBias = 0.02;
scene.add(sun);

// ======= GLTF/DRACO/KTX2/Meshopt Setup =======
const gltfLoader = new GLTFLoader();
const draco = new DRACOLoader();
draco.setDecoderPath("https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/");
gltfLoader.setDRACOLoader(draco);
const ktx2 = new KTX2Loader()
  .setTranscoderPath("https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/basis/")
  .detectSupport(renderer);
gltfLoader.setKTX2Loader(ktx2);
gltfLoader.setMeshoptDecoder(MeshoptDecoder);

// ======= Hilfsstrukturen =======
const clock = new THREE.Clock();
const keys = new Set();
const colliders = [];   // unsichtbare Kollisions-Meshes (inkl. Boden)
const checkpoints = [];
let activeCheckpointIndex = 0;
const statusEl = document.getElementById("status");
function setStatus(t) { if (statusEl) statusEl.textContent = t; }

// ======= Utils =======
function inferModelCategory(nameLower) {
  for (const [cat, words] of Object.entries(MODEL_CATEGORIES)) {
    if (!words.length) continue;
    if (words.some(w => nameLower.includes(w))) return cat;
  }
  return "generic";
}
function computeBBox(obj) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = new THREE.Vector3(); box.getSize(size);
  const center = new THREE.Vector3(); box.getCenter(center);
  return { box, size, center };
}

// --- robustere Pfadbehandlung (fix für "%2F" etc.)
function escapeLiteralPercents(p) { return p.replace(/%/g, "%25"); }
function expandPathCandidates(p) {
  const variants = [
    p,
    encodeURI(p),
    escapeLiteralPercents(p),
    encodeURI(escapeLiteralPercents(p)),
  ];
  const withBase = [];
  for (const v of variants) {
    withBase.push(v);
    if (!v.includes("/")) withBase.push("assets/models/" + v);
  }
  return Array.from(new Set(withBase));
}

function loadGLBWithFallback(paths) {
  return new Promise((resolve, reject) => {
    const list = paths.slice();
    const tryNext = () => {
      if (!list.length) return reject(new Error("Alle GLB-Pfade fehlgeschlagen"));
      const url = list.shift();
      gltfLoader.load(url, (g) => resolve({ g, url }), undefined, () => tryNext());
    };
    tryNext();
  });
}

async function loadOneModel(path) {
  const candidates = expandPathCandidates(path);
  const { g, url } = await loadGLBWithFallback(candidates);
  const root = g.scene || g.scenes?.[0];
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true; o.receiveShadow = true;
      if (o.material) {
        o.material.side = THREE.FrontSide;
        if (o.material.transparent && o.material.opacity === 0) {
          o.material.opacity = 1; o.material.transparent = false;
        }
      }
    }
  });
  const { size } = computeBBox(root);
  return {
    name: url.split("/").pop(),
    category: inferModelCategory(url.toLowerCase()),
    template: root,
    baseSize: size.clone(),
    animations: g.animations || [],
  };
}

async function loadModelPack(paths) {
  const results = [];
  for (const p of paths) {
    try { results.push(await loadOneModel(p)); }
    catch (e) { console.warn("Konnte Modell nicht laden:", p, e); }
  }
  const byCat = {};
  for (const k of Object.keys(MODEL_CATEGORIES)) byCat[k] = [];
  for (const m of results) byCat[m.category]?.push(m);
  const all = results.slice();
  for (const k of Object.keys(byCat)) {
    if (byCat[k].length === 0) byCat[k] = byCat.generic.length ? byCat.generic : all;
  }
  return { byCat, all };
}

function pickModel(pack, preferredCats = []) {
  for (const c of preferredCats) {
    const arr = pack.byCat[c];
    if (arr && arr.length) return arr[Math.floor(Math.random() * arr.length)];
  }
  const all = pack.all;
  if (!all?.length) throw new Error("Model pack leer");
  return all[Math.floor(Math.random() * all.length)];
}

// Spawnt eine GLB-Plattform + unsichtbaren Box-Collider
function placeModelPlatform(modelDef, options = {}) {
  const { position = new THREE.Vector3(), yaw = 0, targetWidth = 2.5, inflateY = 0.04 } = options;

  // Tiefen-Klon (sicher auch für SkinnedMesh)
  const cloneRoot = SkeletonUtils.clone(modelDef.template);

  // auf gewünschte XZ-Breite skalieren
  cloneRoot.updateMatrixWorld(true);
  let { size: baseSize } = computeBBox(cloneRoot);
  const baseXZ = Math.max(baseSize.x, baseSize.z);
  const scale = baseXZ > 0.0001 ? (targetWidth / baseXZ) : 1;
  cloneRoot.scale.setScalar(scale);

  // neu messen
  cloneRoot.updateMatrixWorld(true);
  let { size, box } = computeBBox(cloneRoot);

  // Group: Unterkante auf y=0 legen
  const group = new THREE.Group();
  const minY = box.min.y;
  cloneRoot.position.y -= minY;

  group.rotation.y = yaw;
  group.position.copy(position);
  group.add(cloneRoot);
  scene.add(group);

  // unsichtbarer Collider passend zur BBox
  const colGeo = new THREE.BoxGeometry(size.x, size.y + inflateY, size.z);
  const colMat = new THREE.MeshBasicMaterial({ visible: false });
  const collider = new THREE.Mesh(colGeo, colMat);
  collider.position.set(0, (size.y + inflateY) * 0.5, 0);
  group.add(collider);
  colliders.push(collider);

  return { group, collider, size };
}

// Fallback-Boxplattform (wenn kein GLB verfügbar ist)
function makeBoxPlatform(w = 4, h = 0.3, d = 2, pos = new THREE.Vector3(), yaw = 0) {
  const group = new THREE.Group();
  group.position.copy(pos);
  group.rotation.y = yaw;

  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color: 0xCFE6FF, roughness: 0.9, metalness: 0.05 })
  );
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.position.y = h * 0.5;
  group.add(mesh);
  scene.add(group);

  const col = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ visible: false }));
  col.position.copy(mesh.position);
  group.add(col);
  colliders.push(col);

  return { group, collider: col, size: new THREE.Vector3(w, h, d) };
}

// ======= Boden (mit Collider) + flache Leiterbahnen =======
function makeGround() {
  const geo = new THREE.PlaneGeometry(26, 26);
  const mat = new THREE.MeshStandardMaterial({ color: 0xEAF4FF, roughness: 0.95, metalness: 0.05 });
  const ground = new THREE.Mesh(geo, mat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.position.y = 0;
  scene.add(ground);

  // ⬅️ Kollision: Player fällt nicht mehr durch
  colliders.push(ground);

  // ⚠️ Leiterbahnen NICHT als Child vom Boden (sonst kippen sie hoch)
  const lines = new THREE.Group();
  lines.position.y = 0.001; // knapp über dem Boden
  scene.add(lines);

  for (let i = 0; i < 140; i++) {
    const w = Math.random() * 0.02 + 0.006;  // Breite
    const l = Math.random() * 6 + 1.5;       // Länge
    const line = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.002, l),    // dünn in Y -> liegt flach
      new THREE.MeshStandardMaterial({
        color: 0x007aff, emissive: 0x5fbaff, emissiveIntensity: 0.35, roughness: 0.4, metalness: 0.6,
        depthWrite: true
      })
    );
    line.position.set((Math.random() - 0.5) * 24, 0, (Math.random() - 0.5) * 24);
    line.rotation.y = Math.random() * Math.PI;
    line.receiveShadow = true;
    lines.add(line);
  }
}

// ======= Welt mit deinen GLB-Plattformen =======
async function makeITWorld(modelPack) {
  // Helfer: setze eine Plattform aus Kategorien (mit Fallback-Box)
  function platformFromCats(preferredCats, pos, yaw = 0, scaleHint = 1.0) {
    const cat = preferredCats[0] ?? "generic";
    const target = (TARGET_WIDTH_BY_CAT[cat] ?? TARGET_WIDTH_BY_CAT.generic) * scaleHint;

    let mdl = null;
    try { mdl = pickModel(modelPack, preferredCats); } catch (e) { /* pack leer */ }
    if (!modelPack?.all?.length || !mdl) {
      return makeBoxPlatform(target, 0.3, Math.max(1.2, target * 0.6), pos, yaw);
    }
    return placeModelPlatform(mdl, { position: pos, yaw, targetWidth: target });
  }

  // sichere Startplattform (falls Modelle später kommen)
  platformFromCats(["desk","keyboard","laptop","generic"], new THREE.Vector3(0, 0.2, 0), 0, 1.2);
  checkpoints.push({ pos: new THREE.Vector3(0, 1.4, 0) });

  // Parcours-Schritte
  const steps = [
    { cats: ["keyboard","laptop","monitor"], dPos: [ 2.5,  1.1, -2.0], yaw: () => Math.random()*Math.PI },
    { cats: ["server","printer","computer"], dPos: [ 1.8,  2.1, -0.5], yaw: () => Math.random()*0.6-0.3 },
    { cats: ["desk","chair","monitor"],     dPos: [-1.5,  1.7, -2.2], yaw: () => Math.random()*0.5-0.25 },
    { cats: ["printer","computer"],         dPos: [-2.2,  2.0, -1.0], yaw: () => Math.random()*0.8-0.4 },
    { cats: ["server","rack","printer"],    dPos: [ 1.2,  2.4,  1.8], yaw: () => Math.random()*0.4-0.2 },
    { cats: ["laptop","keyboard","monitor"],dPos: [ 0.0,  2.0,  2.6], yaw: () => Math.random()*Math.PI },
    { cats: ["chair","desk","mouse"],       dPos: [ 2.8,  2.2,  1.4], yaw: () => Math.random()*0.6-0.3 },
  ];

  let cur = new THREE.Vector3(0, 0.2, 0);
  for (let i = 0; i < 7; i++) {
    for (const s of steps) {
      cur = cur.clone().add(new THREE.Vector3(...s.dPos));
      platformFromCats(s.cats, cur.clone(), s.yaw());
      // sporadische Checkpoints
      if ((i + Math.random()) % 3 < 1) {
        const cp = cur.clone(); cp.y += 1.3;
        const beacon = new THREE.PointLight(0x66ccff, 1.2, 10);
        beacon.position.copy(cp);
        scene.add(beacon);
        checkpoints.push({ pos: cp });
      }
    }
  }
}

// ======= Spieler / Controller =======
class PlayerController {
  constructor() {
    this.group = new THREE.Group();
    this.group.position.set(0, 1.2, 0);
    scene.add(this.group);

    this.velocity = new THREE.Vector3(0, 0, 0);
    this.onGround = false;

    this.radius = SETTINGS.playerRadius;
    this.height = SETTINGS.playerHeight;

    this.model = null;
    this.mixer = null;
    this.actions = {};
    this.currentAction = null; // ← Animation-Statemachine
    this.heading = 0;

    this._loadOrMakeCapsule();
    this._initHelpers();
  }

  _initHelpers() {
    const foot = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0x00a2ff })
    );
    foot.visible = false; // für Debug true setzen
    this.footMarker = foot;
    this.group.add(foot);
  }

  async _loadOrMakeCapsule() {
    setStatus("Lade Charakter…");
    const candidates = expandPathCandidates(ASSET_PATHS.character).concat([
      "assets/models/business-man.glb",
      "assets/models/Business Man.glb",
      "assets/models/Business%20Man.glb",
    ]);
    try {
      const { g } = await loadGLBWithFallback(candidates);
      const root = g.scene || g.scenes[0];

      root.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true; o.receiveShadow = true;
          if (o.material) {
            o.material.side = THREE.FrontSide;
            if (o.material.transparent && o.material.opacity === 0) {
              o.material.opacity = 1; o.material.transparent = false;
            }
          }
        }
      });

      if (g.animations && g.animations.length) {
        this.mixer = new THREE.AnimationMixer(root);
        for (const clip of g.animations) this.actions[clip.name.toLowerCase()] = this.mixer.clipAction(clip);
        // starte idle, falls vorhanden
        this._setActionFromList(["idle","rest","stand","idle_01","a_idle","idlepose"], 0);
      }

      // skalieren/zentrieren
      root.updateMatrixWorld(true);
      let { size, box } = computeBBox(root);
      const targetH = this.height * 0.92;
      const scale = targetH / Math.max(size.y, 0.01);
      root.scale.setScalar(scale);
      root.updateMatrixWorld(true);
      box = new THREE.Box3().setFromObject(root);
      const center = new THREE.Vector3(); box.getCenter(center);
      root.position.sub(center);
      root.position.y += this.height * 0.5;

      this.model = root;
      this.group.add(root);
      setStatus("Ready! Businessman geladen ✨");
    } catch (err) {
      console.error("GLB Load Error (Character):", err);
      const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(this.radius, Math.max(0.1, this.height - 2*this.radius), 8, 16),
        new THREE.MeshStandardMaterial({ color: 0x22d3ee, roughness: 0.5, metalness: 0.1 })
      );
      body.castShadow = true; body.receiveShadow = true;
      body.position.y = this.height / 2;
      this.group.add(body);
      setStatus("Ready (Fallback-Char). Prüfe Pfad/Kompression deines GLB!");
    }
  }

  // ---- Animationen: wechsle nur bei Änderung (keine Frame-Resets mehr)
  _setAction(name, fade = 0.2) {
    if (!this.mixer || !this.actions[name]) return;
    if (this.currentAction === name) return;
    const next = this.actions[name];
    next.enabled = true; next.setLoop(THREE.LoopRepeat); next.clampWhenFinished = false;
    if (this.currentAction && this.actions[this.currentAction]) {
      next.reset().play();
      this.actions[this.currentAction].crossFadeTo(next, fade, false);
    } else {
      next.reset().play();
    }
    this.currentAction = name;
  }
  _setActionFromList(list, fade = 0.2) {
    for (const n of list) if (this.actions[n]) { this._setAction(n, fade); return; }
  }
  _playJumpOnce() {
    if (!this.mixer) return false;
    const jumpName = ["jump","jumps","jump_start"].find(n => this.actions[n]);
    if (!jumpName) return false;
    const base = this.currentAction;
    const a = this.actions[jumpName];
    a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true; a.reset().play();
    if (base && this.actions[base]) this.actions[base].crossFadeTo(a, 0.1, false);
    // nach Ende sanft zurück
    this.mixer.addEventListener("finished", (e) => {
      if (e.action === a) this._setAction(base || "idle", 0.15);
    });
    return true;
  }

  get position() { return this.group.position; }

  update(dt, camYaw) {
    const forward  = (keys.has("w") || keys.has("arrowup"));
    const backward = (keys.has("s") || keys.has("arrowdown"));
    const left     = (keys.has("a") || keys.has("arrowleft"));
    const right    = (keys.has("d") || keys.has("arrowright"));
    const sprint   = keys.has("shift");

    let wishDir = new THREE.Vector3();
    if (forward)  wishDir.z -= 1;
    if (backward) wishDir.z += 1;
    if (left)     wishDir.x -= 1;
    if (right)    wishDir.x += 1;
    if (wishDir.lengthSq() > 0) wishDir.normalize();

    const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), camYaw);
    wishDir.applyQuaternion(rot);

    const speed = SETTINGS.moveSpeed * (sprint ? SETTINGS.sprintMult : 1);
    const desiredVel = new THREE.Vector3(wishDir.x * speed, this.velocity.y, wishDir.z * speed);

    const accel = this.onGround ? 20 : (10 * SETTINGS.airControl);
    this.velocity.x = THREE.MathUtils.damp(this.velocity.x, desiredVel.x, accel, dt);
    this.velocity.z = THREE.MathUtils.damp(this.velocity.z, desiredVel.z, accel, dt);

    // Gravity
    this.velocity.y -= SETTINGS.gravity * dt;

    // Jump (nur einmal triggern)
    if (this.onGround && _pendingJump) {
      this.velocity.y = SETTINGS.jumpSpeed;
      this.onGround = false;
      this._playJumpOnce();
    }
    _pendingJump = false;

    // Bewegung + einfache Kollision
    const nextPos = this.position.clone().addScaledVector(this.velocity, dt);

    // --- Stabilere Bodenprüfung (Anti-Jitter)
    const halfH = this.height * 0.5;
    const skin  = 0.03;                               // kleiner Abstand zur Oberfläche
    const footOrigin = nextPos.clone();
    footOrigin.y += halfH + 0.6;                      // klar über dem Kopf starten
    const ray = new THREE.Raycaster(footOrigin, new THREE.Vector3(0, -1, 0), 0, this.height + 1.2);
    const hits = ray.intersectObjects(colliders, false);

    let grounded = false;
    if (hits.length) {
      const h = hits[0];
      const groundY = h.point.y + halfH + skin;
      if (nextPos.y <= groundY && this.velocity.y <= 0) {
        nextPos.y = groundY;          // sauber aufsetzen
        this.velocity.y = 0;
        grounded = true;
      }
    }
    this.onGround = grounded;

    // Seiten-Kollision
    const horizDir = new THREE.Vector3(this.velocity.x, 0, this.velocity.z);
    const hLen = horizDir.length();
    if (hLen > 0.0001) {
      horizDir.normalize();
      const offsets = [
        new THREE.Vector3(0, this.height * 0.5, 0),
        new THREE.Vector3(0, this.height * 0.2, 0),
        new THREE.Vector3(0, this.height * 0.8, 0),
      ];
      const margin = SETTINGS.playerRadius + 0.04;
      for (const off of offsets) {
        const origin = nextPos.clone().add(off);
        const r = new THREE.Raycaster(origin, horizDir, 0, margin + hLen * dt);
        const hitsSide = r.intersectObjects(colliders, false);
        if (hitsSide.length && hitsSide[0].distance < margin + 0.01) {
          const pushBack = horizDir.clone().multiplyScalar((margin + 0.01) - hitsSide[0].distance);
          nextPos.sub(pushBack);
          this.velocity.x = 0; this.velocity.z = 0;
          break;
        }
      }
    }

    // Position übernehmen
    this.group.position.copy(nextPos);
    this.footMarker.position.set(0, -this.height * 0.5, 0);

    // Ausrichtung
    if (wishDir.lengthSq() > 0.0001) {
      const targetYaw = Math.atan2(wishDir.x, wishDir.z);
      this.heading = THREE.MathUtils.damp(this.heading, targetYaw, 12, dt);
    }
    this.group.rotation.y = this.heading;

    // Animationen (kontinuierlich)
    if (this.mixer) this.mixer.update(dt);
    if (this.onGround) {
      const moving = (Math.abs(this.velocity.x) + Math.abs(this.velocity.z)) > 0.6;
      if (moving) this._setActionFromList(["run","jog","walk"], 0.15);
      else        this._setActionFromList(["idle","rest","stand"], 0.15);
    }

    if (this.position.y < SETTINGS.fallY) this.respawn();
  }

  respawn(toIndex = activeCheckpointIndex) {
    const cp = checkpoints[Math.max(0, Math.min(checkpoints.length - 1, toIndex))];
    if (cp) {
      this.group.position.copy(cp.pos);
      this.velocity.set(0, 0, 0);
      this.onGround = false;
      setStatus(`Respawn bei Checkpoint ${toIndex + 1}/${checkpoints.length}`);
    }
  }
}

// ======= Kamera-Controller (Mausdrag, weich folgend) =======
let camYaw = 0, camPitch = 0.12;
let isDragging = false;
let lastX = 0, lastY = 0;
canvas.addEventListener("mousedown", (e) => { isDragging = true; lastX = e.clientX; lastY = e.clientY; });
window.addEventListener("mouseup",   () => { isDragging = false; });
window.addEventListener("mousemove", (e) => {
  if (!isDragging) return;
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX; lastY = e.clientY;
  camYaw   -= dx * 0.003;
  camPitch -= dy * 0.003;
  camPitch = THREE.MathUtils.clamp(camPitch, -1.2, 1.2);
});
window.addEventListener("wheel", (e) => {
  SETTINGS.camDistance = THREE.MathUtils.clamp(SETTINGS.camDistance + Math.sign(e.deltaY) * 0.6, 3.2, 9.5);
}, { passive: true });

// ======= Input =======
let _pendingJump = false;
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  keys.add(k);
  if (k === " " || k === "space") _pendingJump = true;
  if (k === "r") player?.respawn();
});
window.addEventListener("keyup", (e) => {
  keys.delete(e.key.toLowerCase());
});

// ======= Resize =======
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ======= Setup & Loop =======
makeGround();

setStatus("Lade Plattform-Assets…");
const MODEL_PACK = await loadModelPack(MODEL_PACK_PATHS);
await makeITWorld(MODEL_PACK);

const player = new PlayerController();

// Start bei erstem Checkpoint
if (checkpoints.length) {
  player.group.position.copy(checkpoints[0].pos);
  setStatus("Lade Charakter…");
}

// Checkpoint-Aktualisierung
function updateCheckpoint() {
  let closest = 0, bestD = Infinity;
  for (let i = 0; i < checkpoints.length; i++) {
    const d = checkpoints[i].pos.distanceToSquared(player.position);
    if (d < bestD) { bestD = d; closest = i; }
  }
  if (closest !== activeCheckpointIndex && Math.sqrt(bestD) < 4.5) {
    activeCheckpointIndex = closest;
    setStatus(`Checkpoint ${activeCheckpointIndex + 1}/${checkpoints.length} erreicht`);
  }
}

// Kamera-Follow (Yaw+Pitch, weich)
const camTarget = new THREE.Vector3();
function updateCamera(dt) {
  const spherical = new THREE.Spherical(SETTINGS.camDistance, Math.PI / 2 - camPitch, camYaw);
  const offset = new THREE.Vector3().setFromSpherical(spherical);
  const desired = player.position.clone()
    .add(new THREE.Vector3(0, SETTINGS.camHeight, 0))
    .add(offset);

  camera.position.lerp(desired, 1 - Math.pow(1 - SETTINGS.camLag, dt * 60));
  camTarget.copy(player.position).add(new THREE.Vector3(0, 1.2, 0));
  camera.lookAt(camTarget);
}

// leicht dynamisches Sonnenlicht
let tAccum = 0;
function updateLighting(dt) {
  tAccum += dt * 0.1;
  sun.position.set(Math.cos(tAccum) * 10, 10 + Math.sin(tAccum) * 2, 8);
}

// Renderloop
renderer.setAnimationLoop(() => {
  const dt = Math.min(0.033, clock.getDelta());
  player.update(dt, camYaw);
  updateCheckpoint();
  updateCamera(dt);
  updateLighting(dt);
  renderer.render(scene, camera);
});
