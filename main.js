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

// BVH-Features auf three.js registrieren
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;


// ============================= UI / Screens ================================
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const body = document.body;

const canvas = $("#app");
const statusEl = $("#status");
const hud = $("#hud");

// Menu / Loading / Pause Controls
const btnStart   = $("#btn-start");
const btnOptions = $("#btn-options");
const btnCredits = $("#btn-credits");
const btnBack1   = $("#btn-back-1");
const btnBack2   = $("#btn-back-2");

const btnResume  = $("#btn-resume");
const btnRestart = $("#btn-restart");
const btnQuit    = $("#btn-quit");

const loadingBar  = $("#loading-bar");
const loadingText = $("#loading-text");

if (!body.hasAttribute("data-screen")) body.setAttribute("data-screen", "menu");

function setScreen(name){
  body.setAttribute("data-screen", name);
  if (name === "game") {
    canvas?.focus({ preventScroll: true });
  }
}
function openSubPanel(name){
  const sub = $("#menu-sub");
  sub.classList.remove("hidden");
  $$(".menu-sub .panel-content").forEach(p => p.classList.toggle("active", p.dataset.panel === name));
}
function closeSubPanel(){
  $("#menu-sub")?.classList.add("hidden");
}
function setStatus(t){ if (statusEl) statusEl.textContent = t; }
function setLoadingPercent(pct){
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  loadingBar?.style.setProperty("--pct", p);
  if (loadingText) loadingText.textContent = `Lade Assets… ${p}%`;
  const prog = $(".progress");
  if (prog) prog.setAttribute("aria-valuenow", String(p));
}

// Menü Interaktionen
btnStart?.addEventListener("click", async () => {
  await startGame(); // startet Laden + Welt + Loop
});
btnOptions?.addEventListener("click", () => openSubPanel("options"));
btnCredits?.addEventListener("click", () => openSubPanel("credits"));
btnBack1  ?.addEventListener("click", closeSubPanel);
btnBack2  ?.addEventListener("click", closeSubPanel);

// Pause-Interaktionen
btnResume ?.addEventListener("click", () => setPaused(false));
btnRestart?.addEventListener("click", () => { setPaused(false); player?.respawn(); });
btnQuit   ?.addEventListener("click", () => { setPaused(true); setScreen("menu"); });

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (body.getAttribute("data-screen") === "game") {
      setPaused(true); setScreen("paused");
    } else if (body.getAttribute("data-screen") === "paused") {
      setPaused(false); setScreen("game");
    }
  }
});


// ============================= Config / Debug ==============================
const DEBUG = {
  ENABLED: true,
  SHOW_STATIC: true,     // F2: Boden-/BBox-/BVH-Helpers
  SHOW_CAPSULE: false,   // F4: Spieler-Kapsel anzeigen
  SHOW_BVH: false        // F3: BVH-Helper (Performance!)
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
  maxAirJumps: 1, doubleJumpMult: 0.92
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
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
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
let loadingManager = null;
let gltfLoader = null;
let draco = null;
let ktx2  = null;

function setupLoaders(){
  loadingManager = new THREE.LoadingManager();

  loadingManager.onStart = () => { setScreen("loading"); setLoadingPercent(0); };
  loadingManager.onProgress = (_url, loaded, total) => {
    const pct = total ? (loaded/total)*100 : 10;
    setLoadingPercent(pct);
  };
  loadingManager.onLoad = () => {
    setLoadingPercent(100);
  };

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
function setPaused(v){ isPaused = v; }


// ============================= Utils =======================================
function inferModelCategory(nameLower){
  for (const [cat, words] of Object.entries(MODEL_CATEGORIES)) {
    if (!words.length) continue;
    for (const w of words) if (nameLower.indexOf(w) !== -1) return cat;
  }
  return "generic";
}
function computeBBox(obj){
  const box=new THREE.Box3().setFromObject(obj);
  const size=new THREE.Vector3(); box.getSize(size);
  const center=new THREE.Vector3(); box.getCenter(center);
  return {box,size,center};
}
function escapeLiteralPercents(p){ return p.replace(/%/g,"%25"); }
function expandPathCandidates(p){
  const v=[p,encodeURI(p),escapeLiteralPercents(p),encodeURI(escapeLiteralPercents(p))];
  const out=[]; for(const x of v){ out.push(x); if(x.indexOf("/")===-1) out.push("assets/models/"+x); }
  const seen=new Set(); const res=[]; for(const k of out){ if(!seen.has(k)){ seen.add(k); res.push(k); } }
  return res;
}
function loadGLBWithFallback(paths){
  return new Promise((res,rej)=>{
    const list=paths.slice();
    const nxt=()=>{ if(!list.length) return rej(new Error("Alle GLB-Pfade fehlgeschlagen"));
      const url=list.shift(); gltfLoader.load(url,g=>res({g,url}),undefined,nxt); };
    nxt();
  });
}
async function loadOneModel(path){
  const { g, url } = await loadGLBWithFallback(expandPathCandidates(path));
  const root = g.scene || (g.scenes && g.scenes[0]);
  root.traverse(o=>{
    if(o.isMesh){
      o.castShadow=true; o.receiveShadow=true;
      if(o.material){
        o.material.side=THREE.FrontSide;
        if(o.material.transparent && o.material.opacity===0){ o.material.opacity=1; o.material.transparent=false; }
      }
    }
  });
  const tmp = computeBBox(root);
  return { name:url.split("/").pop(), category:inferModelCategory(url.toLowerCase()), template:root, baseSize:tmp.size.clone(), animations:g.animations||[] };
}
async function loadModelPack(paths){
  const results=[];
  for(const p of paths){ try{ results.push(await loadOneModel(p)); }catch(e){ console.warn("Konnte Modell nicht laden:",p,e);} }
  const byCat={}; for(const k of Object.keys(MODEL_CATEGORIES)) byCat[k]=[];
  for(const m of results){ if(byCat[m.category]) byCat[m.category].push(m); }
  const all=results.slice(0);
  for(const k of Object.keys(MODEL_CATEGORIES)){ if(byCat[k].length===0) byCat[k]=byCat.generic.length?byCat.generic:all; }
  return { byCat, all };
}
function pickModel(pack, preferredCats){
  for(const c of preferredCats){ const arr=pack.byCat[c]; if(arr && arr.length) return arr[(Math.random()*arr.length)|0]; }
  const all=pack.all; return all[(Math.random()*all.length)|0];
}
function scaledSizeFor(modelDef, targetWidth){
  const baseXZ = Math.max(modelDef.baseSize.x, modelDef.baseSize.z);
  const s = baseXZ>1e-4 ? targetWidth/baseXZ : 1;
  return new THREE.Vector3(modelDef.baseSize.x*s, modelDef.baseSize.y*s, modelDef.baseSize.z*s);
}
function diagRadius(size){ return 0.5 * Math.hypot(size.x, size.z); }


// ============================= Collision Baking ============================
function bakeMeshToCollision(mesh){
  if(!mesh.geometry || !mesh.geometry.isBufferGeometry) return;
  let g = mesh.geometry.clone();
  if (g.index) g = g.toNonIndexed();
  mesh.updateWorldMatrix(true,false);
  g.applyMatrix4(mesh.matrixWorld);
  for(const n of Object.keys(g.attributes)){ if(n!=="position") g.deleteAttribute(n); }
  _collisionGeoms.push(g);
}


// ============================= Platforms/Ground ============================
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
  const W = w * PLATFORM_SIZE_MULT;
  const D = d * PLATFORM_SIZE_MULT;
  const H = KEEP_Y_SCALE ? h : h * PLATFORM_SIZE_MULT;

  const group=new THREE.Group(); group.position.copy(pos); group.rotation.y=yaw;
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(W,H,D), new THREE.MeshStandardMaterial({ color:0xCFE6FF, roughness:0.9, metalness:0.05 }));
  mesh.castShadow=true; mesh.receiveShadow=true; mesh.position.y=H*0.5; group.add(mesh); scene.add(group);
  bakeMeshToCollision(mesh);

  const helper = new THREE.Box3Helper(new THREE.Box3().setFromObject(mesh), DEBUG_COLORS.bbox);
  helper.visible = DEBUG.ENABLED && DEBUG.SHOW_STATIC;
  debugStatic.add(helper);

  return { group, size:new THREE.Vector3(W,H,D) };
}
function makeGround(){
  const groundVis = new THREE.Mesh(new THREE.PlaneGeometry(26,26), new THREE.MeshStandardMaterial({ color:0xEAF4FF, roughness:0.95, metalness:0.05 }));
  groundVis.rotation.x = -Math.PI/2; groundVis.receiveShadow = true; scene.add(groundVis);

  const groundCol = new THREE.Mesh(new THREE.BoxGeometry(28, 0.4, 28), new THREE.MeshBasicMaterial({ visible:false }));
  groundCol.position.y = -0.2; scene.add(groundCol);
  bakeMeshToCollision(groundCol);

  const eg = new THREE.EdgesGeometry(groundCol.geometry);
  const lines = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color:DEBUG_COLORS.groundEdge }));
  lines.matrixAutoUpdate=false; lines.applyMatrix4(groundCol.matrixWorld);
  lines.visible = DEBUG.ENABLED && DEBUG.SHOW_STATIC;
  debugStatic.add(lines);

  const deco = new THREE.Group(); deco.position.y = 0.001; scene.add(deco);
  for(let i=0;i<120;i++){
    const w=Math.random()*0.02+0.006, l=Math.random()*6+1.5;
    const line = new THREE.Mesh(new THREE.BoxGeometry(w,0.002,l), new THREE.MeshStandardMaterial({ color:0x007aff, emissive:0x5fbaff, emissiveIntensity:0.35, roughness:0.4, metalness:0.6 }));
    line.position.set((Math.random()-0.5)*24,0,(Math.random()-0.5)*24);
    line.rotation.y=Math.random()*Math.PI; line.receiveShadow=true; deco.add(line);
  }
}


// ============================= World Build =================================
function roughCheckpointAbove(res){
  const c = res.group.position.clone();
  c.y = res.group.position.y + res.size.y + SETTINGS.playerHeight * 0.6 + 0.2;
  return c;
}

async function makeITWorld(modelPack){
  function select(cats, scaleHint){
    const cat = cats[0] || "generic";
    const w = (TARGET_WIDTH_BY_CAT[cat] || TARGET_WIDTH_BY_CAT.generic) * (scaleHint||1);
    let mdl=null; try{ mdl = pickModel(modelPack, cats); }catch(e){}
    if(!mdl){
      const base = new THREE.Vector3(w, 0.3, Math.max(1.2, w*0.6));
      const size = new THREE.Vector3(
        base.x * PLATFORM_SIZE_MULT,
        KEEP_Y_SCALE ? base.y : base.y * PLATFORM_SIZE_MULT,
        base.z * PLATFORM_SIZE_MULT
      );
      return { model:null, size, targetW:w };
    }
    const est = scaledSizeFor(mdl, w);
    const size = new THREE.Vector3(
      est.x * PLATFORM_SIZE_MULT,
      KEEP_Y_SCALE ? est.y : est.y * PLATFORM_SIZE_MULT,
      est.z * PLATFORM_SIZE_MULT
    );
    return { model:mdl, size, targetW:w };
  }
  function place(sel, pos, yaw){
    if(sel.model) return placeModelPlatform(sel.model, { position:pos, yaw:yaw||0, targetWidth:sel.targetW });
    return makeBoxPlatform(sel.size.x/PLATFORM_SIZE_MULT, sel.size.y/(KEEP_Y_SCALE?1:PLATFORM_SIZE_MULT), sel.size.z/PLATFORM_SIZE_MULT, pos, yaw||0);
  }

  const startSel = select(["keyboard","desk","laptop","generic"], 1.25 * START_SIZE_MULT);
  const startRes = place(startSel, new THREE.Vector3(0,0.2,0), 0);
  checkpoints.push({ pos: roughCheckpointAbove(startRes) });

  const stepsTotal=50, easySteps=5;
  const riseEasy=0.9, riseNorm=1.3, gapEasy=0.9, gapNorm=1.15, turnPerStep=Math.PI/7;
  const catSeq = [
    ["keyboard","laptop","monitor"], ["server","computer","printer"], ["desk","chair","monitor"],
    ["laptop","keyboard","monitor"], ["computer","mouse","phone"], ["server","printer","computer"],
    ["chair","desk","headphones"]
  ];

  let angle=0, prevCenter=startRes.group.position.clone(), prevSize=startRes.size.clone();
  for(let i=0;i<stepsTotal;i++){
    angle += turnPerStep;
    const cats = catSeq[i % catSeq.length];
    const sel  = select(cats, 1.0);
    const gap  = i<easySteps?gapEasy:gapNorm;
    const rise = i<easySteps?riseEasy:riseNorm;

    const distCenters = diagRadius(prevSize) + diagRadius(sel.size) + gap;
    const dir = new THREE.Vector3(Math.cos(angle),0,Math.sin(angle));
    const nextCenter = prevCenter.clone().addScaledVector(dir, distCenters); nextCenter.y += rise;
    const yaw = angle + Math.PI;
    const res = place(sel, nextCenter, yaw);

    if(i % 7 === 6){
      const cp = roughCheckpointAbove(res);
      const beacon = new THREE.PointLight(0x66ccff, 1.2, 10);
      beacon.position.copy(cp).add(new THREE.Vector3(0, 0.2, 0));
      scene.add(beacon);
      checkpoints.push({ pos: cp });
    }
    prevCenter = nextCenter; prevSize = res.size.clone();
  }
}


// ============================= Collision World ============================
function buildWorldCollision(){
  if(!_collisionGeoms.length){
    console.warn("Keine Kollisionsgeometrie gesammelt!");
    return;
  }
  const merged = mergeGeometries(_collisionGeoms, false);
  merged.computeBoundsTree(); // BVH
  if(worldCollisionMesh){
    scene.remove(worldCollisionMesh);
    if(worldCollisionMesh.geometry && worldCollisionMesh.geometry.dispose) worldCollisionMesh.geometry.dispose();
  }
  worldCollisionMesh = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ visible:false }));
  scene.add(worldCollisionMesh);

  if(DEBUG.SHOW_BVH){
    if(worldBVHHelper) scene.remove(worldBVHHelper);
    worldBVHHelper = new MeshBVHHelper(worldCollisionMesh, 12);
    worldBVHHelper.visible = DEBUG.ENABLED && DEBUG.SHOW_STATIC;
    scene.add(worldBVHHelper);
  }
}


// ============================= Snap/Collision ==============================
function raycastDownToSurface(origin, maxDist=60){
  if(!worldCollisionMesh) return null;
  const ray = new THREE.Raycaster(
    new THREE.Vector3(origin.x, origin.y, origin.z).add(new THREE.Vector3(0, 5, 0)),
    new THREE.Vector3(0,-1,0),
    0,
    maxDist + 5
  );
  const hits = ray.intersectObject(worldCollisionMesh, true);
  if(!hits.length) return null;

  for(const h of hits){
    if (!h.face) continue;
    const nMat = new THREE.Matrix3().getNormalMatrix(h.object.matrixWorld);
    const n = h.face.normal.clone().applyMatrix3(nMat).normalize();
    if (n.y > 0.2) {
      return { point: h.point.clone(), normal: n };
    }
  }
  return null;
}
function alignCheckpointsToSurface(){
  for(const cp of checkpoints){
    const hit = raycastDownToSurface(cp.pos, 80);
    if(hit){
      cp.pos.x = hit.point.x;
      cp.pos.z = hit.point.z;
      cp.pos.y = hit.point.y + (SETTINGS.playerHeight * 0.5) + Math.max(0.02, SKIN_WIDTH);
    } else {
      cp.pos.y = Math.max(cp.pos.y, 0.0 + (SETTINGS.playerHeight*0.5) + 0.05);
    }
  }
}


// ============================= Math Helpers ================================
const _u = new THREE.Vector3(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
const _c1 = new THREE.Vector3(), _c2 = new THREE.Vector3();
function closestPointsSegmentSegment(p1,q1,p2,q2, out1, out2){
  _u.subVectors(q1, p1);
  _v.subVectors(q2, p2);
  _w.subVectors(p1, p2);

  const a = _u.dot(_u);
  const b = _u.dot(_v);
  const c = _v.dot(_v);
  const d = _u.dot(_w);
  const e = _v.dot(_w);

  const D = a*c - b*b;
  let sc, sN, sD = D;
  let tc, tN, tD = D;

  const EPS = 1e-9;

  if (D < EPS){
    sN = 0.0; sD = 1.0; tN = e; tD = c;
  } else {
    sN = (b*e - c*d);
    tN = (a*e - b*d);
    if (sN < 0){ sN = 0; tN = e; tD = c; }
    else if (sN > sD){ sN = sD; tN = e + b; tD = c; }
  }

  if (tN < 0){
    tN = 0;
    if (-d < 0) sc = 0;
    else if (-d > a) sc = 1;
    else { sc = -d / a; }
  } else if (tN > tD){
    tN = tD;
    const tmp = (-d + b);
    if (tmp < 0) sc = 0;
    else if (tmp > a) sc = 1;
    else { sc = tmp / a; }
  } else {
    sc = (Math.abs(sD) < EPS ? 0 : sN / sD);
  }
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
    const p = _tmpP.copy(segStart).addScaledVector(dir, THREE.MathUtils.clamp(t,0,1));
    if (_tri.containsPoint(p)){
      outTri.copy(p);
      outSeg.copy(p);
      return 0.0;
    }
  }

  const qa = _tri.closestPointToPoint(segStart, _tmpQ);
  let dSq = segStart.distanceToSquared(qa);
  if (dSq < minDistSq){ minDistSq = dSq; outTri.copy(qa); outSeg.copy(segStart); }

  const qb = _tri.closestPointToPoint(segEnd, _tmpQ);
  dSq = segEnd.distanceToSquared(qb);
  if (dSq < minDistSq){ minDistSq = dSq; outTri.copy(qb); outSeg.copy(segEnd); }

  let e1 = a, e2 = b;
  dSq = closestPointsSegmentSegment(segStart, segEnd, e1, e2, _c1, _c2)**2;
  if (dSq < minDistSq){ minDistSq = dSq; outSeg.copy(_c1); outTri.copy(_c2); }

  e1 = b; e2 = c;
  dSq = closestPointsSegmentSegment(segStart, segEnd, e1, e2, _c1, _c2)**2;
  if (dSq < minDistSq){ minDistSq = dSq; outSeg.copy(_c1); outTri.copy(_c2); }

  e1 = c; e2 = a;
  dSq = closestPointsSegmentSegment(segStart, segEnd, e1, e2, _c1, _c2)**2;
  if (dSq < minDistSq){ minDistSq = dSq; outSeg.copy(_c1); outTri.copy(_c2); }

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

  let collided = false;
  let onGround = false;

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

          collided = true;
          any = true;
        }
        return false;
      }
    });

    for (let i=0;i<contacts.length;i++){
      const n = contacts[i];
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
  const rayDir = new THREE.Vector3(0,-1,0);
  const ray = new THREE.Raycaster(rayOrigin, rayDir, 0, halfSeg + maxDist + capsule.radius + 0.05);

  const hits = ray.intersectObject(worldCollisionMesh, true);
  if(!hits.length) return false;

  for (let i=0;i<hits.length;i++){
    const h = hits[i];
    if (!h.face) continue;

    const nMat = new THREE.Matrix3().getNormalMatrix(h.object.matrixWorld);
    const n = h.face.normal.clone().applyMatrix3(nMat).normalize();

    if (n.y > WALKABLE_NORMAL_Y){
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
  }
  return false;
}


// ============================= Player ======================================
class PlayerController{
  constructor(){
    this.group=new THREE.Group(); scene.add(this.group);
    this.velocity=new THREE.Vector3(0,0,0);
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

    this._loadOrMakeCapsule();
  }

  _findClip(clips, names){
    const norm = s => s.toLowerCase().replace(/[\s_]+/g,"");
    for(const wantName of names){
      const want = norm(wantName);
      for(const c of (clips||[])){
        const have = norm(c.name||"");
        if(have.indexOf(want)!==-1) return c;
      }
    }
    return null;
  }

  _setupAnimations(gltfAnimations, root){
    if(!gltfAnimations || !gltfAnimations.length) return;

    this.mixer = new THREE.AnimationMixer(root);
    const idleClip  = this._findClip(gltfAnimations, ["idle","a_idle","idle01","idle_01","rest","stand"]);
    const walkClip  = this._findClip(gltfAnimations, ["walk","move","locomotion"]);
    const runClip   = this._findClip(gltfAnimations, ["run","jog"]);
    const jumpClip  = this._findClip(gltfAnimations, ["jump_start","jumpstart","jump","takeoff"]);
    const fallClip  = this._findClip(gltfAnimations, ["fall","falling","air","jump_loop","in_air"]);
    const landClip  = this._findClip(gltfAnimations, ["land","landing","jump_end","jumpend"]);

    if(idleClip){  this.actions.idle  = this.mixer.clipAction(idleClip);  this.actions.idle.setLoop(THREE.LoopRepeat); }
    if(walkClip){  this.actions.walk  = this.mixer.clipAction(walkClip);  this.actions.walk.setLoop(THREE.LoopRepeat); }
    if(runClip){   this.actions.run   = this.mixer.clipAction(runClip);   this.actions.run.setLoop(THREE.LoopRepeat); }
    if(jumpClip){  this.actions.jump  = this.mixer.clipAction(jumpClip);  this.actions.jump.setLoop(THREE.LoopOnce); this.actions.jump.clampWhenFinished = true; }
    if(fallClip){  this.actions.fall  = this.mixer.clipAction(fallClip);  this.actions.fall.setLoop(THREE.LoopRepeat); }
    if(landClip){  this.actions.land  = this.mixer.clipAction(landClip);  this.actions.land.setLoop(THREE.LoopOnce); this.actions.land.clampWhenFinished = true; }

    this.anim.idle      = this.actions.idle || this.actions.walk || this.actions.run;
    this.anim.move      = this.actions.run  || this.actions.walk || this.actions.idle;
    this.anim.jumpStart = this.actions.jump || null;
    this.anim.fall      = this.actions.fall || this.actions.jump || this.anim.move;
    this.anim.land      = this.actions.land || null;

    this._playAction(this.anim.idle, 0.0);
  }

  _playAction(action, fade=0.2){
    if(!action) return;
    if(this.anim.current === action) return;
    action.reset().play();
    if(this.anim.current){
      this.anim.current.crossFadeTo(action, fade, false);
    }
    this.anim.current = action;
  }

  _playOneShot(action, fade=0.12, onDone){
    if(!action){ onDone && onDone(); return; }
    action.reset();
    action.setLoop(THREE.LoopOnce);
    action.clampWhenFinished = true;
    action.play();
    if(this.anim.current && this.anim.current!==action){
      this.anim.current.crossFadeTo(action, fade, false);
    }
    this.anim.current = action;

    const handler = (e)=>{
      if(e.action===action){
        this.mixer.removeEventListener("finished", handler);
        onDone && onDone();
      }
    };
    this.mixer.addEventListener("finished", handler);
  }

  async _loadOrMakeCapsule(){
    setStatus("Lade Charakter…");
    const candidates = expandPathCandidates(ASSET_PATHS.character).concat([
      "assets/models/business-man.glb","assets/models/Business Man.glb","assets/models/Business%20Man.glb"
    ]);
    try{
      const { g } = await loadGLBWithFallback(candidates);
      const root = g.scene || (g.scenes && g.scenes[0]);
      root.traverse(o=>{
        if(o.isMesh){
          o.castShadow=true; o.receiveShadow=true;
          if(o.material){
            o.material.side=THREE.FrontSide;
            if(o.material.transparent && o.material.opacity===0){ o.material.opacity=1; o.material.transparent=false; }
          }
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
      body.castShadow=true; body.receiveShadow=true;
      this.group.add(body);
      setStatus("Ready (Fallback-Char). Prüfe Pfad/Kompression!");
    }

    const cp = checkpoints.length ? checkpoints[0].pos : new THREE.Vector3(0,1.4,0);
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
    this.onGround=false; this.wasOnGround=false;
    this._landLock = 0;
    this.airJumpsLeft = this.maxAirJumps;

    snapCapsuleToGround(this.capsule, 0.5);
    const center2 = new THREE.Vector3().addVectors(this.capsule.start, this.capsule.end).multiplyScalar(0.5);
    this.group.position.copy(center2);
    this.capsuleHelper.position.copy(center2);
  }

  get position(){ return this.group.position; }

  update(dt, camYaw){
    const forward  = (keys.has("w") || keys.has("arrowup"));
    const backward = (keys.has("s") || keys.has("arrowdown"));
    const left     = (keys.has("a") || keys.has("arrowleft"));
    const right    = (keys.has("d") || keys.has("arrowright"));
    const sprint   = keys.has("shift");

    let wish=new THREE.Vector3();
    if(forward)  wish.z -= 1;
    if(backward) wish.z += 1;
    if(left)     wish.x -= 1;
    if(right)    wish.x += 1;
    if(wish.lengthSq()>0) wish.normalize();
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), camYaw);
    wish.applyQuaternion(q);

    const speedTarget=SETTINGS.moveSpeed*(sprint?SETTINGS.sprintMult:1);
    const desired=new THREE.Vector3(wish.x*speedTarget, this.velocity.y, wish.z*speedTarget);

    const accel=this.onGround?22:10*SETTINGS.airControl;
    this.velocity.x=THREE.MathUtils.damp(this.velocity.x, desired.x, accel, dt);
    this.velocity.z=THREE.MathUtils.damp(this.velocity.z, desired.z, accel, dt);

    this.velocity.y -= SETTINGS.gravity*dt;
    if(this.velocity.y < TERMINAL_FALL_SPEED) this.velocity.y = TERMINAL_FALL_SPEED;

    if (_pendingJump) {
      if (this.onGround) {
        this.velocity.y = SETTINGS.jumpSpeed;
        this._justJumped = true;
        this.airJumpsLeft = this.maxAirJumps;
      } else if (this.airJumpsLeft > 0) {
        const keepUp = Math.max(this.velocity.y, 0);
        this.velocity.y = Math.max(keepUp, SETTINGS.jumpSpeed * SETTINGS.doubleJumpMult);
        this._justJumped = true;
        this.airJumpsLeft -= 1;
      }
    }
    _pendingJump = false;

    const dispLen = this.velocity.length() * dt;
    const stepsBySpeed = Math.max(1, Math.ceil(dispLen / Math.max(0.001, MAX_DISP_PER_SUBSTEP)));
    const absVy = Math.abs(this.velocity.y);
    const estPen = absVy*dt;
    const maxPenPerStep = Math.max(SUBSTEP_PEN_TARGET, 0.075);
    const stepsByPen = Math.max(1, Math.ceil(estPen / maxPenPerStep));
    const steps = Math.max(stepsBySpeed, stepsByPen);
    const dtS = dt / steps;

    let onGroundAccum = false;
    for(let s=0; s<steps; s++){
      const delta = this.velocity.clone().multiplyScalar(dtS);
      this.capsule.start.add(delta);
      this.capsule.end.add(delta);

      const res = collideCapsuleWithWorld(this.capsule, this.velocity);
      onGroundAccum = onGroundAccum || res.onGround;
    }

    this.wasOnGround = this.onGround;
    this.onGround = onGroundAccum;

    if (!this.onGround && this.velocity.y <= 1.0){
      if (snapCapsuleToGround(this.capsule, GROUND_SNAP_MAX)){
        this.onGround = true;
        if (this.velocity.y < 0) this.velocity.y = 0;
      }
    }

    const center = new THREE.Vector3().addVectors(this.capsule.start, this.capsule.end).multiplyScalar(0.5);
    this.group.position.copy(center);
    this.capsuleHelper.position.copy(center);
    this.capsuleHelper.visible = DEBUG.ENABLED && DEBUG.SHOW_CAPSULE;

    if(wish.lengthSq()>1e-4){
      const targetYaw=Math.atan2(wish.x,wish.z);
      this.heading=THREE.MathUtils.damp(this.heading,targetYaw,12,dt);
    }
    this.group.rotation.y=this.heading;

    if(this.mixer){
      const hSpeed = Math.hypot(this.velocity.x, this.velocity.z);
      if(this.anim.move){
        const base = SETTINGS.moveSpeed*1.0;
        this.anim.move.timeScale = THREE.MathUtils.clamp(hSpeed / Math.max(0.01, base), 0.75, 1.5);
      }

      if(!this.wasOnGround && this.onGround){
        this.airJumpsLeft = this.maxAirJumps;
        this._landLock = 0.25;
        if(this.anim.land){
          this._playOneShot(this.anim.land, 0.08, ()=>{
            this._landLock = 0;
            if(hSpeed>0.5 && this.anim.move) this._playAction(this.anim.move, 0.12);
            else if(this.anim.idle) this._playAction(this.anim.idle, 0.12);
          });
        } else {
          if(hSpeed>0.5 && this.anim.move) this._playAction(this.anim.move, 0.12);
          else if(this.anim.idle) this._playAction(this.anim.idle, 0.12);
        }
      } else if(this.wasOnGround && !this.onGround){
        if(this._justJumped && this.anim.jumpStart){
          this._playOneShot(this.anim.jumpStart, 0.08, ()=>{
            if(!this.onGround && this.anim.fall) this._playAction(this.anim.fall, 0.06);
          });
        } else {
          if(this.anim.fall) this._playAction(this.anim.fall, 0.06);
        }
      } else {
        if(this.onGround){
          if(this._landLock<=0){
            if(hSpeed>0.6 && this.anim.move) this._playAction(this.anim.move, 0.12);
            else if(this.anim.idle) this._playAction(this.anim.idle, 0.15);
          }
        } else {
          if(this.anim.fall) this._playAction(this.anim.fall, 0.06);
        }
      }

      if(this._landLock>0) this._landLock = Math.max(0, this._landLock - dt);
      this.mixer.update(dt);
    }

    this._justJumped = false;

    if(this.group.position.y < SETTINGS.fallY) this.respawn();
  }

  respawn(toIndex=activeCheckpointIndex){
    const i = Math.max(0, Math.min(checkpoints.length-1, toIndex));
    const pos = checkpoints[i] ? checkpoints[i].pos : new THREE.Vector3(0,1.4,0);
    this.teleportTo(pos);
    setStatus(`Respawn bei Checkpoint ${i+1}/${checkpoints.length} erreicht`);
  }
}


// ============================= Camera & Input ==============================
let camYaw=0, camPitch=0.12, isDragging=false, lastX=0, lastY=0;
canvas.addEventListener("mousedown",e=>{ isDragging=true; lastX=e.clientX; lastY=e.clientY; });
window.addEventListener("mouseup",()=>{ isDragging=false; });
window.addEventListener("mousemove",e=>{
  if(!isDragging) return;
  const dx=e.clientX-lastX, dy=e.clientY-lastY; lastX=e.clientX; lastY=e.clientY;
  camYaw-=dx*0.003; camPitch-=dy*0.003; camPitch=THREE.MathUtils.clamp(camPitch,-1.2,1.2);
});
window.addEventListener("wheel",e=>{
  SETTINGS.camDistance = THREE.MathUtils.clamp(SETTINGS.camDistance + Math.sign(e.deltaY)*0.6, 3.2, 10.5);
},{ passive:true });

let _pendingJump=false;
window.addEventListener("keydown",e=>{
  const k=e.key.toLowerCase(); keys.add(k);
  if(k===" "||k==="space") _pendingJump=true;
  if(k==="r") player?.respawn();

  if(k==="f1"){ DEBUG.ENABLED=!DEBUG.ENABLED; }
  if(k==="f2"){ DEBUG.SHOW_STATIC=!DEBUG.SHOW_STATIC; }
  if(k==="f3"){ DEBUG.SHOW_BVH=!DEBUG.SHOW_BVH; if(worldBVHHelper) worldBVHHelper.visible = DEBUG.ENABLED && DEBUG.SHOW_STATIC && DEBUG.SHOW_BVH; }
  if(k==="f4"){ DEBUG.SHOW_CAPSULE=!DEBUG.SHOW_CAPSULE; }
});
window.addEventListener("keyup",e=>{ keys.delete(e.key.toLowerCase()); });

window.addEventListener("resize",()=>{
  camera.aspect=window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});


// ============================= Boot / Start ================================
let gameStarted = false;

async function startGame(){
  if (gameStarted) { // doppelklick-schutz
    setScreen("game"); setPaused(false);
    return;
  }
  gameStarted = true;

  setupLoaders();              // LoadingManager + Loader
  setScreen("loading");
  setStatus("Initialisiere…");

  // Welt aufbauen (synchron + geladen)
  makeGround();
  setStatus("Lade Plattform-Assets…");

  const MODEL_PACK = await loadModelPack(MODEL_PACK_PATHS);
  await makeITWorld(MODEL_PACK);

  buildWorldCollision();
  alignCheckpointsToSurface();

  setStatus("Lade Charakter…");
  player = new PlayerController();

  // kleiner UI-Delay für Ladegefühl
  setTimeout(()=>{ setScreen("game"); }, 150);

  // Render-Loop starten
  runLoop();
}


// ============================= Loop / Update ===============================
const camTarget=new THREE.Vector3();
function updateCheckpoint(){
  if(!player) return;
  let closest=0, best=Infinity;
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
  camTarget.copy(player.position).add(new THREE.Vector3(0,1.2,0)); camera.lookAt(camTarget);
}
let tAccum=0;
function updateLighting(dt){ tAccum += dt*0.1; sun.position.set(Math.cos(tAccum)*10, 10+Math.sin(tAccum)*2, 8); }

function runLoop(){
  renderer.setAnimationLoop(()=>{
    const dt=Math.min(0.033, clock.getDelta());

    if (!isPaused && player){
      player.update(dt, camYaw);
      updateCheckpoint();
      updateCamera(dt);
      updateLighting(dt);
    } else {
      // auch pausiert die Kamera zumindest verfolgen
      updateCamera(dt);
    }

    debugStatic.visible = DEBUG.ENABLED && DEBUG.SHOW_STATIC;
    if(worldBVHHelper) worldBVHHelper.visible = DEBUG.ENABLED && DEBUG.SHOW_STATIC && DEBUG.SHOW_BVH;
    if(player && player.capsuleHelper) player.capsuleHelper.visible = DEBUG.ENABLED && DEBUG.SHOW_CAPSULE;

    renderer.render(scene, camera);
  });
}
