// Croc aanpassen: kies een textuur en een kleur voor het model op de sokkel.
// Gebruik in main.js:
//   import { createCustomizer } from './customizer.js';
//   const customizer = createCustomizer();
//   customizer.attach(model);   // nadat het model geladen is

import * as THREE from 'three';

// ---------------------------------------------------------------- patronen
// Elk patroon tekent op een canvas van 512x512 met de gekozen kleur.
// Vaste vlekken voor camo, zodat het patroon niet verspringt als je de kleur aanpast.
const camoSpots = Array.from({ length: 40 }, () => [Math.random() * 512, Math.random() * 512, 20 + Math.random() * 40, 15 + Math.random() * 30, Math.random() * Math.PI]);

const PATTERNS = {
  Camo(g, s, color) {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s);
    g.fillStyle = color;
    for (const [x, y, rx, ry, rot] of camoSpots) {
      g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); g.fill();
    }
  },
  Strepen(g, s, color) {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s);
    g.fillStyle = color;
    for (let y = 0; y < s; y += 64) g.fillRect(0, y, s, 32);
  },
  Stippen(g, s, color) {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s);
    g.fillStyle = color;
    for (let y = 32; y < s; y += 64) {
      for (let x = 32; x < s; x += 64) {
        g.beginPath(); g.arc(x, y, 14, 0, Math.PI * 2); g.fill();
      }
    }
  },
  Ruitjes(g, s, color) {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s);
    g.fillStyle = color;
    for (let y = 0; y < s; y += 64) {
      for (let x = 0; x < s; x += 64) {
        if ((x + y) % 128 === 0) g.fillRect(x, y, 64, 64);
      }
    }
  },
};

function makePatternTexture(name, color) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  PATTERNS[name](canvas.getContext('2d'), 512, color);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  tex.channel = 1; // gebruikt de 'uv1' coördinaten hieronder
  return tex;
}

// ---------------------------------------------------------------- UV's voor patronen
// De originele textuur van het model is een 'atlas' van losse stukjes.
// Daarom geven we het model extra UV's (uv1) die het patroon netjes rond de schoen leggen.
function addPatternUVs(mesh) {
  if (mesh.geometry.index) mesh.geometry = mesh.geometry.toNonIndexed();
  const geo = mesh.geometry;
  geo.computeBoundingBox();
  const min = geo.boundingBox.min;
  const size = geo.boundingBox.getSize(new THREE.Vector3());
  const unit = Math.max(size.x, size.y, size.z);
  const pos = geo.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();

  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    n.crossVectors(b.clone().sub(a), c.clone().sub(a)); // richting van de driehoek
    [a, b, c].forEach((p, k) => {
      let u, v;
      if (Math.abs(n.x) >= Math.abs(n.y) && Math.abs(n.x) >= Math.abs(n.z)) { u = p.z - min.z; v = p.y - min.y; }
      else if (Math.abs(n.y) >= Math.abs(n.z)) { u = p.x - min.x; v = p.z - min.z; }
      else { u = p.x - min.x; v = p.y - min.y; }
      uv[(i + k) * 2] = u / unit;
      uv[(i + k) * 2 + 1] = v / unit;
    });
  }
  geo.setAttribute('uv1', new THREE.BufferAttribute(uv, 2));
}

// ---------------------------------------------------------------- paneel
const CSS = `
#croc-panel { position: fixed; top: 16px; right: 16px; width: 220px; z-index: 10; padding: 14px 16px;
  background: rgba(30, 12, 10, 0.88); color: #fff4dc; border-radius: 14px; border-top: 5px solid #ffc72c;
  font: 13px system-ui, sans-serif; }
#croc-panel h2 { margin: 0 0 10px; font-size: 16px; color: #ffc72c; }
#croc-panel p { margin: 12px 0 6px; font-weight: 600; }
#croc-panel .buttons { display: flex; flex-wrap: wrap; gap: 6px; }
#croc-panel button { padding: 6px 10px; border: none; border-radius: 8px; cursor: pointer;
  background: #4a2a26; color: #fff; font-weight: 600; }
#croc-panel button.active { background: #da291c; }
#croc-panel input[type=color] { width: 100%; height: 32px; border: none; border-radius: 8px; cursor: pointer; }
`;

export function createCustomizer() {
  let meshes = [];
  let pattern = 'Origineel';
  let color = '#da291c';

  // Paneel bouwen
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);

  const panel = document.createElement('div');
  panel.id = 'croc-panel';
  panel.innerHTML = `
    <h2>Croc aanpassen</h2>
    <p>Textuur</p>
    <div class="buttons"></div>
    <div class="color-row">
      <p>Kleur</p>
      <input type="color" value="${color}" />
    </div>`;
  panel.style.display = 'none';
  document.body.append(panel);

  const buttonWrap = panel.querySelector('.buttons');
  const colorRow = panel.querySelector('.color-row');
  const colorInput = panel.querySelector('input[type=color]');

  for (const name of ['Origineel', ...Object.keys(PATTERNS)]) {
    const btn = document.createElement('button');
    btn.textContent = name;
    btn.addEventListener('click', () => { pattern = name; apply(); });
    buttonWrap.append(btn);
  }
  colorInput.addEventListener('input', () => { color = colorInput.value; apply(); });

  // Textuur toepassen op het model
  function apply() {
    const tex = pattern === 'Origineel' ? null : makePatternTexture(pattern, color);
    for (const m of meshes) {
      if (m.mesh.material.map && m.mesh.material.map !== m.originalMap) m.mesh.material.map.dispose();
      m.mesh.material.map = tex || m.originalMap;
      m.mesh.material.needsUpdate = true;
    }
    buttonWrap.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.textContent === pattern));
    colorRow.style.display = pattern === 'Origineel' ? 'none' : '';
  }

  // Model koppelen
  function attach(object) {
    meshes = [];
    object.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      addPatternUVs(o);
      meshes.push({ mesh: o, originalMap: o.material.map });
    });
    panel.style.display = '';
    apply();
  }

  return { attach };
}