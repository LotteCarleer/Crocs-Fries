// Clogs & Fries — fast-food x clog-store environment with a central model pedestal.
// The model on the pedestal is src/model.glb (imported below, loaded at the bottom).

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createCustomizer } from './customizer.js';
import modelUrl from './model.glb?url'; // model.glb must sit next to this file in src/

// ---------------------------------------------------------------- config
const ROOM = { w: 24, d: 20, h: 6 };
const COLORS = {
  red: 0xda291c,
  darkRed: 0x8f1a12,
  yellow: 0xffc72c,
  cream: 0xfff4dc,
  wood: 0x8a5a3b,
  steel: 0xb8bcc2,
  dark: 0x1e1414,
};
const CLOG_COLORS = [0x2ecc40, 0xff4fa3, 0x2f80ed, 0xffc72c, 0xff7a00, 0x9b51e0, 0x00c2c7, 0xda291c, 0xffffff, 0x222222];
const MODEL_TARGET_SIZE = 2.4;   // largest dimension of loaded models, in meters
const PEDESTAL_TOP_Y = 1.0;
const TURNTABLE_SPEED = 0.35;    // rad/s

// ---------------------------------------------------------------- renderer / scene
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a0a0a);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.05, 100);
camera.position.set(0, 2.6, 7.5);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, PEDESTAL_TOP_Y + 1, 0);
controls.enableDamping = true;
controls.minDistance = 2.5;
controls.maxDistance = 9;
controls.maxPolarAngle = Math.PI * 0.49;
controls.update();

// ---------------------------------------------------------------- helpers
const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...opts });

function add(mesh, { x = 0, y = 0, z = 0, cast = true, receive = true, parent = scene } = {}) {
  mesh.position.set(x, y, z);
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  parent.add(mesh);
  return mesh;
}

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

// ---------------------------------------------------------------- room shell
function buildRoom() {
  // Checkerboard floor
  const floorTex = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#fff4dc'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#c8241a';
    g.fillRect(0, 0, w / 2, h / 2); g.fillRect(w / 2, h / 2, w / 2, h / 2);
  });
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(ROOM.w / 1.2, ROOM.d / 1.2);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM.w, ROOM.d),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.35, metalness: 0.05 })
  );
  floor.rotation.x = -Math.PI / 2;
  add(floor, { cast: false });

  // Walls: red lower half, yellow band, cream upper
  const wallTex = canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#fff4dc'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#da291c'; g.fillRect(0, h * 0.55, w, h * 0.45);
    g.fillStyle = '#ffc72c'; g.fillRect(0, h * 0.5, w, h * 0.05);
    // subtle wave pattern on the red
    g.strokeStyle = 'rgba(255,199,44,0.25)'; g.lineWidth = 6;
    for (let y = h * 0.65; y < h; y += 40) {
      g.beginPath();
      for (let x = 0; x <= w; x += 8) g.lineTo(x, y + Math.sin(x / 30) * 8);
      g.stroke();
    }
  });
  wallTex.wrapS = THREE.RepeatWrapping;
  const wallMat = (len) => {
    const t = wallTex.clone(); t.needsUpdate = true;
    t.repeat.set(len / 6, 1);
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 });
  };
  const walls = [
    { len: ROOM.w, pos: [0, ROOM.h / 2, -ROOM.d / 2], rot: 0 },
    { len: ROOM.w, pos: [0, ROOM.h / 2, ROOM.d / 2], rot: Math.PI },
    { len: ROOM.d, pos: [-ROOM.w / 2, ROOM.h / 2, 0], rot: Math.PI / 2 },
    { len: ROOM.d, pos: [ROOM.w / 2, ROOM.h / 2, 0], rot: -Math.PI / 2 },
  ];
  for (const w of walls) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w.len, ROOM.h), wallMat(w.len));
    m.position.set(...w.pos);
    m.rotation.y = w.rot;
    m.receiveShadow = true;
    scene.add(m);
  }

  // Ceiling + glowing light panels
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.w, ROOM.d), mat(0xf2e6cc, { roughness: 0.9 }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = ROOM.h;
  scene.add(ceiling);
  const panelMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff1d0, emissiveIntensity: 1.6 });
  const panelGeo = new THREE.BoxGeometry(2.4, 0.05, 0.6);
  for (let x = -8; x <= 8; x += 4) {
    for (let z = -6; z <= 6; z += 4) {
      if (Math.abs(x) < 1 && Math.abs(z) < 3) continue; // keep the centre for the spotlight ring
      add(new THREE.Mesh(panelGeo, panelMat), { x, y: ROOM.h - 0.03, z, cast: false, receive: false });
    }
  }

  // Baseboard trim
  const trimMat = mat(COLORS.yellow, { roughness: 0.4 });
  add(new THREE.Mesh(new THREE.BoxGeometry(ROOM.w, 0.15, 0.05), trimMat), { y: 0.075, z: -ROOM.d / 2 + 0.03 });
  add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.15, ROOM.d), trimMat), { x: -ROOM.w / 2 + 0.03, y: 0.075 });
  add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.15, ROOM.d), trimMat), { x: ROOM.w / 2 - 0.03, y: 0.075 });
}

// ---------------------------------------------------------------- clog (procedural, generic)
const holeGeo = new THREE.CircleGeometry(0.009, 12);
const holeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });

function createClog(color) {
  const g = new THREE.Group();
  const c = new THREE.Color(color);
  const upperMat = mat(c, { roughness: 0.45 });
  const soleMat = mat(c.clone().multiplyScalar(0.75), { roughness: 0.7 });

  // Sole
  const sole = new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.035, 0.3, 3, 0.015), soleMat);
  sole.position.y = 0.0175;
  g.add(sole);

  // Toe box: half ellipsoid
  const scale = new THREE.Vector3(0.125, 0.19, 0.38);
  const upperPos = new THREE.Vector3(0, 0.03, 0.04);
  const upper = new THREE.Mesh(new THREE.SphereGeometry(0.5, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), upperMat);
  upper.scale.copy(scale);
  upper.position.copy(upperPos);
  g.add(upper);

  // Heel rim
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.012, 8, 20, Math.PI), upperMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.set(0, 0.045, -0.085);
  g.add(rim);

  // Heel strap with rivets
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.066, 0.009, 8, 24, Math.PI), upperMat);
  strap.rotation.x = -Math.PI / 2 + 0.35;
  strap.position.set(0, 0.06, -0.02);
  g.add(strap);
  for (const sx of [-1, 1]) {
    const rivet = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.008, 12), soleMat);
    rivet.rotation.z = Math.PI / 2;
    rivet.position.set(sx * 0.066, 0.06, -0.02);
    g.add(rivet);
  }

  // Ventilation holes on the toe box
  for (const phi of [0.55, 0.85, 1.15]) {
    const count = phi < 0.7 ? 3 : 5;
    for (let k = 0; k < count; k++) {
      const theta = Math.PI / 2 + (k - (count - 1) / 2) * 0.42;
      const p = new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta)).multiplyScalar(0.5);
      const pos = p.clone().multiply(scale).add(upperPos);
      const n = new THREE.Vector3(p.x / scale.x ** 2, p.y / scale.y ** 2, p.z / scale.z ** 2).normalize();
      const hole = new THREE.Mesh(holeGeo, holeMat);
      hole.position.copy(pos).addScaledVector(n, 0.0015);
      hole.lookAt(pos.clone().add(n));
      g.add(hole);
    }
  }

  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// ---------------------------------------------------------------- counter + menu boards (back wall)
function menuTexture(title, items, accent) {
  return canvasTexture(1024, 600, (g, w, h) => {
    g.fillStyle = '#1e1414'; g.fillRect(0, 0, w, h);
    g.fillStyle = accent; g.fillRect(0, 0, w, 110);
    g.fillStyle = '#1e1414'; g.font = 'bold 72px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(title, w / 2, 58);
    g.font = '600 48px system-ui, sans-serif';
    items.forEach(([name, price], i) => {
      const y = 175 + i * 95;
      g.textAlign = 'left'; g.fillStyle = '#fff4dc'; g.fillText(name, 50, y);
      g.textAlign = 'right'; g.fillStyle = '#ffc72c'; g.fillText(price, w - 50, y);
    });
  });
}

function buildCounter() {
  const z = -ROOM.d / 2 + 2.2;
  const group = new THREE.Group();
  scene.add(group);

  // Main counter body + top
  add(new THREE.Mesh(new RoundedBoxGeometry(12, 1.1, 1.0, 4, 0.08), mat(COLORS.red, { roughness: 0.4 })), { y: 0.55, z, parent: group });
  add(new THREE.Mesh(new RoundedBoxGeometry(12.3, 0.08, 1.2, 4, 0.03), mat(COLORS.steel, { metalness: 0.8, roughness: 0.25 })), { y: 1.14, z, parent: group });
  // Yellow stripe on the front
  add(new THREE.Mesh(new THREE.BoxGeometry(12, 0.12, 0.02), mat(COLORS.yellow, { roughness: 0.3 })), { y: 0.8, z: z + 0.51, parent: group });

  // Registers
  for (const x of [-4, -1.3, 1.3, 4]) {
    add(new THREE.Mesh(new RoundedBoxGeometry(0.45, 0.12, 0.35, 2, 0.02), mat(COLORS.dark)), { x, y: 1.24, z, parent: group });
    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.28, 0.03), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x3aa0ff, emissiveIntensity: 0.5 }));
    screen.rotation.x = -0.35;
    add(screen, { x, y: 1.48, z: z - 0.05, parent: group });
  }

  // Tray stack + fry boxes on the counter
  for (let i = 0; i < 5; i++) {
    add(new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.02, 0.36, 2, 0.008), mat(COLORS.red)), { x: 5.4, y: 1.19 + i * 0.022, z, parent: group });
  }
  for (const x of [-5.4, -5.0]) {
    const box = createFryBox(0.35);
    box.position.set(x, 1.18, z);
    group.add(box);
  }

  // Menu boards on the back wall
  const boards = [
    ['MEALS', [['Big Clog Burger', '6.95'], ['Double Sole Stack', '8.45'], ['Comfort Nuggets x9', '5.25'], ['Veggie Strap Wrap', '5.95'], ['Kids Clog Box', '4.50']], '#ffc72c'],
    ['CROCS & FRIES', [['Classic Clog', '49.99'], ['Platform Clog', '59.99'], ['Lined Winter Clog', '64.99'], ['Charm Pack x5', '14.99'], ['Any Clog + Fries', '+2.00']], '#da291c'],
    ['SIDES & SHAKES', [['Fry Charms', '2.95'], ['Golden Fries L', '3.45'], ['Sole Shake', '3.75'], ['Ventilation Pie', '1.95'], ['Soft Drink', '2.25']], '#ffc72c'],
  ];
  boards.forEach(([title, items, accent], i) => {
    const x = (i - 1) * 4.2;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(3.9, 2.3, 0.1), mat(COLORS.dark, { metalness: 0.5, roughness: 0.3 }));
    add(frame, { x, y: 3.7, z: -ROOM.d / 2 + 0.06, cast: false, parent: group });
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(3.75, 2.2),
      (() => { const tx = menuTexture(title, items, accent); return new THREE.MeshStandardMaterial({ map: tx, emissive: 0xffffff, emissiveMap: tx, emissiveIntensity: 0.9 }); })()
    );
    add(screen, { x, y: 3.7, z: -ROOM.d / 2 + 0.115, cast: false, receive: false, parent: group });
  });

  // Back wall kitchen glow strip
  add(new THREE.Mesh(new THREE.BoxGeometry(12, 0.06, 0.06), new THREE.MeshStandardMaterial({ color: 0xffc72c, emissive: 0xffc72c, emissiveIntensity: 2 })), { y: 2.45, z: -ROOM.d / 2 + 0.1, cast: false, parent: group });
}

// ---------------------------------------------------------------- big store sign (invented brand)
function buildSign() {
  const tex = canvasTexture(1024, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#ffc72c';
    g.font = '900 150px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = '#ff9900'; g.shadowBlur = 30;
    g.fillText('CROCS & FRIES', w / 2, h / 2 + 8);
  });
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 2),
    new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 1.4, transparent: true })
  );
  sign.position.set(0, 5.35, -ROOM.d / 2 + 0.12);
  scene.add(sign);
}

// ---------------------------------------------------------------- fry box (decor)
function createFryBox(size = 1) {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-0.35, 0); shape.lineTo(0.35, 0); shape.lineTo(0.45, 0.8);
  shape.quadraticCurveTo(0, 0.65, -0.45, 0.8); shape.lineTo(-0.35, 0);
  const box = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.35, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02 }), mat(COLORS.red, { roughness: 0.4 }));
  box.position.z = -0.175;
  g.add(box);
  const fryMat = mat(0xf7c548, { roughness: 0.7 });
  const fryGeo = new THREE.BoxGeometry(0.06, 0.6, 0.06);
  for (let i = 0; i < 22; i++) {
    const fry = new THREE.Mesh(fryGeo, fryMat);
    fry.position.set((Math.random() - 0.5) * 0.7, 0.65 + Math.random() * 0.25, (Math.random() - 0.5) * 0.25);
    fry.rotation.set((Math.random() - 0.5) * 0.3, Math.random(), (Math.random() - 0.5) * 0.4);
    g.add(fry);
  }
  g.scale.setScalar(size);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// ---------------------------------------------------------------- shoe wall (left)
function buildShoeWall() {
  const x = -ROOM.w / 2;
  const group = new THREE.Group();
  scene.add(group);

  // Backboard (yellow panel with pegboard dots)
  const pegTex = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#ffc72c'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(160,90,0,0.35)';
    for (let i = 16; i < w; i += 32) for (let j = 16; j < h; j += 32) { g.beginPath(); g.arc(i, j, 4, 0, Math.PI * 2); g.fill(); }
  });
  pegTex.wrapS = pegTex.wrapT = THREE.RepeatWrapping;
  pegTex.repeat.set(10, 4);
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.08, 3.6, 12), new THREE.MeshStandardMaterial({ map: pegTex, roughness: 0.7 }));
  add(board, { x: x + 0.05, y: 2.2, z: 0, cast: false, parent: group });

  const shelfMat = mat(0xffffff, { roughness: 0.3 });
  const shelfLightMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3d6, emissiveIntensity: 1.5 });
  const rows = 5;
  const perRow = 14;
  let ci = 0;
  for (let r = 0; r < rows; r++) {
    const y = 0.7 + r * 0.65;
    add(new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.04, 11.6), shelfMat), { x: x + 0.3, y, z: 0, parent: group });
    add(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.015, 11.4), shelfLightMat), { x: x + 0.5, y: y - 0.03, z: 0, cast: false, parent: group });
    for (let i = 0; i < perRow; i++) {
      const z = -5.4 + i * (10.8 / (perRow - 1));
      // display as a pair, angled toward the room
      for (const off of [-0.08, 0.08]) {
        const clog = createClog(CLOG_COLORS[ci % CLOG_COLORS.length]);
        clog.position.set(x + 0.3, y + 0.02, z + off);
        clog.rotation.y = Math.PI / 2 + 0.25 + (Math.random() - 0.5) * 0.1;
        group.add(clog);
      }
      ci++;
    }
  }
}

// ---------------------------------------------------------------- booths (right)
function buildBooths() {
  const x = ROOM.w / 2 - 1.3;
  const seatMat = mat(COLORS.red, { roughness: 0.35 });
  const tableMat = mat(COLORS.yellow, { roughness: 0.3 });
  const poleMat = mat(COLORS.steel, { metalness: 0.9, roughness: 0.2 });
  for (const z of [-5, -1.5, 2, 5.5]) {
    // table
    add(new THREE.Mesh(new RoundedBoxGeometry(1.4, 0.06, 0.9, 3, 0.03), tableMat), { x, y: 0.76, z });
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.74, 12), poleMat), { x, y: 0.38, z });
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 24), poleMat), { x, y: 0.015, z });
    // benches either side
    for (const s of [-1, 1]) {
      const bz = z + s * 0.95;
      add(new THREE.Mesh(new RoundedBoxGeometry(1.6, 0.45, 0.55, 3, 0.08), seatMat), { x, y: 0.225, z: bz });
      add(new THREE.Mesh(new RoundedBoxGeometry(1.6, 0.85, 0.15, 3, 0.06), seatMat), { x, y: 0.85, z: bz + s * 0.22 });
    }
    // a clog + fries on the table, why not
    const fries = createFryBox(0.25);
    fries.position.set(x - 0.3, 0.79, z);
    scene.add(fries);
    const clog = createClog(CLOG_COLORS[Math.floor(Math.random() * CLOG_COLORS.length)]);
    clog.position.set(x + 0.3, 0.79, z);
    clog.rotation.y = Math.random() * Math.PI;
    scene.add(clog);
    // pendant lamp
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 2.6, 6), poleMat), { x, y: ROOM.h - 1.3, z, cast: false });
    add(new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.3, 24, 1, true), mat(COLORS.yellow, { side: THREE.DoubleSide })), { x, y: ROOM.h - 2.65, z, cast: false });
    const bulb = new THREE.PointLight(0xffd8a0, 4, 4, 2);
    bulb.position.set(x, ROOM.h - 2.8, z);
    scene.add(bulb);
  }
}

// ---------------------------------------------------------------- decor: giant fry boxes, display cubes
function buildDecor() {
  for (const [x, z] of [[-7.2, -7.8], [7.2, -7.8]]) {
    const big = createFryBox(2.2);
    big.position.set(x, 0, z);
    scene.add(big);
  }
}

// ---------------------------------------------------------------- central pedestal + model slot
const turntable = new THREE.Group();   // rotates
const modelSlot = new THREE.Group();   // put your model in here
let ledRing;

function buildPedestal() {
  const base = new THREE.Group();
  scene.add(base);

  // Stepped base: red ring, yellow drum, chrome lip
  add(new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.4, 0.12, 64), mat(COLORS.darkRed, { roughness: 0.4 })), { y: 0.06, parent: base });
  add(new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.8, PEDESTAL_TOP_Y - 0.2, 64), mat(COLORS.yellow, { roughness: 0.35 })), { y: 0.12 + (PEDESTAL_TOP_Y - 0.2) / 2, parent: base });
  add(new THREE.Mesh(new THREE.CylinderGeometry(1.78, 1.78, 0.06, 64), mat(COLORS.steel, { metalness: 1, roughness: 0.2 })), { y: PEDESTAL_TOP_Y - 0.1, parent: base });

  // Glowing LED ring
  ledRing = new THREE.Mesh(
    new THREE.TorusGeometry(1.76, 0.025, 12, 128),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: COLORS.yellow, emissiveIntensity: 3 })
  );
  ledRing.rotation.x = Math.PI / 2;
  ledRing.position.y = 0.3;
  base.add(ledRing);

  // Turntable top (rotates with the model)
  turntable.position.y = PEDESTAL_TOP_Y - 0.07;
  scene.add(turntable);
  const topTex = canvasTexture(512, 512, (g, w, h) => {
    const n = 16;
    for (let i = 0; i < n; i++) {
      g.fillStyle = i % 2 ? '#da291c' : '#fff4dc';
      g.beginPath(); g.moveTo(w / 2, h / 2);
      g.arc(w / 2, h / 2, w / 2, (i / n) * Math.PI * 2, ((i + 1) / n) * Math.PI * 2);
      g.fill();
    }
  });
  const top = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.08, 64), [
    mat(COLORS.red), new THREE.MeshStandardMaterial({ map: topTex, roughness: 0.3 }), mat(COLORS.red),
  ]);
  add(top, { y: 0.04, cast: false, parent: turntable });

  modelSlot.position.y = 0.08;
  turntable.add(modelSlot);


  // Spotlights on the pedestal
  const spot = new THREE.SpotLight(0xfff2dd, 60, 14, Math.PI / 7, 0.45, 1.5);
  spot.position.set(0, ROOM.h - 0.1, 1.5);
  spot.target.position.set(0, PEDESTAL_TOP_Y, 0);
  spot.castShadow = true;
  spot.shadow.mapSize.set(2048, 2048);
  spot.shadow.bias = -0.0002;
  scene.add(spot, spot.target);
  const rim = new THREE.SpotLight(0xff6a3d, 25, 14, Math.PI / 8, 0.6, 1.5);
  rim.position.set(-3, ROOM.h - 0.5, -4);
  rim.target.position.set(0, PEDESTAL_TOP_Y + 1, 0);
  scene.add(rim, rim.target);

  // Ceiling ring fixture above the pedestal
  const fixture = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.06, 12, 96), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff1d0, emissiveIntensity: 2 }));
  fixture.rotation.x = Math.PI / 2;
  fixture.position.y = ROOM.h - 0.15;
  scene.add(fixture);
}

// ---------------------------------------------------------------- general lighting
function buildLights() {
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x5a2020, 0.9));
  const sun = new THREE.DirectionalLight(0xfff0dd, 1.2);
  sun.position.set(4, ROOM.h - 0.5, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 11, bottom: -11, near: 0.5, far: 30 });
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  const counterGlow = new THREE.PointLight(0xffc72c, 8, 10, 2);
  counterGlow.position.set(0, 3, -ROOM.d / 2 + 3);
  scene.add(counterGlow);
}

// ---------------------------------------------------------------- model loading
const loader = new GLTFLoader();
const customizer = createCustomizer();

function fitToSlot(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  object.scale.multiplyScalar(MODEL_TARGET_SIZE / maxDim);
  box.setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  object.position.x -= center.x;
  object.position.z -= center.z;
  object.position.y -= box.min.y; // sit on the turntable
}

function setModel(object) {
  modelSlot.clear();
  object.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  fitToSlot(object);
  modelSlot.add(object);
  customizer.attach(object); // texture/colour panel
  const h = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3()).y;
  controls.target.set(0, PEDESTAL_TOP_Y + h / 2, 0);
}

let mixer = null;
function handleGltf(gltf) {
  setModel(gltf.scene);
  mixer = null;
  if (gltf.animations?.length) {
    mixer = new THREE.AnimationMixer(gltf.scene);
    gltf.animations.forEach((clip) => mixer.clipAction(clip).play());
  }
}

export function loadModel(url) {
  return new Promise((resolve, reject) => {
    loader.load(url, (gltf) => { handleGltf(gltf); resolve(gltf); }, undefined, (err) => { console.error(err); reject(err); });
  });
}
window.loadModel = loadModel;
window.setModel = setModel; // pass any THREE.Object3D

// ---------------------------------------------------------------- build + loop
buildRoom();
buildLights();
buildCounter();
buildSign();
buildShoeWall();
buildBooths();
buildDecor();
buildPedestal();

// Model on the pedestal: src/model.glb
loadModel(modelUrl).catch((err) => {
  const msg = document.createElement('div');
  msg.textContent = 'Model kon niet laden: ' + (err?.message || err);
  Object.assign(msg.style, { position: 'fixed', top: '12px', left: '12px', padding: '8px 12px', background: '#da291c', color: '#fff', font: '14px system-ui', borderRadius: '8px', zIndex: 10 });
  document.body.appendChild(msg);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  const t = clock.elapsedTime;
  turntable.rotation.y += dt * TURNTABLE_SPEED;
  ledRing.material.emissiveIntensity = 2.2 + Math.sin(t * 2) * 0.8;
  if (mixer) mixer.update(dt);
  controls.update();
  renderer.render(scene, camera);
});

export { scene, camera, renderer, controls, modelSlot, turntable };