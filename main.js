import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';
import { PointerLockControls } from 'https://cdn.jsdelivr.net/npm/three@0.155.0/examples/jsm/controls/PointerLockControls.js';

// Szene, Kamera, Renderer
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x20242a);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 1.7, 5); // 1.7m "Augenhöhe"

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Licht
scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const light = new THREE.DirectionalLight(0xffffff, 0.8);
light.position.set(10, 20, 10);
scene.add(light);

// Boden
const groundGeo = new THREE.PlaneGeometry(50, 50);
const groundMat = new THREE.MeshPhongMaterial({ color: 0x669966 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Hindernisse
for (let i = 0; i < 10; i++) {
    const box = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshPhongMaterial({ color: 0x993333 })
    );
    box.position.set(
        (Math.random() - 0.5) * 30,
        0.5,
        (Math.random() - 0.5) * 30
    );
    scene.add(box);
}

// First Person Controls
const controls = new PointerLockControls(camera, renderer.domElement);

// Pointer Lock
const blocker = document.getElementById('blocker');
blocker.addEventListener('click', () => {
    controls.lock();
});
controls.addEventListener('lock', () => { blocker.style.display = 'none'; });
controls.addEventListener('unlock', () => { blocker.style.display = ''; });

// Bewegung
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
const speed = 5; // m/s

const keys = { w: false, a: false, s: false, d: false };
document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyW') keys.w = true;
    if (e.code === 'KeyA') keys.a = true;
    if (e.code === 'KeyS') keys.s = true;
    if (e.code === 'KeyD') keys.d = true;
});
document.addEventListener('keyup', (e) => {
    if (e.code === 'KeyW') keys.w = false;
    if (e.code === 'KeyA') keys.a = false;
    if (e.code === 'KeyS') keys.s = false;
    if (e.code === 'KeyD') keys.d = false;
});

// Animation Loop
let prevTime = performance.now();

function animate() {
    requestAnimationFrame(animate);

    if (controls.isLocked) {
        const time = performance.now();
        const delta = (time - prevTime) / 1000;

        direction.z = Number(keys.w) - Number(keys.s);
        direction.x = Number(keys.d) - Number(keys.a);
        direction.normalize();

        if (direction.length() > 0) {
            velocity.x = direction.x * speed * delta;
            velocity.z = direction.z * speed * delta;
            controls.moveRight(velocity.x);
            controls.moveForward(velocity.z);
        }

        prevTime = time;
    }

    renderer.render(scene, camera);
}
animate();

// Responsive
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});