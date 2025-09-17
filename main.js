// ============================= Imports (CDN) ===============================
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import { GLTFLoader }  from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/DRACOLoader.js";
import { KTX2Loader }  from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/meshopt_decoder.module.min.js";
import * as SkeletonUtils from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/SkeletonUtils.js";
import { Capsule } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/math/Capsule.js";
import { mergeGeometries } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js";
import {
  MeshBVHHelper,
  acceleratedRaycast,
  computeBoundsTree,
  disposeBoundsTree
} from "https://cdn.jsdelivr.net/npm/three-mesh-bvh@0.9.1/build/index.module.js";

// BVH an three.js hängen
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree  = disposeBoundsTree;
THREE.Mesh.prototype.raycast                     = acceleratedRaycast;


// ============================= UI / Screens ================================
const q  = (s, r=document) => r.querySelector(s);
const qq = (s, r=document) => Array.from(r.querySelectorAll(s));
const { clamp, damp } = THREE.MathUtils;

const body = document.body;
if (!body.hasAttribute("data-screen")) body.setAttribute("data-screen", "menu");

const UI = {
  canvas:      q("#app"),
  status:      q("#status"),
  menuSub:     q("#menu-sub"),
  loadingBar:  q("#loading-bar"),
  loadingText: q("#loading-text"),

  btnStart:    q("#btn-start"),
  btnOptions:  q("#btn-options"),
  btnCredits:  q("#btn-credits"),
  btnBack1:    q("#btn-back-1"),
  btnBack2:    q("#btn-back-2"),

  btnResume:   q("#btn-resume"),
  btnRestart:  q("#btn-restart"),
  btnQuit:     q("#btn-quit"),

  sensSlider:  q("#opt-sens"),
  sensVal:     q("#opt-sens-val"),
};

const INPUT = {
  mouseSens: parseFloat(localStorage.getItem("onlyup.mouseSens")) || 1.0
};

function setScreen(name){
  body.setAttribute("data-screen", name);
  if (name === "game") UI.canvas?.focus({ preventScroll: true });
}
function openSubPanel(name){
  UI.menuSub?.classList.remove("hidden");
  qq(".menu-sub .panel-content").forEach(p => p.classList.toggle("active", p.dataset.panel === name));
}
function closeSubPanel(){ UI.menuSub?.classList.add("hidden"); }
function setStatus(t){ if (UI.status) UI.status.textContent = t; }
function setLoadingPercent(pct){
  const p = clamp(Math.round(pct), 0, 100);
  UI.loadingBar?.style.setProperty("--pct", p);
  UI.loadingText && (UI.loadingText.textContent = `Lade Assets… ${p}%`);
  q(".progress")?.setAttribute("aria-valuenow", String(p));
}

// Maus-Sens Schieber -> Zustand + Anzeige
if (UI.sensSlider) {
  UI.sensSlider.value = String(INPUT.mouseSens);
  if (UI.sensVal) UI.sensVal.textContent = `${INPUT.mouseSens.toFixed(2)}×`;
  const applySens = () => {
    INPUT.mouseSens = parseFloat(UI.sensSlider.value) || 1.0;
    localStorage.setItem("onlyup.mouseSens", String(INPUT.mouseSens));
    UI.sensVal && (UI.sensVal.textContent = `${INPUT.mouseSens.toFixed(2)}×`);
  };
  UI.sensSlider.addEventListener("input", applySens);
  UI.sensSlider.addEventListener("change", applySens);
}

// Menü-Buttons
UI.btnStart   ?.addEventListener("click", startGame);
UI.btnOptions ?.addEventListener("click", () => openSubPanel("options"));
UI.btnCredits ?.addEventListener("click", () => openSubPanel("credits"));
UI.btnBack1   ?.addEventListener("click", closeSubPanel);
UI.btnBack2   ?.addEventListener("click", closeSubPanel);

// Pause-Buttons
UI.btnResume  ?.addEventListener("click", () => setPaused(false));
UI.btnRestart ?.addEventListener("click", () => { setPaused(false); player?.respawn(); });
UI.btnQuit    ?.addEventListener("click", () => { setPaused(true); setScreen("menu"); });

// ESC toggelt Pause
window.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const s = body.getAttribute("data-screen");
  if (s === "game")  { setPaused(true);  setScreen("paused"); }
  if (s === "paused"){ setPaused(false); setScreen("game");   }
});


// ============================= Config / Debug ==============================
const DEBUG = {
  ENABLED: true,
  SHOW_STATIC: true,
  SHOW_CAPSULE: false,
  SHOW_BVH: false
};
const DEBUG_COLORS = {
  bbox: 0x3b82f6,
  groundEdge: 0xffffff,
  capsule: 0xff00aa
};

const ASSET_PATHS = { character: "Business Man.glb" };
const MODEL_PACK_PATHS = [
  "Computer Mouse.glb","Computer.glb","Desk.glb","Headphones.glb",
  "Keyboard.glb","Laptop.glb","Monitor.glb","Office Chair (1).glb",
  "Office Chair.glb","Office Printer Copier.glb","Phone.glb",
  "server rack.glb","Standing Desk.glb","Stapler.glb"
];
const MODEL_CATEGORIES = {
  keyboard:["keyboard"], laptop:["laptop","notebook"], server:["server","rack"],
  printer:["printer","copier"], desk:["desk","table","standing desk"],
  monitor:["monitor","screen","display"], chair:["chair","seat"],
  computer:["computer","pc","tower","case"], mouse:["mouse"],
  phone:["phone","smartphone","mobile"], stapler:["stapler"],
  headphones:["headphones","headset"], generic:[]
};
const TARGET_WIDTH_BY_CAT = {
  desk:4.5, server:1.6, printer:2.4, keyboard:3.2, laptop:2.8,
  monitor:2.2, chair:2.2, computer:2.0, mouse:2.0, phone:2.0,
  stapler:2.0, headphones:2.0, generic:2.5
};

const SETTINGS = {
  gravity: 24, moveSpeed: 7.0, sprintMult: 1.5, jumpSpeed: 9.5,
  airControl: 0.45, camDistance: 5.8, camHeight: 2.2, camLag: 0.12,
  playerRadius: 0.35, playerHeight: 1.7, fallY: -80,
  maxAirJumps: 1, doubleJumpMult: 0.92,
  // Coyote / Jumpbuffer
  coyoteTime: 0.12,
  jumpBuffer: 0.12
};
const WALKABLE_NORMAL_Y = 0.6;
const TERMINAL_FALL_SPEED = -40;
const SUBSTEP_PEN_TARGET  = 0.10;

const MAX_DISP_PER_SUBSTEP = SETTINGS.playerRadius * 0.35;
const MAX_RESOLVE_ITERS    = 12;
const SKIN_WIDTH           = 0.02;
const GROUND_SNAP_MAX      = 0.32;

const PLATFORM_SIZE_MULT = 1.4;
const START_SIZE_MULT    = 1.6;
const KEEP_Y_SCALE       = true;


// ============================= Renderer / Scene ============================
const renderer = new THREE.WebGLRenderer({ canvas: UI.canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const SKY = new THREE.Color(0xBFE8FF);
const scene = new THREE.Scene();
scene.background = SKY;
scene.fog = new THREE.Fog(SKY, 50, 220);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.05, 800);
camera.position.set(0,2,7);

scene.add(new THREE.HemisphereLight(0xdfefff, 0xbfd4e6, 0.9));
const sun = new THREE.DirectionalLight(0xffffff, 0.9);
sun.position.set(6,12,8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048,2048);
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far  = 180;
sun.shadow.normalBias  = 0.02;
scene.add(sun);


// ============================= Loaders/Manager =============================
let loadingManager, gltfLoader, draco, ktx2;

function setupLoaders(){
  loadingManager = new THREE.LoadingManager();
  loadingManager.onStart    = () => { setScreen("loading"); setLoadingPercent(0); };
  loadingManager.onProgress = (_url, loaded, total) => setLoadingPercent(total ? (loaded/total)*100 : 10);
  loadingManager.onLoad     = () => setLoadingPercent(100);

  gltfLoader = new GLTFLoader(loadingManager);

  draco = new DRACOLoader();
  draco.setDecoderPath("https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/");
  gltfLoader.setDRACOLoader(draco);

  ktx2 = new KTX2Loader().setTranscoderPath("https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/basis/").detectSupport(renderer);
  gltfLoader.setKTX2Loader(ktx2);
  gltfLoader.setMeshoptDecoder(MeshoptDecoder);
}


// ============================= Game State ==================================
const clock = new THREE.Clock();
const keys = new Set();
const checkpoints = [];
let activeCheckpointIndex = 0;

const _collisionGeoms = [];
let worldCollisionMesh = null;
let worldBVHHelper = null;

const debugStatic = new THREE.Group();
scene.add(debugStatic);

let player = null;
let isPaused = false;
const setPaused = (v) => { isPaused = v; };


// ============================= Utils =======================================
function inferModelCategory(nameLower){
  for (const [cat, words] of Object.entries(MODEL_CATEGORIES)) {
    if (!words.length) continue;
    for (const w of words) if (nameLower.includes(w)) return cat;
  }
  return "generic";
}
function computeBBox(obj){
  const box=new THREE.Box3().setFromObject(obj);
  const size=new THREE.Vector3(); box.getSize(size);
  const center=new THREE.Vector3(); box.getCenter(center);
  return {box,size,center};
}
const escapeLiteralPercents = (p) => p.replace(/%/g,"%25");
function expandPathCandidates(p){
  const base=[p,encodeURI(p),escapeLiteralPercents(p),encodeURI(escapeLiteralPercents(p))];
  const out=[];
  for(const x of base){ out.push(x); if(!x.includes("/")) out.push("assets/models/"+x); }
  return Array.from(new Set(out));
}
function loadGLBWithFallback(paths){
  const list = paths.slice();
  return new Promise((res,rej)=>{
    const next = () => {
      if (!list.length) return rej(new Error("Alle GLB-Pfade fehlgeschlagen"));
      const url = list.shift();
      gltfLoader.load(url, g => res({ g, url }), undefined, next);
    };
    next();
  });
}
async function loadOneModel(path){
  const { g, url } = await loadGLBWithFallback(expandPathCandidates(path));
  const root = g.scene || g.scenes?.[0];
  root.traverse(o=>{
    if(!o.isMesh) return;
    o.castShadow = o.receiveShadow = true;
    if (o.material){
      o.material.side = THREE.FrontSide;
      if (o.material.transparent && o.material.opacity === 0){ o.material.opacity = 1; o.material.transparent = false; }
    }
  });
  const tmp = computeBBox(root);
  return { name:url.split("/").pop(), category:inferModelCategory(url.toLowerCase()), template:root, baseSize:tmp.size.clone(), animations:g.animations||[] };
}
async function loadModelPack(paths){
  const results=[];
  for(const p of paths){ try{ results.push(await loadOneModel(p)); }catch(e){ console.warn("Konnte Modell nicht laden:",p,e);} }
  const byCat = Object.fromEntries(Object.keys(MODEL_CATEGORIES).map(k=>[k,[]]));
  for(const m of results){ byCat[m.category]?.push(m); }
  const all=results.slice();
  for(const k of Object.keys(byCat)){ if(!byCat[k].length) byCat[k] = byCat.generic.length ? byCat.generic : all; }
  return { byCat, all };
}
function pickModel(pack, cats){
  for(const c of cats){ const arr = pack.byCat[c]; if (arr?.length) return arr[(Math.random()*arr.length)|0]; }
  const all = pack.all; return all[(Math.random()*all.length)|0];
}
function scaledSizeFor(modelDef, targetWidth){
  const baseXZ = Math.max(modelDef.baseSize.x, modelDef.baseSize.z);
  const s = baseXZ>1e-4 ? targetWidth/baseXZ : 1;
  return new THREE.Vector3(modelDef.baseSize.x*s, modelDef.baseSize.y*s, modelDef.baseSize.z*s);
}
const diagRadius = (size) => 0.5 * Math.hypot(size.x, size.z);


// ============================= Collision Baking ============================
function bakeMeshToCollision(mesh){
  const g0 = mesh.geometry;
  if(!g0?.isBufferGeometry) return;
  let g = g0.clone();
  if (g.index) g = g.toNonIndexed();
  mesh.updateWorldMatrix(true,false);
  g.applyMatrix4(mesh.matrixWorld);
  for(const n of Object.keys(g.attributes)){ if(n!=="position") g.deleteAttribute(n); }
  _collisionGeoms.push(g);
}


// ============================= Boden: Inselwelt ============================
function makeGround(){
  const R_TOP = 60;   // begehbarer Radius
  const R_BASE = 80;  // Fuß der Insel
  const H     = 16;   // Höhe nach unten
  const SEG   = 64;

  // Wasser (Deko)
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(400, 72),
    new THREE.MeshStandardMaterial({ color: 0x9ad7ff, metalness: 0.1, roughness: 0.85, transparent: true, opacity: 0.95 })
  );
  water.rotation.x = -Math.PI/2;
  water.position.y = -0.06;
  water.receiveShadow = true;
  scene.add(water);

  // Inselkörper (sichtbar + Kollision)
  const island = new THREE.Mesh(
    new THREE.CylinderGeometry(R_TOP, R_BASE, H, SEG, 1, false),
    new THREE.MeshStandardMaterial({ color: 0xEAF4FF, roughness: 0.95, metalness: 0.05 })
  );
  island.position.y = -H*0.5; // Oberseite auf y=0
  island.receiveShadow = true;
  scene.add(island);
  bakeMeshToCollision(island);

  // Oberkanten-Linie (optional mit Debug sichtbar)
  const rimEdges = new THREE.EdgesGeometry(new THREE.CylinderGeometry(R_TOP, R_TOP, 0.02, SEG));
  const rim = new THREE.LineSegments(rimEdges, new THREE.LineBasicMaterial({ color: DEBUG_COLORS.groundEdge }));
  rim.position.y = 0.01;
  rim.visible = DEBUG.ENABLED && DEBUG.SHOW_STATIC;
  debugStatic.add(rim);

  // Deko-Linien im Kreis
  const deco = new THREE.Group(); deco.position.y = 0.001; scene.add(deco);
  const rndInDisk = (r)=>{
    const t = Math.random()*Math.PI*2, rr = Math.sqrt(Math.random())*(r-2);
    return new THREE.Vector3(Math.cos(t)*rr, 0, Math.sin(t)*rr);
  };
  for(let i=0;i<140;i++){
    const w=Math.random()*0.02+0.006, l=Math.random()*5.5+1.2;
    const line = new THREE.Mesh(
      new THREE.BoxGeometry(w,0.002,l),
      new THREE.MeshStandardMaterial({ color:0x007aff, emissive:0x5fbaff, emissiveIntensity:0.32, roughness:0.4, metalness:0.6 })
    );
    const p = rndInDisk(R_TOP - 2);
    line.position.set(p.x, 0, p.z);
    line.rotation.y=Math.random()*Math.PI;
    line.receiveShadow=true;
    deco.add(line);
  }

  // Steine am Rand (nur Optik)
  const rocks = new THREE.Group(); rocks.position.y = 0; scene.add(rocks);
  for(let i=0;i<28;i++){
    const a = (i/28)*Math.PI*2 + Math.random()*0.2;
    const r = R_TOP - 4 + Math.random()*6;
    const s = Math.random()*0.9 + 0.6;
    const rock = new THREE.Mesh(
      new THREE.IcosahedronGeometry(s, 0),
      new THREE.MeshStandardMaterial({ color: 0xd7e6ff, roughness: 0.95, metalness: 0.05 })
    );
    rock.position.set(Math.cos(a)*r, 0, Math.sin(a)*r);
    rock.rotation.y = Math.random()*Math.PI*2;
    rock.castShadow = rock.receiveShadow = true;
    rocks.add(rock);
    // -> Kollision gewünscht? bakeMeshToCollision(rock);
  }

  // „Büsche“ als kleine Kegel (Optik)
  const bushes = new THREE.Group(); bushes.position.y = 0; scene.add(bushes);
  for(let i=0;i<18;i++){
    const p = rndInDisk(R_TOP - 8);
    const h = Math.random()*0.8 + 0.6;
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.5*h, 1.3*h, 8),
      new THREE.MeshStandardMaterial({ color: 0xbfe8ff, roughness: 0.8, metalness: 0.1 })
    );
    cone.position.set(p.x, 0, p.z);
    cone.rotation.y = Math.random()*Math.PI;
    cone.castShadow = cone.receiveShadow = true;
    bushes.add(cone);
    // -> Kollision gewünscht? bakeMeshToCollision(cone);
  }
}


// ============================= World Build =================================
const roughCheckpointAbove = (res, offsetY=0.2) => {
  const c = res.group.position.clone();
  c.y += res.size.y + SETTINGS.playerHeight * 0.6 + offsetY;
  return c;
};

async function makeITWorld(modelPack){
  const select = (cats, scaleHint=1) => {
    const cat = cats[Math.floor(Math.random() * cats.length)] || "generic";
    const w = (TARGET_WIDTH_BY_CAT[cat] || TARGET_WIDTH_BY_CAT.generic) * scaleHint;
    const mdl = pickModel(modelPack, [cat]);
    if(!mdl){
      const base = new THREE.Vector3(w, 0.3, Math.max(1.2, w*0.6));
      const size = new THREE.Vector3(base.x * PLATFORM_SIZE_MULT, KEEP_Y_SCALE ? base.y : base.y * PLATFORM_SIZE_MULT, base.z * PLATFORM_SIZE_MULT);
      return { model:null, size, targetW:w };
    }
    const est = scaledSizeFor(mdl, w);
    const size = new THREE.Vector3(est.x * PLATFORM_SIZE_MULT, KEEP_Y_SCALE ? est.y : est.y * PLATFORM_SIZE_MULT, est.z * PLATFORM_SIZE_MULT);
    return { model:mdl, size, targetW:w };
  };

  const place = (sel, pos, yaw=0) => sel.model
    ? placeModelPlatform(sel.model, { position:pos, yaw, targetWidth:sel.targetW })
    : makeBoxPlatform(sel.size.x/PLATFORM_SIZE_MULT, sel.size.y/(KEEP_Y_SCALE?1:PLATFORM_SIZE_MULT), sel.size.z/PLATFORM_SIZE_MULT, pos, yaw);

  // STARTPLATTFORM
  const startSel = select(["keyboard","desk","laptop","generic"], 1.25 * START_SIZE_MULT);
  const startRes = place(startSel, new THREE.Vector3(0,0.2,0));
  checkpoints.push({ pos: roughCheckpointAbove(startRes) });

  const stepsTotal = 50;
  let angle = 0, prevCenter = startRes.group.position.clone(), prevSize = startRes.size.clone();

  for(let i=0; i<stepsTotal; i++){
    // Schwierigkeit steigt: Lücken werden größer, Plattformen kleiner
    const difficulty = i / stepsTotal;
    const gap = THREE.MathUtils.lerp(0.9, 1.8, difficulty) * (0.8 + Math.random()*0.4);
    const rise = THREE.MathUtils.lerp(0.9, 2.0, difficulty) * (0.9 + Math.random()*0.3);
    const scaleHint = THREE.MathUtils.lerp(1.0, 0.7, difficulty); // Plattformen werden kleiner

    // Plattformwahl zufällig aus allen Kategorien
    const allCats = ["keyboard","laptop","monitor","server","computer","printer","desk","chair","headphones","mouse","phone"];
    const sel = select(allCats, scaleHint);

    angle += (Math.PI/7) * (0.9 + Math.random()*0.2); // leichte Variation der Drehung
    const distCenters = diagRadius(prevSize) + diagRadius(sel.size) + gap;
    const dir = new THREE.Vector3(Math.cos(angle),0,Math.sin(angle));
    const nextCenter = prevCenter.clone().addScaledVector(dir, distCenters);
    nextCenter.y += rise;

    const yaw = angle + Math.PI + (Math.random()*0.2 - 0.1); // leichte zufällige Drehung
    const res = place(sel, nextCenter, yaw);

    // Checkpoints: 30% Chance auf Plattform selbst, sonst über Plattform
    if(Math.random() < 0.3){
      const cp = nextCenter.clone();
      cp.y += sel.size.y * (0.5 + Math.random()*0.5); // irgendwo auf der Plattform
      checkpoints.push({ pos: cp });
    } else if(i % 7 === 6){
      checkpoints.push({ pos: roughCheckpointAbove(res) });
    }

    // Optionale Lichtpunkte über Checkpoints
    if(Math.random() < 0.2){
      const beacon = new THREE.PointLight(0x66ccff, 1.2, 10);
      const cpLight = roughCheckpointAbove(res, 0.3);
      beacon.position.copy(cpLight);
      scene.add(beacon);
    }

    prevCenter = nextCenter;
    prevSize = res.size.clone();
  }
}



// ============================= Platforms / Helpers =========================
function placeModelPlatform(modelDef, { position=new THREE.Vector3(), yaw=0, targetWidth=2.5 } = {}){
  const root = SkeletonUtils.clone(modelDef.template);
  const baseXZ = Math.max(modelDef.baseSize.x, modelDef.baseSize.z);
  const baseScale = baseXZ>1e-4 ? (targetWidth/baseXZ) : 1;
  const sXZ = baseScale * PLATFORM_SIZE_MULT;
  const sY  = KEEP_Y_SCALE ? baseScale : sXZ;
  root.scale.set(sXZ, sY, sXZ);
  root.updateMatrixWorld(true);

  const tmp = computeBBox(root);
  const group = new THREE.Group();
  root.position.y -= tmp.box.min.y;
  group.rotation.y = yaw; group.position.copy(position);
  group.add(root); scene.add(group);

  root.traverse(o=>{ if(o.isMesh) bakeMeshToCollision(o); });

  const helper = new THREE.Box3Helper(new THREE.Box3().setFromObject(root), DEBUG_COLORS.bbox);
  helper.visible = DEBUG.ENABLED && DEBUG.SHOW_STATIC;
  debugStatic.add(helper);

  return { group, size: tmp.size.clone() };
}
function makeBoxPlatform(w=4, h=0.3, d=2, pos=new THREE.Vector3(), yaw=0){
  const W = w * PLATFORM_SIZE_MULT, D = d * PLATFORM_SIZE_MULT, H = KEEP_Y_SCALE ? h : h * PLATFORM_SIZE_MULT;
  const group=new THREE.Group(); group.position.copy(pos); group.rotation.y=yaw;
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(W,H,D), new THREE.MeshStandardMaterial({ color:0xCFE6FF, roughness:0.9, metalness:0.05 }));
  mesh.castShadow=mesh.receiveShadow=true; mesh.position.y=H*0.5; group.add(mesh); scene.add(group);
  bakeMeshToCollision(mesh);

  const helper = new THREE.Box3Helper(new THREE.Box3().setFromObject(mesh), DEBUG_COLORS.bbox);
  helper.visible = DEBUG.ENABLED && DEBUG.SHOW_STATIC;
  debugStatic.add(helper);

  return { group, size:new THREE.Vector3(W,H,D) };
}


// ============================= Collision World ============================
function buildWorldCollision(){
  if(!_collisionGeoms.length) return console.warn("Keine Kollisionsgeometrie gesammelt!");
  const merged = mergeGeometries(_collisionGeoms, false);
  merged.computeBoundsTree();
  if(worldCollisionMesh){
    scene.remove(worldCollisionMesh);
    worldCollisionMesh.geometry?.dispose?.();
  }
  worldCollisionMesh = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ visible:false }));
  scene.add(worldCollisionMesh);

  if(DEBUG.SHOW_BVH){
    worldBVHHelper && scene.remove(worldBVHHelper);
    worldBVHHelper = new MeshBVHHelper(worldCollisionMesh, 12);
    worldBVHHelper.visible = DEBUG.ENABLED && DEBUG.SHOW_STATIC;
    scene.add(worldBVHHelper);
  }
}


// ============================= Snap/Collision ==============================
function raycastDownToSurface(origin, maxDist=60){
  if(!worldCollisionMesh) return null;
  const ray = new THREE.Raycaster(
    origin.clone().add(new THREE.Vector3(0,5,0)),
    new THREE.Vector3(0,-1,0),
    0,
    maxDist + 5
  );
  const hits = ray.intersectObject(worldCollisionMesh, true);
  for(const h of hits){
    if (!h.face) continue;
    const n = h.face.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(h.object.matrixWorld)).normalize();
    if (n.y > 0.2) return { point: h.point.clone(), normal: n };
  }
  return null;
}
function alignCheckpointsToSurface(){
  for(const cp of checkpoints){
    const hit = raycastDownToSurface(cp.pos, 80);
    if(hit){
      cp.pos.set(hit.point.x, hit.point.y + (SETTINGS.playerHeight * 0.5) + Math.max(0.02, SKIN_WIDTH), hit.point.z);
    } else {
      cp.pos.y = Math.max(cp.pos.y, (SETTINGS.playerHeight*0.5) + 0.05);
    }
  }
}


// ============================= Math Helpers ================================
const _u = new THREE.Vector3(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
const _c1 = new THREE.Vector3(), _c2 = new THREE.Vector3();
function closestPointsSegmentSegment(p1,q1,p2,q2, out1, out2){
  _u.subVectors(q1, p1); _v.subVectors(q2, p2); _w.subVectors(p1, p2);
  const a=_u.dot(_u), b=_u.dot(_v), c=_v.dot(_v), d=_u.dot(_w), e=_v.dot(_w);
  const D = a*c - b*b, EPS = 1e-9;
  let sc, sN, sD = D, tc, tN, tD = D;

  if (D < EPS){ sN = 0; sD = 1; tN = e; tD = c; }
  else { sN = b*e - c*d; tN = a*e - b*d; if (sN < 0){ sN = 0; tN = e; tD = c; } else if (sN > sD){ sN = sD; tN = e + b; tD = c; } }

  if (tN < 0){ tN = 0; if (-d < 0) sc = 0; else if (-d > a) sc = 1; else sc = -d / a; }
  else if (tN > tD){ tN = tD; const tmp = (-d + b); if (tmp < 0) sc = 0; else if (tmp > a) sc = 1; else sc = tmp / a; }
  else sc = (Math.abs(sD) < EPS ? 0 : sN / sD);

  tc = (Math.abs(tD) < EPS ? 0 : tN / tD);
  out1.copy(_u).multiplyScalar(sc).add(p1);
  out2.copy(_v).multiplyScalar(tc).add(p2);
  return out1.distanceTo(out2);
}

const _tri = new THREE.Triangle();
const _nrm = new THREE.Vector3();
const _tmpP = new THREE.Vector3();
const _tmpQ = new THREE.Vector3();
const _pTri = new THREE.Vector3();
const _pSeg = new THREE.Vector3();

function segmentTriangleClosestPoints(segStart, segEnd, a, b, c, outTri, outSeg){
  _tri.set(a,b,c);
  _tri.getNormal(_nrm).normalize();

  const da = _nrm.dot(_tmpP.copy(segStart).sub(a));
  const db = _nrm.dot(_tmpQ.copy(segEnd).sub(a));
  const dir = _tmpQ.copy(segEnd).sub(segStart);

  let minDistSq = Infinity;

  if (da*db <= 0){
    const t = da / (da - db);
    const p = _tmpP.copy(segStart).addScaledVector(dir, clamp(t,0,1));
    if (_tri.containsPoint(p)){ outTri.copy(p); outSeg.copy(p); return 0.0; }
  }

  const qa = _tri.closestPointToPoint(segStart, _tmpQ);
  let dSq = segStart.distanceToSquared(qa);
  if (dSq < minDistSq){ minDistSq = dSq; outTri.copy(qa); outSeg.copy(segStart); }

  const qb = _tri.closestPointToPoint(segEnd, _tmpQ);
  dSq = segEnd.distanceToSquared(qb);
  if (dSq < minDistSq){ minDistSq = dSq; outTri.copy(qb); outSeg.copy(segEnd); }

  for (const [e1,e2] of [[a,b],[b,c],[c,a]]){
    dSq = closestPointsSegmentSegment(segStart, segEnd, e1, e2, _c1, _c2)**2;
    if (dSq < minDistSq){ minDistSq = dSq; outSeg.copy(_c1); outTri.copy(_c2); }
  }
  return Math.sqrt(minDistSq);
}


// ============================= Capsule vs World ============================
const _capsuleSphere = new THREE.Sphere();
const _capsuleCenter = new THREE.Vector3();
const _tempMatrix = new THREE.Matrix4();
const _tempNormal = new THREE.Vector3();

function collideCapsuleWithWorld(capsule, velocity){
  if(!worldCollisionMesh) return { collided:false, onGround:false };

  const geom = worldCollisionMesh.geometry;
  _tempMatrix.copy(worldCollisionMesh.matrixWorld);

  let collided = false, onGround = false;

  const segLen = capsule.start.distanceTo(capsule.end);
  _capsuleCenter.copy(capsule.start).add(capsule.end).multiplyScalar(0.5);
  _capsuleSphere.center.copy(_capsuleCenter);
  _capsuleSphere.radius = capsule.radius + 0.5*segLen + SKIN_WIDTH;

  const rEff = SETTINGS.playerRadius - SKIN_WIDTH;
  const bvh = geom.boundsTree;

  for(let iter=0; iter<MAX_RESOLVE_ITERS; iter++){
    const contacts = [];
    let any = false;

    bvh.shapecast({
      intersectsBounds: (box)=> box.intersectsSphere(_capsuleSphere),
      intersectsTriangle: (tri)=>{
        const a = new THREE.Vector3().copy(tri.a).applyMatrix4(_tempMatrix);
        const b = new THREE.Vector3().copy(tri.b).applyMatrix4(_tempMatrix);
        const c = new THREE.Vector3().copy(tri.c).applyMatrix4(_tempMatrix);

        const dist = segmentTriangleClosestPoints(capsule.start, capsule.end, a, b, c, _pTri, _pSeg);
        if (dist < rEff){
          _tempNormal.copy(new THREE.Triangle(a,b,c).getNormal(new THREE.Vector3())).normalize();

          const depth = (rEff - dist) + SKIN_WIDTH;
          const dir = _pSeg.clone().sub(_pTri);
          const len = Math.max(dir.length(), 1e-8);
          dir.divideScalar(len);

          capsule.start.addScaledVector(dir, depth);
          capsule.end.addScaledVector(dir, depth);

          _capsuleCenter.copy(capsule.start).add(capsule.end).multiplyScalar(0.5);
          _capsuleSphere.center.copy(_capsuleCenter);

          contacts.push(_tempNormal.clone());
          if (_tempNormal.y > WALKABLE_NORMAL_Y) onGround = true;

          collided = true; any = true;
        }
        return false;
      }
    });

    for (const n of contacts){
      const vn = velocity.dot(n);
      if (vn < 0) velocity.addScaledVector(n, -vn);
    }

    if(!any) break;
  }
  return { collided, onGround };
}
function snapCapsuleToGround(capsule, maxDist=GROUND_SNAP_MAX){
  if(!worldCollisionMesh) return false;

  const center = new THREE.Vector3().addVectors(capsule.start, capsule.end).multiplyScalar(0.5);
  const halfSeg = capsule.end.clone().sub(capsule.start).length() * 0.5;

  const rayOrigin = center.clone(); rayOrigin.y += Math.min(0.3, halfSeg);
  const ray = new THREE.Raycaster(rayOrigin, new THREE.Vector3(0,-1,0), 0, halfSeg + maxDist + capsule.radius + 0.05);
  const hits = ray.intersectObject(worldCollisionMesh, true);
  for (const h of hits){
    if (!h.face) continue;
    const n = h.face.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(h.object.matrixWorld)).normalize();
    if (n.y <= WALKABLE_NORMAL_Y) continue;

    const bottomY = capsule.start.y;
    const desiredBottomY = h.point.y + capsule.radius + SKIN_WIDTH;
    const deltaY = desiredBottomY - bottomY;
    if (deltaY >= -0.02 && deltaY <= (maxDist + 0.02)){
      capsule.start.y += deltaY;
      capsule.end.y   += deltaY;
      return true;
    }
    break;
  }
  return false;
}


// ============================= Player ======================================
class PlayerController{
  constructor(){
    this.group=new THREE.Group(); scene.add(this.group);
    this.velocity=new THREE.Vector3();
    this.radius=SETTINGS.playerRadius; this.height=SETTINGS.playerHeight;

    const start = new THREE.Vector3(0, this.radius, 0);
    const end   = new THREE.Vector3(0, this.height - this.radius, 0);
    this.capsule = new Capsule(start.clone(), end.clone(), this.radius);

    this.capsuleHelper = new THREE.Mesh(
      new THREE.CapsuleGeometry(this.radius, Math.max(0.01, this.height - 2*this.radius), 8, 16),
      new THREE.MeshBasicMaterial({ color: DEBUG_COLORS.capsule, wireframe:true, transparent:true, opacity:0.75 })
    );
    this.capsuleHelper.visible = DEBUG.ENABLED && DEBUG.SHOW_CAPSULE;
    debugStatic.add(this.capsuleHelper);

    this.heading=0;
    this.model=null; this.mixer=null;
    this.actions = {};
    this.anim = { idle:null, move:null, jumpStart:null, fall:null, land:null, current:null };
    this._justJumped=false;
    this.onGround=false; this.wasOnGround=false;
    this._landLock=0;

    this.maxAirJumps = SETTINGS.maxAirJumps;
    this.airJumpsLeft = this.maxAirJumps;

    // Coyote + Jump-Buffer
    this.coyote = 0;
    this.jumpBuf = 0;

    this._loadOrMakeCapsule();
  }

  queueJump(){ this.jumpBuf = SETTINGS.jumpBuffer; }

  _findClip(clips, names){
    const norm = s => s.toLowerCase().replace(/[\s_]+/g,"");
    for(const wantName of names){
      const want = norm(wantName);
      for(const c of (clips||[])){
        if(norm(c.name||"").includes(want)) return c;
      }
    }
    return null;
  }

  _setupAnimations(clips, root){
    if(!clips?.length) return;
    this.mixer = new THREE.AnimationMixer(root);

    const idleClip  = this._findClip(clips, ["idle","a_idle","idle01","idle_01","rest","stand"]);
    const walkClip  = this._findClip(clips, ["walk","move","locomotion"]);
    const runClip   = this._findClip(clips, ["run","jog"]);
    const jumpClip  = this._findClip(clips, ["jump_start","jumpstart","jump","takeoff"]);
    const fallClip  = this._findClip(clips, ["fall","falling","air","jump_loop","in_air"]);
    const landClip  = this._findClip(clips, ["land","landing","jump_end","jumpend"]);

    const A = this.actions;
    if(idleClip) A.idle = this.mixer.clipAction(idleClip).setLoop(THREE.LoopRepeat);
    if(walkClip) A.walk = this.mixer.clipAction(walkClip).setLoop(THREE.LoopRepeat);
    if(runClip)  A.run  = this.mixer.clipAction(runClip ).setLoop(THREE.LoopRepeat);
    if(jumpClip){ A.jump = this.mixer.clipAction(jumpClip); A.jump.setLoop(THREE.LoopOnce); A.jump.clampWhenFinished = true; }
    if(fallClip) A.fall = this.mixer.clipAction(fallClip).setLoop(THREE.LoopRepeat);
    if(landClip){ A.land = this.mixer.clipAction(landClip); A.land.setLoop(THREE.LoopOnce); A.land.clampWhenFinished = true; }

    this.anim.idle      = A.idle || A.walk || A.run;
    this.anim.move      = A.run  || A.walk || A.idle;
    this.anim.jumpStart = A.jump || null;
    this.anim.fall      = A.fall || A.jump || this.anim.move;
    this.anim.land      = A.land || null;

    this._playAction(this.anim.idle, 0.0);
  }

  _playAction(action, fade=0.2){
    if(!action || this.anim.current === action) return;
    action.reset().play();
    if(this.anim.current) this.anim.current.crossFadeTo(action, fade, false);
    this.anim.current = action;
  }

  _playOneShot(action, fade=0.12, onDone){
    if(!action){ onDone && onDone(); return; }
    action.reset().setLoop(THREE.LoopOnce); action.clampWhenFinished = true; action.play();
    if(this.anim.current && this.anim.current!==action) this.anim.current.crossFadeTo(action, fade, false);
    this.anim.current = action;

    const handler = (e)=>{ if(e.action===action){ this.mixer.removeEventListener("finished", handler); onDone && onDone(); } };
    this.mixer.addEventListener("finished", handler);
  }

  async _loadOrMakeCapsule(){
    setStatus("Lade Charakter…");
    const candidates = expandPathCandidates(ASSET_PATHS.character).concat([
      "assets/models/business-man.glb","assets/models/Business Man.glb","assets/models/Business%20Man.glb"
    ]);
    try{
      const { g } = await loadGLBWithFallback(candidates);
      const root = g.scene || g.scenes?.[0];
      root.traverse(o=>{
        if(!o.isMesh) return;
        o.castShadow=o.receiveShadow=true;
        if(o.material){
          o.material.side=THREE.FrontSide;
          if(o.material.transparent && o.material.opacity===0){ o.material.opacity=1; o.material.transparent=false; }
        }
      });

      root.updateMatrixWorld(true);
      const tmp = computeBBox(root);
      const s = (this.height*0.92) / Math.max(tmp.size.y, 0.01);
      root.scale.setScalar(s); root.updateMatrixWorld(true);
      const box2 = new THREE.Box3().setFromObject(root);
      const center = new THREE.Vector3(); box2.getCenter(center);
      root.position.sub(center);

      this.model=root; this.group.add(root);
      this._setupAnimations(g.animations||[], root);
      setStatus("Ready! Businessman geladen ✨");
    }catch(e){
      console.error("GLB Load Error (Character):", e);
      const body=new THREE.Mesh(
        new THREE.CapsuleGeometry(this.radius, Math.max(0.1,this.height-2*this.radius),8,16),
        new THREE.MeshStandardMaterial({ color:0x22d3ee, roughness:0.5, metalness:0.1 })
      );
      body.castShadow=body.receiveShadow=true;
      this.group.add(body);
      setStatus("Ready (Fallback-Char). Prüfe Pfad/Kompression!");
    }

    const cp = checkpoints[0]?.pos || new THREE.Vector3(0,1.4,0);
    this.teleportTo(cp);
  }

  teleportTo(pos){
    const half = this.height/2;
    const center = pos.clone();
    this.capsule.start.set(center.x, center.y - half + this.radius, center.z);
    this.capsule.end.set(center.x, center.y + half - this.radius, center.z);
    this.group.position.copy(center);
    this.capsuleHelper.position.copy(center);
    this.velocity.set(0,0,0);
    this.onGround=this.wasOnGround=false;
    this._landLock = 0;
    this.airJumpsLeft = this.maxAirJumps;
    this.coyote = 0;
    this.jumpBuf = 0;

    snapCapsuleToGround(this.capsule, 0.5);
    const center2 = new THREE.Vector3().addVectors(this.capsule.start, this.capsule.end).multiplyScalar(0.5);
    this.group.position.copy(center2);
    this.capsuleHelper.position.copy(center2);
  }

  get position(){ return this.group.position; }

update(dt, camYaw){
  // Eingabe → Bewegungswunsch (in Kamerarahmen)
  const f = (keys.has("w") || keys.has("arrowup"));
  const b = (keys.has("s") || keys.has("arrowdown"));
  const l = (keys.has("a") || keys.has("arrowleft"));
  const r = (keys.has("d") || keys.has("arrowright"));
  const sprint = keys.has("shift");

  const wish = new THREE.Vector3((r?1:0)-(l?1:0), 0, (b?1:0)-(f?1:0));
  if (wish.lengthSq()>0){
    wish.normalize().applyQuaternion(
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), camYaw)
    );
  }

  const speedTarget = SETTINGS.moveSpeed * (sprint?SETTINGS.sprintMult:1);
  const desiredX = wish.x * speedTarget, desiredZ = wish.z * speedTarget;
  const accel = this.onGround ? 22 : 10*SETTINGS.airControl;

  this.velocity.x = THREE.MathUtils.damp(this.velocity.x, desiredX, accel, dt);
  this.velocity.z = THREE.MathUtils.damp(this.velocity.z, desiredZ, accel, dt);

  // Schwerkraft
  this.velocity.y = Math.max(this.velocity.y - SETTINGS.gravity*dt, TERMINAL_FALL_SPEED);

  // Substeps für robuste Kollision
  const dispLen = this.velocity.length() * dt;
  const stepsBySpeed = Math.max(1, Math.ceil(dispLen / Math.max(0.001, MAX_DISP_PER_SUBSTEP)));
  const stepsByPen   = Math.max(1, Math.ceil(Math.abs(this.velocity.y)*dt / Math.max(SUBSTEP_PEN_TARGET, 0.075)));
  const steps = Math.max(stepsBySpeed, stepsByPen);
  const dtS = dt / steps;

  let onGroundAccum = false;
  for (let s=0; s<steps; s++){
    const delta = this.velocity.clone().multiplyScalar(dtS);
    this.capsule.start.add(delta);
    this.capsule.end.add(delta);
    const res = collideCapsuleWithWorld(this.capsule, this.velocity);
    onGroundAccum = onGroundAccum || res.onGround;
  }

  // Bodenstatus + Ground-Snap
  this.wasOnGround = this.onGround;
  this.onGround = onGroundAccum;

  if (!this.onGround && this.velocity.y <= 1.0){
    if (snapCapsuleToGround(this.capsule, GROUND_SNAP_MAX)){
      this.onGround = true;
      if (this.velocity.y < 0) this.velocity.y = 0;
    }
  }

  // Coyote-/Buffer-Timer
  this.coyote  = this.onGround ? SETTINGS.coyoteTime : Math.max(0, this.coyote - dt);
  this.jumpBuf = Math.max(0, this.jumpBuf - dt);

  // Sprung auslösen (inkl. spürbarem Double-Jump)
  if (this.jumpBuf > 0){
    if (this.onGround || this.coyote > 0){
      // Boden-/Coyote-Sprung
      this.velocity.y = SETTINGS.jumpSpeed;
      this._justJumped = true;
      this.airJumpsLeft = this.maxAirJumps;
      this.jumpBuf = 0; this.coyote = 0;
    } else if (this.airJumpsLeft > 0){
      // Double-Jump: immer additiver Kick
      const base  = SETTINGS.jumpSpeed * SETTINGS.doubleJumpMult; // Grundimpuls
      const carry = Math.max(this.velocity.y, 0) * 0.25;          // etwas Aufwärtsgeschw. mitnehmen
      // additiv + Mindestschub, reduziert „toter“ zweiter Sprung
      this.velocity.y = Math.max(this.velocity.y + base * 0.85, base + carry);

      this._justJumped = true;
      this.airJumpsLeft -= 1;
      this.jumpBuf = 0;
    }
  }

  // Position + Helper
  const center = new THREE.Vector3().addVectors(this.capsule.start, this.capsule.end).multiplyScalar(0.5);
  this.group.position.copy(center);
  this.capsuleHelper.position.copy(center);
  this.capsuleHelper.visible = DEBUG.ENABLED && DEBUG.SHOW_CAPSULE;

  // Blickrichtung weich zum Movement
  if (wish.lengthSq()>1e-4){
    const targetYaw = Math.atan2(wish.x, wish.z);
    this.heading = THREE.MathUtils.damp(this.heading, targetYaw, 12, dt);
  }
  this.group.rotation.y = this.heading;

  // Animationen
  if (this.mixer){
    const hSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.anim.move){
      const base = Math.max(0.01, SETTINGS.moveSpeed);
      this.anim.move.timeScale = THREE.MathUtils.clamp(hSpeed / base, 0.75, 1.5);
    }

    if (!this.wasOnGround && this.onGround){
      this.airJumpsLeft = this.maxAirJumps;
      this._landLock = 0.25;
      if (this.anim.land){
        this._playOneShot(this.anim.land, 0.08, ()=>{
          this._landLock = 0;
          if (hSpeed>0.5 && this.anim.move) this._playAction(this.anim.move, 0.12);
          else if (this.anim.idle) this._playAction(this.anim.idle, 0.12);
        });
      } else {
        if (hSpeed>0.5 && this.anim.move) this._playAction(this.anim.move, 0.12);
        else if (this.anim.idle) this._playAction(this.anim.idle, 0.12);
      }
    } else if (this.wasOnGround && !this.onGround){
      if (this._justJumped && this.anim.jumpStart){
        this._playOneShot(this.anim.jumpStart, 0.08, ()=>{
          if (!this.onGround && this.anim.fall) this._playAction(this.anim.fall, 0.06);
        });
      } else if (this.anim.fall){
        this._playAction(this.anim.fall, 0.06);
      }
    } else if (this.onGround && this._landLock<=0){
      if (hSpeed>0.6 && this.anim.move) this._playAction(this.anim.move, 0.12);
      else if (this.anim.idle) this._playAction(this.anim.idle, 0.15);
    }

    if (this._landLock>0) this._landLock = Math.max(0, this._landLock - dt);
    this.mixer.update(dt);
  }

  if (this.group.position.y < SETTINGS.fallY) this.respawn();
  this._justJumped = false;
}


  respawn(toIndex=activeCheckpointIndex){
    const i = clamp(toIndex, 0, checkpoints.length-1);
    const pos = checkpoints[i]?.pos || new THREE.Vector3(0,1.4,0);
    this.teleportTo(pos);
    setStatus(`Respawn bei Checkpoint ${i+1}/${checkpoints.length} erreicht`);
  }
}


// ============================= Camera & Input ==============================
let camYaw=0, camPitch=0.12, isDragging=false, lastX=0, lastY=0;

UI.canvas.addEventListener("mousedown", e => { isDragging=true; lastX=e.clientX; lastY=e.clientY; });
window.addEventListener("mouseup", () => { isDragging=false; });

window.addEventListener("mousemove", e => {
  if (!isDragging) return;
  const dx = e.clientX - lastX, dy = e.clientY - lastY; lastX = e.clientX; lastY = e.clientY;
  const base = 0.003 * (INPUT?.mouseSens ?? 1.0);
  camYaw   -= dx * base;
  camPitch -= dy * base;
  camPitch  = clamp(camPitch, -1.2, 1.2);
});

window.addEventListener("wheel", e => {
  SETTINGS.camDistance = clamp(SETTINGS.camDistance + Math.sign(e.deltaY)*0.6, 3.2, 10.5);
},{ passive:true });

window.addEventListener("keydown", e=>{
  const k=e.key.toLowerCase();
  keys.add(k);
  if(k===" "||k==="space") player?.queueJump();
  if(k==="r") player?.respawn();
  if(k==="f1"){ DEBUG.ENABLED     = !DEBUG.ENABLED; }
  if(k==="f2"){ DEBUG.SHOW_STATIC = !DEBUG.SHOW_STATIC; }
  if(k==="f3"){ DEBUG.SHOW_BVH    = !DEBUG.SHOW_BVH; worldBVHHelper && (worldBVHHelper.visible = DEBUG.ENABLED && DEBUG.SHOW_STATIC && DEBUG.SHOW_BVH); }
  if(k==="f4"){ DEBUG.SHOW_CAPSULE= !DEBUG.SHOW_CAPSULE; }
});
window.addEventListener("keyup", e=> keys.delete(e.key.toLowerCase()));

window.addEventListener("resize", ()=>{
  camera.aspect=window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});


// ============================= Boot / Start ================================
let gameStarted = false;

async function startGame(){
  if (gameStarted){ setScreen("game"); setPaused(false); return; }
  gameStarted = true;

  setupLoaders();
  setScreen("loading");
  setStatus("Initialisiere…");

  makeGround();
  setStatus("Lade Plattform-Assets…");

  const MODEL_PACK = await loadModelPack(MODEL_PACK_PATHS);
  await makeITWorld(MODEL_PACK);

  buildWorldCollision();
  alignCheckpointsToSurface();

  setStatus("Lade Charakter…");
  player = new PlayerController();

  setTimeout(()=> setScreen("game"), 150);
  runLoop();
}


// ============================= Loop / Update ===============================
const camTarget=new THREE.Vector3();

function updateCheckpoint(){
  if(!player) return;
  let closest=activeCheckpointIndex, best=Infinity;
  for(let i=0;i<checkpoints.length;i++){
    const d=checkpoints[i].pos.distanceToSquared(player.position);
    if(d<best){ best=d; closest=i; }
  }
  if(closest!==activeCheckpointIndex && Math.sqrt(best)<4.5){
    activeCheckpointIndex=closest;
    setStatus(`Checkpoint ${activeCheckpointIndex+1}/${checkpoints.length} erreicht`);
  }
}
function updateCamera(dt){
  if(!player) return;
  const sph=new THREE.Spherical(SETTINGS.camDistance, Math.PI/2 - camPitch, camYaw);
  const offset=new THREE.Vector3().setFromSpherical(sph);
  const desired=player.position.clone().add(new THREE.Vector3(0,SETTINGS.camHeight,0)).add(offset);
  camera.position.lerp(desired, 1 - Math.pow(1-SETTINGS.camLag, dt*60));
  camTarget.copy(player.position).add(new THREE.Vector3(0,1.2,0));
  camera.lookAt(camTarget);
}
let tAccum=0;
const updateLighting = (dt) => { tAccum += dt*0.1; sun.position.set(Math.cos(tAccum)*10, 10+Math.sin(tAccum)*2, 8); };

function runLoop(){
  renderer.setAnimationLoop(()=>{
    const dt=Math.min(0.033, clock.getDelta());

    if (!isPaused && player){
      player.update(dt, camYaw);
      updateCheckpoint();
      updateLighting(dt);
    }
    updateCamera(dt);

    debugStatic.visible = DEBUG.ENABLED && DEBUG.SHOW_STATIC;
    if(worldBVHHelper) worldBVHHelper.visible = DEBUG.ENABLED && DEBUG.SHOW_STATIC && DEBUG.SHOW_BVH;
    if(player && player.capsuleHelper) player.capsuleHelper.visible = DEBUG.ENABLED && DEBUG.SHOW_CAPSULE;

    renderer.render(scene, camera);
  });
}
