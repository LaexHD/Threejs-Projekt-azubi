import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';
import { PointerLockControls } from 'https://cdn.jsdelivr.net/npm/three@0.155.0/examples/jsm/controls/PointerLockControls.js';





// Szene, Kamera, Renderer
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x22262d);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 1.7, 3); // 1.7m Augenhöhe

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Licht
scene.add(new THREE.AmbientLight(0xffffff, 0.4));
const light = new THREE.DirectionalLight(0xffffff, 0.9);
light.position.set(5, 10, 7);
scene.add(light);

// Büro-Boden
const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 10),
    new THREE.MeshPhongMaterial({ color: 0x888888 })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// Büro-Wände
const wallMat = new THREE.MeshPhongMaterial({ color: 0xf3f3f3 });
const makeWall = (w, h, d, x, y, z, rx = 0, rz = 0) => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    wall.position.set(x, y, z);
    wall.rotation.x = rx;
    wall.rotation.z = rz;
    scene.add(wall);
};
// Rückwand
makeWall(10, 3, 0.2, 0, 1.5, -5);
// Vorderwand mit „Tür“ (zwei Teile)
makeWall(4, 3, 0.2, -3, 1.5, 5); // links
makeWall(4, 3, 0.2, 3, 1.5, 5); // rechts
// Seitenwände
makeWall(0.2, 3, 10, -5, 1.5, 0);
makeWall(0.2, 3, 10, 5, 1.5, 0);

// Tisch
const desk = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.1, 0.8),
    new THREE.MeshPhongMaterial({ color: 0x996633 })
);
desk.position.set(0, 0.75, -2);
scene.add(desk);
// Tischbeine
for (const dx of[-0.8, 0.8]) {
    for (const dz of[-0.35, 0.35]) {
        const leg = new THREE.Mesh(
            new THREE.BoxGeometry(0.07, 0.7, 0.07),
            new THREE.MeshPhongMaterial({ color: 0x333333 })
        );
        leg.position.set(dx, 0.35, -2 + dz);
        scene.add(leg);
    }
}

// Stuhl
const seat = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.3, 0.08, 32),
    new THREE.MeshPhongMaterial({ color: 0x444488 })
);
seat.position.set(-0.5, 0.45, -2);
scene.add(seat);
const back = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.3, 0.05),
    new THREE.MeshPhongMaterial({ color: 0x222244 })
);
back.position.set(-0.5, 0.62, -2.14);
scene.add(back);

// First Person Controls
const controls = new PointerLockControls(camera, renderer.domElement);

// Pointer Lock
const blocker = document.getElementById('blocker');
blocker.addEventListener('click', () => { controls.lock(); });
controls.addEventListener('lock', () => { blocker.style.display = 'none'; });
controls.addEventListener('unlock', () => { blocker.style.display = ''; });

// Bewegung
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
const speed = 3.2; // m/s, etwas langsamer im Büro
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

// Arme (als „First-Person“-Model)
const armGroup = new THREE.Group();

function createArm(side = 'left') {
    // Oberarm
    const upper = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.09, 0.3, 20),
        new THREE.MeshPhongMaterial({ color: 0xd2a77b })
    );
    upper.position.set(side === 'left' ? -0.16 : 0.16, -0.18, -0.32);
    upper.rotation.z = side === 'left' ? 0.5 : -0.5;

    // Unterarm
    const lower = new THREE.Mesh(
        new THREE.CylinderGeometry(0.065, 0.08, 0.27, 20),
        new THREE.MeshPhongMaterial({ color: 0xc79a72 })
    );
    lower.position.set(side === 'left' ? -0.25 : 0.25, -0.38, -0.37);
    lower.rotation.z = side === 'left' ? 0.5 : -0.5;

    // Hand
    const hand = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 12, 12),
        new THREE.MeshPhongMaterial({ color: 0xbb916b })
    );
    hand.position.set(side === 'left' ? -0.33 : 0.33, -0.52, -0.38);

    // Gruppe für einen Arm
    const arm = new THREE.Group();
    arm.add(upper);
    arm.add(lower);
    arm.add(hand);

    return arm;
}

const leftArm = createArm('left');
const rightArm = createArm('right');

armGroup.add(leftArm);
armGroup.add(rightArm);

// Die Arme immer relativ zur Kamera positionieren (quasi als „Waffe“ in Ego-Spielen)
camera.add(armGroup);
scene.add(camera);

// Animation Loop
let prevTime = performance.now();
let walkTime = 0;

function animate() {
    requestAnimationFrame(animate);

    if (controls.isLocked) {
        const time = performance.now();
        const delta = (time - prevTime) / 1000;

        direction.z = Number(keys.w) - Number(keys.s);
        direction.x = Number(keys.d) - Number(keys.a);
        direction.normalize();

        let moving = direction.length() > 0;
        if (moving) {
            velocity.x = direction.x * speed * delta;
            velocity.z = direction.z * speed * delta;
            controls.moveRight(velocity.x);
            controls.moveForward(velocity.z);
            walkTime += delta * 8; // Schrittfrequenz
        } else {
            walkTime = 0; // Reset bei Stillstand
        }

        // Arme wippen lassen, wenn man läuft
        const swing = moving ? Math.sin(walkTime) * 0.14 : 0;
        leftArm.position.y = -0.19 + swing;
        rightArm.position.y = -0.19 - swing;
        leftArm.rotation.x = swing * 0.4;
        rightArm.rotation.x = -swing * 0.4;

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