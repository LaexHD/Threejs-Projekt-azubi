import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

let controls;
let armTarget = null;
let armModel = null;

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elemente
    const homescreen = document.getElementById('homescreen');
    const startGameBtn = document.getElementById('startGame');
    const blocker = document.getElementById('blocker');
    const pauseScreen = document.getElementById('pauseScreen');
    const resumeBtn = document.getElementById('resumeBtn');
    const toHomeBtn = document.getElementById('toHomeBtn');

    // THREE.js Setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x22262d);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 1000);
    camera.position.set(0, 1.7, 3);

    // WICHTIG: Near Plane klein halten!
    camera.near = 0.01;
    camera.updateProjectionMatrix();

    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // LICHT
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const light = new THREE.DirectionalLight(0xffffff, 0.9);
    light.position.set(5, 10, 7);
    scene.add(light);

    // RAUM (wie gehabt)
    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(10, 10),
        new THREE.MeshPhongMaterial({ color: 0x888888 })
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    const wallMat = new THREE.MeshPhongMaterial({ color: 0xf3f3f3 });
    const makeWall = (w, h, d, x, y, z, rx = 0, rz = 0) => {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
        wall.position.set(x, y, z);
        wall.rotation.x = rx;
        wall.rotation.z = rz;
        scene.add(wall);
    };
    makeWall(10, 3, 0.2, 0, 1.5, -5);
    makeWall(4, 3, 0.2, -3, 1.5, 5);
    makeWall(4, 3, 0.2, 3, 1.5, 5);
    makeWall(0.2, 3, 10, -5, 1.5, 0);
    makeWall(0.2, 3, 10, 5, 1.5, 0);

    // Tisch und Stuhl
    const desk = new THREE.Mesh(
        new THREE.BoxGeometry(1.8, 0.1, 0.8),
        new THREE.MeshPhongMaterial({ color: 0x996633 })
    );
    desk.position.set(0, 0.75, -2);
    scene.add(desk);
    for (const dx of [-0.8, 0.8]) {
        for (const dz of [-0.35, 0.35]) {
            const leg = new THREE.Mesh(
                new THREE.BoxGeometry(0.07, 0.7, 0.07),
                new THREE.MeshPhongMaterial({ color: 0x333333 })
            );
            leg.position.set(dx, 0.35, -2 + dz);
            scene.add(leg);
        }
    }
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

    // Controls
    controls = new PointerLockControls(camera, renderer.domElement);
    blocker.addEventListener('click', () => controls.lock());
    controls.addEventListener('lock', () => {
        blocker.style.display = 'none';
        if (pauseScreen) pauseScreen.style.display = 'none';
    });
    controls.addEventListener('unlock', () => {
        if (homescreen.style.display === 'none') {
            if (pauseScreen) pauseScreen.style.display = 'flex';
        } else {
            blocker.style.display = '';
        }
    });

    // Bewegung
    const velocity = new THREE.Vector3();
    const direction = new THREE.Vector3();
    const speed = 3.2;
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

    // ARM FOLGE-GROUP (NICHT an die Kamera hängen!)
    armTarget = new THREE.Group();
    scene.add(armTarget);

    // Debug-Box (auskommentieren für Justage)
    // const debugBox = new THREE.Mesh(
    //     new THREE.BoxGeometry(0.13, 0.13, 0.13),
    //     new THREE.MeshNormalMaterial()
    // );
    // armTarget.add(debugBox);

    // ARM LADEN
    const loader = new GLTFLoader();
loader.load(
    './RobotArm.glb',
    function (gltf) {
        armModel = gltf.scene.clone();
        armModel.scale.set(1.1, 1.1, 1.1);
        armModel.position.set(0, 0, 0);
        // Minecraft-Arm nach vorne:
        armModel.rotation.set(0.5, Math.PI / 20, 10);
        armTarget.add(armModel);
        armTarget.visible = true;
        window.armModel = armModel; // Für Debugging im Browser
    },
    undefined,
    function (error) {
        console.error('Fehler beim Laden der GLB:', error);
    }
);



    // Animation Loop
    let prevTime = performance.now();
    let walkTime = 0;

    function animate() {
        requestAnimationFrame(animate);

        if (controls && controls.isLocked) {
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
                walkTime += delta * 8;
            } else {
                walkTime = 0;
            }

            // ARM-Position relativ zur Kamera, immer im Sichtfeld!
            const camDir = new THREE.Vector3();
            camera.getWorldDirection(camDir);

            // Basis: Kamera-Position
            armTarget.position.copy(camera.position);

            // Minecraft-Style: leicht nach vorn, rechts/unten (diese Werte evtl. feintunen)
            armTarget.position.add(
                camDir.clone().multiplyScalar(0.43) // vor Spieler
            );
            // Rechts/unten
            const right = new THREE.Vector3();
            camera.getWorldDirection(camDir);
            right.crossVectors(camera.up, camDir).normalize();
            armTarget.position.add(right.multiplyScalar(-0.20)); // nach rechts (Spielersicht)
            armTarget.position.y -= 0.19;

            // Arm folgt Kopfbewegung:
            armTarget.quaternion.copy(camera.quaternion);

            // ARM SCHWINGEN LASSEN
            if (armModel) {
                const swing = moving ? Math.sin(walkTime) * 0.27 : 0;
                armModel.rotation.x = Math.PI / 2 + swing * 0.38;
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

    // Homescreen-Logik
    startGameBtn.addEventListener('click', () => {
        homescreen.style.opacity = '0';
        setTimeout(() => {
            homescreen.style.display = 'none';
            controls.lock();
        }, 400);
    });

    // Pause/Resume
    if (resumeBtn) resumeBtn.addEventListener('click', () => controls.lock());
    if (toHomeBtn) {
        toHomeBtn.addEventListener('click', () => {
            if (pauseScreen) pauseScreen.style.display = 'none';
            homescreen.style.display = '';
            setTimeout(() => { homescreen.style.opacity = '1'; }, 10);
        });
    }
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Escape') {
            if (!controls.isLocked && pauseScreen && pauseScreen.style.display === 'flex') {
                pauseScreen.style.display = 'none';
                controls.lock();
            }
        }
    });
});
