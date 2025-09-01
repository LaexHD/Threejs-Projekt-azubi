// three.js + Loader von CDN
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";

// ======= Konfiguration =======
const ASSET_PATHS = {
  character: "assets/character.glb", // <— hier deinen Pfad eintragen (glb/gltf)
  // optionale Texturen:
  keyboardTex: "assets/textures/keyboard_diffuse.jpg",
  cableTex: "assets/textures/cable_diffuse.jpg",
};

const SETTINGS = {
  gravity: 24,          // m/s^2
  moveSpeed: 7.0,       // Grundtempo
  sprintMult: 1.5,      // Sprint-Faktor
  jumpSpeed: 9.5,       // Anfangs-Jumpspeed
  airControl: 0.45,     // Steuerbarkeit in der Luft (0..1)
  camDistance: 5.5,     // Verfolgungskamera Abstand
  camHeight: 2.2,       // Kamera-Höhe über Player
  camLag: 0.1,          // Kamera-Verzögerung (0..1)
  playerRadius: 0.35,   // Kapsel-Radius
  playerHeight: 1.7,    // Kapsel-Höhe
  fallY: -50,           // Respawn-Grenze
};

// ======= Renderer/Scene/Camera =======
const canvas = document.getElementById("app");
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: true, powerPreference: "high-performance"
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0e12);
scene.fog = new THREE.Fog(0x0b0e12, 18, 120);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.05, 500);
camera.position.set(0, 2, 6);

// ======= Licht =======
const hemi = new THREE.HemisphereLight(0xbad7ff, 0x080a0f, 0.7);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffffff, 1.1);
sun.position.set(6, 12, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 80;
sun.shadow.normalBias = 0.02;
scene.add(sun);

// ======= Hilfsstrukturen =======
const clock = new THREE.Clock();
const keys = new Set();
const colliders = [];   // statische Kollisionen (Meshes)
const checkpoints = []; // { pos: THREE.Vector3 }
let activeCheckpointIndex = 0;

const statusEl = document.getElementById("status");
function setStatus(t) { if (statusEl) statusEl.textContent = t; }

// ======= Loader =======
const texLoader = new THREE.TextureLoader();
function tryLoadTexture(url, onLoad) {
  return new Promise((resolve) => {
    texLoader.load(url, (t) => { t.colorSpace = THREE.SRGBColorSpace; onLoad && onLoad(t); resolve(t); },
      undefined, () => resolve(null));
  });
}

// ======= Boden (Startplattform) =======
function makeGround() {
  const geo = new THREE.PlaneGeometry(26, 26);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x0f1622, roughness: 0.95, metalness: 0.05
  });
  const ground = new THREE.Mesh(geo, mat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.position.y = 0;
  scene.add(ground);

  // ein paar leuchtende Leiterbahnen
  const lines = new THREE.Group();
  for (let i = 0; i < 180; i++) {
    const w = Math.random() * 0.02 + 0.005;
    const l = Math.random() * 6 + 1.5;
    const geoL = new THREE.BoxGeometry(w, 0.002, l);
    const matL = new THREE.MeshStandardMaterial({
      color: 0x00f6ff, emissive: 0x00c0ff, emissiveIntensity: 0.6, roughness: 0.4, metalness: 0.8
    });
    const m = new THREE.Mesh(geoL, matL);
    m.position.set((Math.random() - 0.5) * 24, 0.001, (Math.random() - 0.5) * 24);
    m.rotation.y = Math.random() * Math.PI;
    m.receiveShadow = true;
    lines.add(m);
  }
  ground.add(lines);
}

// ======= IT-Deko/Plattformen =======
async function makeITWorld() {
  // Tastatur-Plattform
  const keyboardTex = await tryLoadTexture(ASSET_PATHS.keyboardTex);
  function keyboardPlatform(w = 4, d = 1.8, pos = new THREE.Vector3()) {
    const geo = new THREE.BoxGeometry(w, 0.2, d);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x131a24,
      map: keyboardTex || null,
      roughness: 0.9,
      metalness: 0.05,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.position.copy(pos);
    scene.add(mesh);
    colliders.push(mesh);
    return mesh;
  }

  // Server-Rack (als hohe Plattform)
  function serverRack(h = 3.2, pos = new THREE.Vector3()) {
    const geo = new THREE.BoxGeometry(1.2, h, 1.2);
    const mat = new THREE.MeshStandardMaterial({ color: 0x0e1420, roughness: 0.6, metalness: 0.4 });
    const rack = new THREE.Mesh(geo, mat);
    rack.position.copy(pos);
    rack.castShadow = true; rack.receiveShadow = true;

    // LEDs
    const ledGeo = new THREE.BoxGeometry(0.02, 0.02, 0.02);
    for (let y = -h/2 + 0.2; y < h/2 - 0.2; y += 0.25) {
      const led = new THREE.Mesh(ledGeo, new THREE.MeshStandardMaterial({
        color: 0x00ffb7, emissive: 0x00ffc8, emissiveIntensity: 1.2, metalness: 1, roughness: 0.2
      }));
      led.position.set(0.55, y, 0.61);
      rack.add(led);
    }

    scene.add(rack);
    colliders.push(rack);
    return rack;
  }

  // Kabel-Brücke (schmale, lange Plattform)
  const cableTex = await tryLoadTexture(ASSET_PATHS.cableTex);
  function cableBridge(len = 5, pos = new THREE.Vector3()) {
    const geo = new THREE.BoxGeometry(0.5, 0.15, len);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x1b232f, map: cableTex || null, roughness: 0.85, metalness: 0.1
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);
    colliders.push(mesh);
    return mesh;
  }

  // Parcours aufbauen – kontinuierlich nach oben wie "Only Up"
  const startY = 0.2;
  keyboardPlatform(5, 3, new THREE.Vector3(0, startY, 0));
  checkpoints.push({ pos: new THREE.Vector3(0, startY + 1.0, 0) });

  let cur = new THREE.Vector3(0, startY, 0);
  const steps = [
    { fn: keyboardPlatform, args: [3, 1.6], dPos: [2.5, 1.2, -2] },
    { fn: serverRack, args: [3.6],        dPos: [2, 2.2, -0.5] },
    { fn: cableBridge, args: [6],         dPos: [-1.5, 1.8, -2] },
    { fn: keyboardPlatform, args: [2, 1.2], dPos: [-2.2, 2.0, -1] },
    { fn: serverRack, args: [4.0],        dPos: [1.2, 2.6, 1.8] },
    { fn: cableBridge, args: [7],         dPos: [0, 2.2, 2.5] },
    { fn: keyboardPlatform, args: [2.8, 1.4], dPos: [2.8, 2.4, 1.5] },
  ];

  for (let i = 0; i < 12; i++) { // mehrere Schleifen, um Höhe zu gewinnen
    for (const s of steps) {
      cur = cur.clone().add(new THREE.Vector3(...s.dPos));
      s.fn(...s.args, cur.clone());
      // gelegentlich einen Checkpoint setzen
      if ((i + Math.random()) % 3 < 1) {
        const cp = cur.clone(); cp.y += 1.2;
        const beacon = new THREE.PointLight(0x00ffff, 1.2, 10);
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
    this.heading = 0; // Yaw des Spielers (für Animation/Orientierung)

    this._loadOrMakeCapsule();
    this._initHelpers();
  }

  _initHelpers() {
    // kleine Schattenkugel an den Füßen, hilft beim Kontaktgefühl
    const foot = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0x00ffff })
    );
    foot.visible = false; // debug off; auf true setzen um zu sehen
    this.footMarker = foot;
    this.group.add(foot);
  }

  _loadOrMakeCapsule() {
    const loader = new GLTFLoader();
    loader.load(ASSET_PATHS.character, (gltf) => {
      const root = gltf.scene || gltf.scenes[0];
      root.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true; o.receiveShadow = true;
          if (o.material) o.material.side = THREE.FrontSide;
        }
      });
      // optional: Animationen
      if (gltf.animations && gltf.animations.length) {
        this.mixer = new THREE.AnimationMixer(root);
        for (const clip of gltf.animations) {
          this.actions[clip.name.toLowerCase()] = this.mixer.clipAction(clip);
        }
        // Idle wenn vorhanden
        const idle = this._findAction(["idle", "rest", "stand"]);
        if (idle) idle.play();
      }

      // skalieren/zentrieren
      const box = new THREE.Box3().setFromObject(root);
      const size = new THREE.Vector3();
      box.getSize(size);
      const targetH = this.height * 0.92;
      const scale = targetH / Math.max(size.y, 1e-3);
      root.scale.setScalar(scale);
      box.setFromObject(root);
      const center = new THREE.Vector3();
      box.getCenter(center);
      root.position.sub(center.multiplyScalar(1)); // zentrieren
      root.position.y += this.height * 0.5;        // auf Kapsel setzen

      this.model = root;
      this.group.add(root);
      setStatus("Ready! Viel Spaß ✨");
    }, undefined, () => {
      // Fallback: Kapsel
      const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(this.radius, Math.max(0.1, this.height - 2*this.radius), 8, 16),
        new THREE.MeshStandardMaterial({ color: 0x22d3ee, roughness: 0.5, metalness: 0.1 })
      );
      body.castShadow = true; body.receiveShadow = true;
      body.position.y = this.height / 2;
      this.group.add(body);
      setStatus("Ready (Fallback-Char). Pfad zu deinem GLB setzen!");
    });
  }

  _findAction(names) {
    for (const n of names) {
      const a = this.actions[n];
      if (a) return a;
    }
    return null;
  }

  _playOnce(nameList) {
    const a = this._findAction(nameList);
    if (!a) return;
    for (const k in this.actions) this.actions[k].stop();
    a.reset().play();
  }

  get position() { return this.group.position; }

  update(dt, camYaw) {
    // — Eingaben lesen —
    const forward = (keys.has("w") || keys.has("arrowup"));
    const backward = (keys.has("s") || keys.has("arrowdown"));
    const left = (keys.has("a") || keys.has("arrowleft"));
    const right = (keys.has("d") || keys.has("arrowright"));
    const sprint = keys.has("shift");

    // Bewegungsrichtung relativ zur Kamera
    let wishDir = new THREE.Vector3();
    if (forward) wishDir.z -= 1;
    if (backward) wishDir.z += 1;
    if (left) wishDir.x -= 1;
    if (right) wishDir.x += 1;
    if (wishDir.lengthSq() > 0) wishDir.normalize();

    // Richtung in Welt um die Yaw der Kamera drehen
    const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), camYaw);
    wishDir.applyQuaternion(rot);

    // Zielgeschwindigkeit
    const speed = SETTINGS.moveSpeed * (sprint ? SETTINGS.sprintMult : 1);
    const desiredVel = new THREE.Vector3(wishDir.x * speed, this.velocity.y, wishDir.z * speed);

    // Dämpfen & Air-Control
    const accel = this.onGround ? 20 : (10 * SETTINGS.airControl);
    this.velocity.x = THREE.MathUtils.damp(this.velocity.x, desiredVel.x, accel, dt);
    this.velocity.z = THREE.MathUtils.damp(this.velocity.z, desiredVel.z, accel, dt);

    // Gravity
    this.velocity.y -= SETTINGS.gravity * dt;
    // Jump
    if (this.onGround && _pendingJump) {
      this.velocity.y = SETTINGS.jumpSpeed;
      this.onGround = false;
      this._playOnce(["jump", "jumps", "jump_start"]);
    }
    _pendingJump = false;

    // Bewegung anwenden (mit einfacher Kollision)
    const nextPos = this.position.clone().addScaledVector(this.velocity, dt);

    // Bodenprüfung (Raycast von oberhalb der Füße nach unten)
    const footOrigin = nextPos.clone().add(new THREE.Vector3(0, this.height * 0.6, 0));
    const ray = new THREE.Raycaster(footOrigin, new THREE.Vector3(0, -1, 0), 0, this.height);
    const hits = ray.intersectObjects(colliders, false);

    let grounded = false;
    if (hits.length) {
      const h = hits[0];
      const groundY = h.point.y + this.height * 0.5; // Füße aufsetzen
      if (nextPos.y <= groundY + 0.02 && this.velocity.y <= 0) {
        nextPos.y = groundY;
        this.velocity.y = 0;
        grounded = true;
      }
    }
    this.onGround = grounded;

    // einfache Seiten-Kollision: vier horizontale Rays in Bewegungsrichtung
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
          // stoppe die horizontale Bewegung Richtung Wand
          const pushBack = horizDir.clone().multiplyScalar((margin + 0.01) - hitsSide[0].distance);
          nextPos.sub(pushBack);
          this.velocity.x = 0; this.velocity.z = 0;
          break;
        }
      }
    }

    // Position setzen
    this.group.position.copy(nextPos);
    this.footMarker.position.set(0, -this.height * 0.5, 0);

    // Spieler-Heading für Modell ausrichten
    if (wishDir.lengthSq() > 0.0001) {
      const targetYaw = Math.atan2(wishDir.x, wishDir.z);
      this.heading = THREE.MathUtils.damp(this.heading, targetYaw, 12, dt);
    }
    this.group.rotation.y = this.heading;

    // Animationen rudimentär umschalten
    if (this.mixer) this.mixer.update(dt);
    if (this.onGround) {
      const moving = (Math.abs(this.velocity.x) + Math.abs(this.velocity.z)) > 0.6;
      if (moving) this._playOnce(["run", "walk", "jog"]);
      else this._playOnce(["idle", "rest", "stand"]);
    }

    // Respawn
    if (this.position.y < SETTINGS.fallY) {
      this.respawn();
    }
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
let camYaw = 0, camPitch = 0.12; // Startwinkel
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
await makeITWorld();

const player = new PlayerController();

// Start bei erstem Checkpoint
if (checkpoints.length) {
  player.group.position.copy(checkpoints[0].pos);
  setStatus("Lade Charakter…");
}

// kleines UI: aktiver Checkpoint aktualisieren, wenn nahe
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

// Kameraverfolgung (weich)
const camTarget = new THREE.Vector3();
function updateCamera(dt) {
  const behind = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0,1,0), camYaw);
  const desired = player.position.clone()
    .add(new THREE.Vector3(0, SETTINGS.camHeight, 0))
    .addScaledVector(behind, SETTINGS.camDistance);

  camera.position.lerp(desired, 1 - Math.pow(1 - SETTINGS.camLag, dt * 60));
  camTarget.copy(player.position).add(new THREE.Vector3(0, 1.2, 0)); // Blick auf Oberkörper
  camera.lookAt(camTarget);
}

// hübsches Umgebungslicht nach Zeit
let tAccum = 0;
function updateLighting(dt) {
  tAccum += dt * 0.1;
  sun.position.set(
    Math.cos(tAccum) * 10,
    10 + Math.sin(tAccum) * 2,
    8
  );
}

renderer.setAnimationLoop(() => {
  const dt = Math.min(0.033, clock.getDelta());

  player.update(dt, camYaw);
  updateCheckpoint();
  updateCamera(dt);
  updateLighting(dt);

  renderer.render(scene, camera);
});
