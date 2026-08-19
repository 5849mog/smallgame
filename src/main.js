import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SFX } from './audio.js';
import { CrowdRenderer, soldierParts, zombieParts } from './crowd.js';
import {
  ROAD_W, SQUAD_X_LIMIT, MAX_SOLDIER_RENDER, MAX_ZOMBIE_RENDER, MAX_BULLETS,
  MAX_SQUAD_RADIUS, BASE_SPACING, MAX_SHOOTERS, GATE_W, GATE_H, CHUNK_LEN,
  GATE_SPACING, PICKUP_SPACING, WAVE_SPACING, HORDE_FIRST_AT, HORDE_INTERVAL,
  KILL_XP_BASE, KILL_XP_POW,
  diffAt, WEAPONS, WEAPON_KEYS, ITEMS, RUN_UPGRADES,
} from './config.js';
import { ZOMBIE_TYPES, ZOMBIE_TYPE_KEYS } from './types.js';
import {
  META_UPGRADES, metaLevels, setMetaLevels, getCoins, addCoins, paidUnlocked,
  mockPurchase, getMetaSnapshot, levelCost,
} from './meta.js';

// ============================================================ 基础三件套
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1426);
scene.fog = new THREE.Fog(0x1a1426, 40, 95);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 300);

const hemi = new THREE.HemisphereLight(0x9fb4ff, 0x33241f, 0.85);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe0b3, 1.6);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -18; sun.shadow.camera.right = 18;
sun.shadow.camera.top = 25; sun.shadow.camera.bottom = -25;
sun.shadow.camera.far = 80;
scene.add(sun, sun.target);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ============================================================ 环境：按块无限生成
function makeRoadTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#3c3744'; g.fillRect(0, 0, 128, 256);
  g.fillStyle = '#454050';
  for (let i = 0; i < 40; i++) g.fillRect(Math.random() * 128, Math.random() * 256, 3, 3);
  g.strokeStyle = '#5a5464'; g.lineWidth = 5;
  g.setLineDash([26, 22]);
  g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 256); g.stroke();
  g.setLineDash([]);
  g.strokeStyle = '#6b6577'; g.lineWidth = 7;
  g.beginPath(); g.moveTo(4, 0); g.lineTo(4, 256); g.moveTo(124, 0); g.lineTo(124, 256); g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const roadTex = makeRoadTexture();
roadTex.repeat.set(1, CHUNK_LEN / 14);
const roadGeo = new THREE.PlaneGeometry(ROAD_W, CHUNK_LEN);
const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.95 });
const dirtGeo = new THREE.PlaneGeometry(140, CHUNK_LEN);
const dirtMat = new THREE.MeshStandardMaterial({ color: 0x241b22, roughness: 1 });
const bldGeo = new THREE.BoxGeometry(1, 1, 1);
const bldMats = [0x2c2838, 0x342c40, 0x262230, 0x3a3348].map(
  (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 })
);
const winMat = new THREE.MeshBasicMaterial({ color: 0xffb45e });
const propMat = new THREE.MeshStandardMaterial({ color: 0x6b4a35, roughness: 0.9 });
const barrelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.9, 10);
const barrelMat = new THREE.MeshStandardMaterial({ color: 0x9c3b2e, roughness: 0.7 });

let chunks = [];   // { z0, group }
let nextChunkZ = 60;

function spawnChunk(z0) {
  const group = new THREE.Group();

  const road = new THREE.Mesh(roadGeo, roadMat);
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0, z0 - CHUNK_LEN / 2);
  road.receiveShadow = true;
  group.add(road);

  const dirt = new THREE.Mesh(dirtGeo, dirtMat);
  dirt.rotation.x = -Math.PI / 2;
  dirt.position.set(0, -0.05, z0 - CHUNK_LEN / 2);
  group.add(dirt);

  for (let z = z0; z > z0 - CHUNK_LEN; z -= 9) {
    for (const side of [-1, 1]) {
      if (Math.random() < 0.18) continue;
      const w = 5 + Math.random() * 6;
      const h = 4 + Math.random() * 14;
      const d = 6 + Math.random() * 4;
      const b = new THREE.Mesh(bldGeo, bldMats[(Math.random() * bldMats.length) | 0]);
      b.scale.set(w, h, d);
      b.position.set(side * (ROAD_W / 2 + 4 + w / 2 + Math.random() * 5), h / 2, z);
      group.add(b);
      if (Math.random() < 0.6) {
        const win = new THREE.Mesh(bldGeo, winMat);
        win.scale.set(0.5, 0.7, 0.1);
        win.position.set(b.position.x - side * (w / 2 + 0.06), 1 + Math.random() * (h - 2), z + (Math.random() - 0.5) * d * 0.6);
        group.add(win);
      }
    }
  }

  for (let i = 0; i < CHUNK_LEN / 12; i++) {
    const z = z0 - Math.random() * CHUNK_LEN;
    const side = Math.random() < 0.5 ? -1 : 1;
    const x = side * (ROAD_W / 2 - 0.8 - Math.random() * 0.8);
    let p;
    if (Math.random() < 0.5) {
      p = new THREE.Mesh(barrelGeo, barrelMat);
      p.position.set(x, 0.45, z);
    } else {
      p = new THREE.Mesh(bldGeo, propMat);
      p.scale.set(0.9, 0.6, 0.7);
      p.position.set(x, 0.3, z);
      p.rotation.y = Math.random() * Math.PI;
    }
    p.castShadow = true;
    group.add(p);
  }

  scene.add(group);
  chunks.push({ z0, group });
}

function updateChunks() {
  while (nextChunkZ > squad.z - 320) {
    spawnChunk(nextChunkZ);
    nextChunkZ -= CHUNK_LEN;
  }
  for (let i = chunks.length - 1; i >= 0; i--) {
    if (chunks[i].z0 - CHUNK_LEN > squad.z + 90) {
      scene.remove(chunks[i].group);
      chunks.splice(i, 1);
    }
  }
}

function resetChunks() {
  for (const c of chunks) scene.remove(c.group);
  chunks = [];
  nextChunkZ = 60;
}

// ============================================================ 门
const gateGroup = new THREE.Group();
scene.add(gateGroup);

function gateLabel(gate) {
  if (gate.op === 'weapon') return WEAPONS[gate.value].name;
  if (gate.op === 'mul') return `×${gate.value}`;
  if (gate.op === 'div') return `÷${gate.value}`;
  return gate.value >= 0 ? `+${gate.value}` : `−${Math.abs(gate.value)}`;
}
function gateIsGood(gate) {
  if (gate.op === 'weapon' || gate.op === 'mul') return true;
  if (gate.op === 'div') return false;
  return gate.value >= 0;
}

function drawGateCanvas(gate) {
  const g = gate.ctx;
  g.clearRect(0, 0, 256, 192);
  const grad = g.createLinearGradient(0, 0, 0, 192);
  const activated = gate.op === 'weapon' && gate.remaining <= 0;
  if (activated) {
    grad.addColorStop(0, 'rgba(90,220,120,.95)'); grad.addColorStop(1, 'rgba(20,140,60,.95)');
  } else if (gate.op === 'weapon') {
    grad.addColorStop(0, 'rgba(255,205,80,.94)'); grad.addColorStop(1, 'rgba(200,120,10,.94)');
  } else if (gateIsGood(gate)) {
    grad.addColorStop(0, 'rgba(70,160,255,.92)'); grad.addColorStop(1, 'rgba(20,80,190,.92)');
  } else {
    grad.addColorStop(0, 'rgba(255,90,90,.92)'); grad.addColorStop(1, 'rgba(170,20,40,.92)');
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 192);
  g.strokeStyle = 'rgba(255,255,255,.7)';
  g.lineWidth = 8;
  g.strokeRect(4, 4, 248, 184);
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,0,0,.5)';
  g.shadowBlur = 10;
  if (gate.op === 'weapon') {
    const w = WEAPONS[gate.value];
    if (activated) {
      g.font = '900 46px Arial, sans-serif';
      g.fillText(w.name, 128, 70);
      g.font = '900 36px Arial, sans-serif';
      g.fillText('已装备!', 128, 136);
    } else {
      // 大倒计数：打到 0 立即激活；附当前武器等级
      g.font = '900 88px Arial, sans-serif';
      g.fillText(String(gate.remaining), 128, 74);
      g.font = '800 26px Arial, sans-serif';
      g.fillText(`${w.name} Lv${state.weaponLevels[gate.value] || 0}`, 128, 150);
    }
  } else {
    g.font = '900 84px Arial, sans-serif';
    g.fillText(gateLabel(gate), 128, 88);
    if (gate.upgradable && gate.value < 15) {
      g.shadowBlur = 0;
      g.font = '700 22px Arial, sans-serif';
      g.fillStyle = 'rgba(255,255,255,.85)';
      g.fillText('射击可升级 ▲', 128, 166);
    }
  }
  gate.tex.needsUpdate = true;
  if (activated) {
    gate.frameMat.color.set(0xbfffc8); gate.frameMat.emissive.set(0x22bb44);
  } else if (gate.op === 'weapon') {
    gate.frameMat.color.set(0xffe2a0); gate.frameMat.emissive.set(0xcc8800);
  } else if (gateIsGood(gate)) {
    gate.frameMat.color.set(0x9fd4ff); gate.frameMat.emissive.set(0x1e6fe0);
  } else {
    gate.frameMat.color.set(0xffb0a0); gate.frameMat.emissive.set(0xd03030);
  }
}

function createGate(x, z, op, value, need = 0) {
  // 只有初始为负的数字门可以被子弹打回正数；增益门不可强化
  const gate = { x, z, op, value, hits: 0, remaining: need, upgradable: op === 'add' && value < 0 };
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 192;
  gate.ctx = canvas.getContext('2d');
  gate.tex = new THREE.CanvasTexture(canvas);
  gate.tex.colorSpace = THREE.SRGBColorSpace;

  const group = new THREE.Group();
  group.position.set(x, 0, z);

  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(GATE_W, GATE_H),
    new THREE.MeshBasicMaterial({ map: gate.tex, transparent: true, side: THREE.DoubleSide, depthWrite: false })
  );
  panel.position.y = GATE_H / 2 + 0.1;
  group.add(panel);

  gate.frameMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x000000, emissiveIntensity: 0.7, roughness: 0.4 });
  const pillarGeo = new THREE.BoxGeometry(0.28, GATE_H + 0.5, 0.28);
  const pl = new THREE.Mesh(pillarGeo, gate.frameMat);
  pl.position.set(-GATE_W / 2 - 0.14, (GATE_H + 0.5) / 2, 0);
  const pr = pl.clone();
  pr.position.x = GATE_W / 2 + 0.14;
  const top = new THREE.Mesh(new THREE.BoxGeometry(GATE_W + 0.84, 0.28, 0.28), gate.frameMat);
  top.position.y = GATE_H + 0.6;
  group.add(pl, pr, top);

  gate.group = group;
  drawGateCanvas(gate);
  gateGroup.add(group);
  return gate;
}

function applyGate(gate, count) {
  if (gate.op === 'mul') return count * gate.value;
  if (gate.op === 'div') return Math.floor(count / gate.value);
  const v = gate.value >= 0 ? Math.round(gate.value * state.reinfMult) : gate.value;
  return Math.max(0, count + v);
}

function rngPick(arr) { return arr[(Math.random() * arr.length) | 0]; }

function makeGatePair(z) {
  const half = ROAD_W / 4 + 0.35;
  const diff = diffAt(-z);
  const budget = Math.round(6 + diff * 4);
  const combos = [
    () => [{ op: 'mul', value: 2 }, { op: 'add', value: -Math.round(budget * 1.2) }],
    () => [{ op: 'mul', value: rngPick([2, 3]) }, { op: 'div', value: 2 }],
    () => [{ op: 'add', value: Math.round(budget * 1.5) }, { op: 'add', value: Math.round(budget * 0.4) }],
    () => [{ op: 'add', value: Math.round(budget) }, { op: 'add', value: -Math.round(budget) }],
    () => [{ op: 'div', value: 2 }, { op: 'add', value: -Math.round(budget * 0.8) }],
    () => [{ op: 'add', value: Math.round(budget * 2) }, { op: 'mul', value: 2 }],
  ];
  let [ca, cb] = rngPick(combos)();
  // 一定概率变成武器门对：二选一换枪（各带独立等级），倒计数随难度增长但封顶 24 发
  if (-z > 60 && Math.random() < 0.3) {
    const pool = WEAPON_KEYS.filter((k) => k !== state.weapon);
    if (pool.length > 1) {
      const picks = [...pool].sort(() => Math.random() - 0.5).slice(0, 2);
      const need = Math.min(Math.round(6 + diff * 3.5), 24);
      ca = { op: 'weapon', value: picks[0], need };
      cb = { op: 'weapon', value: picks[1], need };
    }
  } else if (Math.random() < 0.5) {
    [ca, cb] = [cb, ca];
  }
  const a = createGate(-half, z, ca.op, ca.value, ca.need ?? 0);
  const b = createGate(half, z, cb.op, cb.value, cb.need ?? 0);
  const pair = { a, b, consumed: false, z };
  a.pair = pair;
  b.pair = pair;
  gates.push(pair);
}

function removeGatePair(pair) {
  gateGroup.remove(pair.a.group);
  gateGroup.remove(pair.b.group);
}

// ============================================================ 道具箱
const pickupGroup = new THREE.Group();
scene.add(pickupGroup);
let pickups = [];

function createPickup(x, z, type) {
  const info = ITEMS[type];
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  const crate = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 1.1, 1.1),
    new THREE.MeshStandardMaterial({ color: info.color, roughness: 0.4, emissive: info.color, emissiveIntensity: 0.25 })
  );
  crate.position.y = 0.75;
  crate.castShadow = true;
  group.add(crate);

  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.font = '90px serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(info.icon, 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  sprite.scale.set(1.5, 1.5, 1);
  sprite.position.y = 2.2;
  group.add(sprite);

  pickupGroup.add(group);
  pickups.push({ x, z, type, group, crate });
}

// ============================================================ 子弹（曳光弹 + 火箭弹）
const tracerCoreGeo = new THREE.CylinderGeometry(0.022, 0.05, 0.95, 6).rotateX(Math.PI / 2);
const tracerCoreMat = new THREE.MeshBasicMaterial({
  color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
});
const tracerGlowGeo = new THREE.CylinderGeometry(0.055, 0.11, 0.8, 6).rotateX(Math.PI / 2);
const tracerGlowMat = new THREE.MeshBasicMaterial({
  color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.35, depthWrite: false,
});
const tracerCoreMesh = new THREE.InstancedMesh(tracerCoreGeo, tracerCoreMat, MAX_BULLETS);
const tracerGlowMesh = new THREE.InstancedMesh(tracerGlowGeo, tracerGlowMat, MAX_BULLETS);

function makeRocketGeo() {
  const parts = [];
  parts.push(new THREE.CylinderGeometry(0.1, 0.115, 0.52, 10).rotateX(Math.PI / 2));
  parts.push(new THREE.ConeGeometry(0.1, 0.24, 10).rotateX(-Math.PI / 2).translate(0, 0, -0.38));
  for (let i = 0; i < 3; i++) {
    parts.push(new THREE.BoxGeometry(0.03, 0.22, 0.18).translate(0, 0.16, 0.2).rotateZ((i / 3) * Math.PI * 2));
  }
  return mergeGeometries(parts);
}
const ROCKET_MAX = 60;
const rocketMat = new THREE.MeshStandardMaterial({ color: 0x4a5a45, roughness: 0.5, metalness: 0.4 });
const rocketMesh = new THREE.InstancedMesh(makeRocketGeo(), rocketMat, ROCKET_MAX);
const flameGeo = new THREE.ConeGeometry(0.09, 0.5, 8).rotateX(Math.PI / 2).translate(0, 0, 0.55);
const flameMat = new THREE.MeshBasicMaterial({
  color: 0xffa040, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.9, depthWrite: false,
});
const flameMesh = new THREE.InstancedMesh(flameGeo, flameMat, ROCKET_MAX);

// 喷火器火球：随飞行膨胀消散的发光团
const FIREBALL_MAX = 200;
const fireballMesh = new THREE.InstancedMesh(
  new THREE.SphereGeometry(0.16, 8, 6),
  new THREE.MeshBasicMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.45, depthWrite: false }),
  FIREBALL_MAX
);

for (const m of [tracerCoreMesh, tracerGlowMesh, rocketMesh, flameMesh, fireballMesh]) {
  m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(m.count * 3), 3);
  m.frustumCulled = false;
  scene.add(m);
}

// 电击器闪电链：折线池
const ZAP_POOL_N = 12;
const zapPool = [];
for (let i = 0; i < ZAP_POOL_N; i++) {
  const line = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: 0x9aeaff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending })
  );
  line.visible = false;
  line.frustumCulled = false;
  scene.add(line);
  zapPool.push({ line, life: 0 });
}

function drawZapLine(points) {
  let slot = zapPool.find((z) => z.life <= 0) ?? zapPool[0];
  // 折线抖动出电弧感
  const jittered = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    jittered.push(a);
    for (const f of [0.33, 0.66]) {
      jittered.push(new THREE.Vector3(
        a.x + (b.x - a.x) * f + (Math.random() - 0.5) * 0.6,
        a.y + (b.y - a.y) * f + Math.random() * 0.5,
        a.z + (b.z - a.z) * f + (Math.random() - 0.5) * 0.6
      ));
    }
  }
  jittered.push(points[points.length - 1]);
  slot.line.geometry.setFromPoints(jittered);
  slot.line.visible = true;
  slot.life = 0.09;
}

function updateZapLines(dt) {
  for (const z of zapPool) {
    if (z.life <= 0) continue;
    z.life -= dt;
    z.line.material.opacity = Math.max(0, z.life / 0.09);
    if (z.life <= 0) z.line.visible = false;
  }
}

// 电击：从枪口锁定最近敌人，再向附近连锁跳跃；命中带麻痹减速
function fireZap(sx, sz, dmg) {
  const points = [new THREE.Vector3(sx, 0.8, sz)];
  const hitSet = new Set();
  let cx = sx, cz = sz;
  let range = 32;
  for (let hop = 0; hop < 4; hop++) {
    let best = null, bestD = range;
    for (const zb of zombies) {
      if (zb.hidden || hitSet.has(zb) || zb.z > sz) continue;
      const d = Math.hypot(zb.x - cx, zb.z - cz);
      if (d < bestD) { bestD = d; best = zb; }
    }
    if (!best) break;
    hitSet.add(best);
    best.hp -= dmg;
    best.slowT = 0.6; // 电麻：短暂减速
    spawnBurst(best.x, 0.9, best.z, 0x9aeaff, 5, 2, 0.2);
    points.push(new THREE.Vector3(best.x, 0.9, best.z));
    cx = best.x; cz = best.z;
    range = 10; // 后续跳跃距离
  }
  // 电弧也能劈门：与子弹规则一致，枪口横向对准门面板才算命中
  for (const pair of gates) {
    if (pair.consumed) continue;
    let hitGate = null;
    for (const gate of [pair.a, pair.b]) {
      if (!gateInteractive(gate)) continue;
      if (gate.z < sz && sz - gate.z < 32 && Math.abs(sx - gate.x) < GATE_W / 2) {
        hitGate = gate;
        break;
      }
    }
    if (hitGate) {
      hitInteractiveGate(hitGate);
      spawnBurst(hitGate.x, 1.6, hitGate.z, 0x9aeaff, 5, 2.5, 0.2);
      points.push(new THREE.Vector3(hitGate.x, GATE_H * 0.5, hitGate.z));
      break; // 每次电击最多劈一扇门
    }
  }
  if (points.length > 1) drawZapLine(points);
}

// 全屏激光：横贯道路的光墙向前推进，途经的僵尸全灭
const laserMesh = new THREE.Mesh(
  new THREE.BoxGeometry(ROAD_W + 2, 2.6, 0.35),
  new THREE.MeshBasicMaterial({ color: 0xff4a6a, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.75, depthWrite: false })
);
laserMesh.visible = false;
scene.add(laserMesh);

const bullets = [];
const _bm = new THREE.Matrix4();
const _bq = new THREE.Quaternion();
const _bs = new THREE.Vector3();
const _bp = new THREE.Vector3();
const _bc = new THREE.Color();
const _yAxis = new THREE.Vector3(0, 1, 0);

function spawnBullet(x, y, z, w, dmgScale) {
  if (bullets.length >= MAX_BULLETS) return;
  const rs = state.runStats;
  bullets.push({
    x, y, z,
    kind: w.kind,
    vx: (Math.random() - 0.5) * 2 * w.spread * w.speed * 0.12,
    speed: w.speed,
    dmg: w.dmg * dmgScale,
    aoe: w.aoe + rs.aoeAdd,
    size: w.size,
    color: w.color,
    trailAcc: 0,
    age: 0,
    range: (w.range ?? (w.kind === 'rocket' ? 42 : 34)) * rs.rangeMult,
  });
}

function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.z -= b.speed * dt;
    b.x += b.vx * dt;
    b.range -= b.speed * dt;
    if (b.kind === 'rocket' && !b.dead) {
      b.trailAcc += dt;
      if (b.trailAcc > 0.055) {
        b.trailAcc = 0;
        spawnBurst(b.x, b.y + 0.05, b.z + 0.5, 0x8a8078, 3, 0.8, 0.35);
      }
    }
    if (b.dead || b.range <= 0) bullets.splice(i, 1);
  }

  let nTracer = 0, nRocket = 0, nFire = 0;
  for (const b of bullets) {
    b.age += dt;
    const yaw = Math.atan2(b.vx, -b.speed) + Math.PI;
    _bq.setFromAxisAngle(_yAxis, yaw);
    _bp.set(b.x, b.y, b.z);
    if (b.kind === 'flame') {
      if (nFire >= FIREBALL_MAX) continue;
      // 火球随飞行膨胀，颜色由亮金渐变到深橙红
      const s = 0.5 + b.age * 2.6;
      _bs.set(s, s, s);
      _bm.compose(_bp, _bq, _bs);
      fireballMesh.setMatrixAt(nFire, _bm);
      fireballMesh.setColorAt(nFire, _bc.set(b.age < 0.15 ? 0xffe9a0 : b.age < 0.4 ? 0xffa040 : 0xe0501a));
      nFire++;
    } else if (b.kind === 'tracer') {
      if (nTracer >= MAX_BULLETS) continue;
      _bs.set(b.size, b.size, b.size);
      _bm.compose(_bp, _bq, _bs);
      tracerCoreMesh.setMatrixAt(nTracer, _bm);
      tracerGlowMesh.setMatrixAt(nTracer, _bm);
      _bc.set(b.color);
      tracerCoreMesh.setColorAt(nTracer, _bc);
      tracerGlowMesh.setColorAt(nTracer, _bc);
      nTracer++;
    } else {
      if (nRocket >= ROCKET_MAX) continue;
      _bs.set(1, 1, 1);
      _bm.compose(_bp, _bq, _bs);
      rocketMesh.setMatrixAt(nRocket, _bm);
      const f = 0.7 + Math.random() * 0.6;
      _bs.set(f, f, f * (0.8 + Math.random() * 0.5));
      _bm.compose(_bp, _bq, _bs);
      flameMesh.setMatrixAt(nRocket, _bm);
      flameMesh.setColorAt(nRocket, _bc.set(Math.random() < 0.3 ? 0xffe08a : 0xff8a3a));
      nRocket++;
    }
  }
  tracerCoreMesh.count = nTracer;
  tracerGlowMesh.count = nTracer;
  rocketMesh.count = nRocket;
  flameMesh.count = nRocket;
  fireballMesh.count = nFire;
  for (const m of [tracerCoreMesh, tracerGlowMesh, rocketMesh, flameMesh, fireballMesh]) {
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }
}

// ============================================================ 敌方子弹（被感染士兵的射击）
const MAX_ENEMY_BULLETS = 80;
const enemyBulletMesh = new THREE.InstancedMesh(
  tracerCoreGeo,
  new THREE.MeshBasicMaterial({ color: 0xff5a4a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
  MAX_ENEMY_BULLETS
);
enemyBulletMesh.frustumCulled = false;
scene.add(enemyBulletMesh);
let enemyBullets = [];

function spawnEnemyBullet(x, y, z) {
  if (enemyBullets.length >= MAX_ENEMY_BULLETS) return;
  // 瞄准小队中心，带一点散布
  const T = Math.max(0.3, Math.hypot(squad.x - x, squad.z - z) / 18);
  const tx = squad.x + (Math.random() - 0.5) * 1.6;
  const tz = squad.z - squad.speed * T * 0.5;
  const len = Math.hypot(tx - x, tz - z) || 1;
  enemyBullets.push({
    x, y, z,
    vx: ((tx - x) / len) * 18,
    vz: ((tz - z) / len) * 18,
    life: 3,
  });
}

function updateEnemyBullets(dt) {
  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    const b = enemyBullets[i];
    b.x += b.vx * dt;
    b.z += b.vz * dt;
    b.life -= dt;
    // 命中小队
    if (Math.hypot(b.x - squad.x, b.z - squad.z) < squadRadius() * 0.7 + 0.4) {
      spawnBurst(b.x, 0.7, b.z, 0xff5a4a, 8, 3, 0.3);
      loseSoldiers(1);
      enemyBullets.splice(i, 1);
      continue;
    }
    if (b.life <= 0) enemyBullets.splice(i, 1);
  }
  enemyBulletMesh.count = enemyBullets.length;
  for (let i = 0; i < enemyBullets.length; i++) {
    const b = enemyBullets[i];
    _bq.setFromAxisAngle(_yAxis, Math.atan2(-b.vx, -b.vz));
    _bp.set(b.x, b.y, b.z);
    _bs.set(0.9, 0.9, 0.9);
    _bm.compose(_bp, _bq, _bs);
    enemyBulletMesh.setMatrixAt(i, _bm);
  }
  enemyBulletMesh.instanceMatrix.needsUpdate = true;
}

// ============================================================ 兽颅投掷物（Boss / 憎恶屠夫的远程攻击）
const SKULL_MAX = 24;
const SKULL_G = 14;

function makeSkullGeo() {
  const parts = [];
  parts.push(new THREE.SphereGeometry(0.3, 10, 8));                                 // 颅骨
  parts.push(new THREE.BoxGeometry(0.3, 0.18, 0.24).translate(0, -0.16, -0.18));    // 下颚
  for (const side of [-1, 1]) {                                                     // 一对弯角
    parts.push(new THREE.ConeGeometry(0.07, 0.3, 6)
      .rotateZ(side * 0.9)
      .translate(side * 0.3, 0.18, 0));
  }
  return mergeGeometries(parts);
}
const skullMesh = new THREE.InstancedMesh(
  makeSkullGeo(),
  new THREE.MeshStandardMaterial({ color: 0xd8cfb8, roughness: 0.7 }),
  SKULL_MAX
);
// 落点预警红圈
const warnRingMesh = new THREE.InstancedMesh(
  new THREE.RingGeometry(0.55, 0.8, 24).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }),
  SKULL_MAX
);
for (const m of [skullMesh, warnRingMesh]) {
  m.frustumCulled = false;
  scene.add(m);
}
let skulls = [];

// 从 (x,y,z) 朝小队预判落点抛出兽颅；lossFrac 决定命中时啃掉多少兵力
function throwSkull(x, y, z, lossFrac) {
  if (skulls.length >= SKULL_MAX) return;
  const T = 0.85 + Math.random() * 0.4;
  // 预判：小队会继续向前跑
  const tx = THREE.MathUtils.clamp(squad.x + (Math.random() - 0.5) * 2.5, -SQUAD_X_LIMIT, SQUAD_X_LIMIT);
  const tz = squad.z - squad.speed * T * 0.9 + (Math.random() - 0.5) * 2.5;
  skulls.push({
    x, y, z,
    vx: (tx - x) / T,
    vz: (tz - z) / T,
    vy: (0.15 - y + 0.5 * SKULL_G * T * T) / T,
    tx, tz,
    lossFrac,
    spin: Math.random() * Math.PI * 2,
    spinSpeed: 6 + Math.random() * 6,
  });
  sfx.throwSkull();
}

const _sq = new THREE.Quaternion();
const _se = new THREE.Euler();
function updateSkulls(dt, time) {
  for (let i = skulls.length - 1; i >= 0; i--) {
    const s = skulls[i];
    s.vy -= SKULL_G * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.z += s.vz * dt;
    s.spin += s.spinSpeed * dt;
    if (s.y <= 0.15 && s.vy < 0) {
      // 落地：骨屑 + 血色溅射，命中范围内啃兵
      spawnBurst(s.x, 0.4, s.z, 0xd8cfb8, 14, 4.5, 0.4);
      spawnBurst(s.x, 0.3, s.z, 0x8a1015, 8, 3, 0.5);
      sfx.skullImpact(Math.hypot(s.x - squad.x, s.z - squad.z));
      state.shake = Math.min(0.4, state.shake + 0.08);
      if (Math.hypot(s.x - squad.x, s.z - squad.z) < 2.3 + squadRadius() * 0.5) {
        loseSoldiers(Math.max(1, Math.round(state.count * s.lossFrac)));
      }
      skulls.splice(i, 1);
    }
  }

  skullMesh.count = skulls.length;
  warnRingMesh.count = skulls.length;
  for (let i = 0; i < skulls.length; i++) {
    const s = skulls[i];
    _se.set(s.spin, s.spin * 0.7, 0);
    _sq.setFromEuler(_se);
    _bp.set(s.x, s.y, s.z);
    _bs.set(1, 1, 1);
    _bm.compose(_bp, _sq, _bs);
    skullMesh.setMatrixAt(i, _bm);
    // 预警圈脉冲
    const pulse = 0.85 + Math.sin(time * 10 + i) * 0.2;
    _bp.set(s.tx, 0.03, s.tz);
    _bs.set(pulse, 1, pulse);
    _bm.compose(_bp, _sq.identity(), _bs);
    warnRingMesh.setMatrixAt(i, _bm);
  }
  skullMesh.instanceMatrix.needsUpdate = true;
  warnRingMesh.instanceMatrix.needsUpdate = true;
}

// ============================================================ 粒子爆点 + 地面血泊
const bursts = [];
function spawnBurst(x, y, z, color, n = 14, speed = 5, life = 0.45) {
  if (bursts.length > 150) return;
  const pos = new Float32Array(n * 3);
  const vel = [];
  for (let i = 0; i < n; i++) {
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    const a = Math.random() * Math.PI * 2;
    const u = Math.random() * 2 - 1;
    const s = (0.4 + Math.random() * 0.6) * speed;
    const r = Math.sqrt(1 - u * u);
    vel.push(new THREE.Vector3(Math.cos(a) * r * s, Math.abs(u) * s, Math.sin(a) * r * s));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color, size: 0.22, transparent: true, opacity: 1 });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  bursts.push({ points, vel, life, maxLife: life });
}

function updateBursts(dt) {
  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i];
    b.life -= dt;
    if (b.life <= 0) {
      scene.remove(b.points);
      b.points.geometry.dispose();
      b.points.material.dispose();
      bursts.splice(i, 1);
      continue;
    }
    const p = b.points.geometry.attributes.position;
    for (let j = 0; j < b.vel.length; j++) {
      b.vel[j].y -= 12 * dt;
      p.array[j * 3] += b.vel[j].x * dt;
      p.array[j * 3 + 1] += b.vel[j].y * dt;
      p.array[j * 3 + 2] += b.vel[j].z * dt;
    }
    p.needsUpdate = true;
    b.points.material.opacity = b.life / b.maxLife;
  }
}

// 地面血泊：击杀处留下一滩暗红渐隐污渍
const MAX_POOLS = 36;
const poolGeo = new THREE.CircleGeometry(0.55, 12);
const bloodPools = [];
function spawnBloodPool(x, z) {
  let pool;
  if (bloodPools.length >= MAX_POOLS) {
    pool = bloodPools.shift(); // 复用最旧的
  } else {
    pool = {
      mesh: new THREE.Mesh(poolGeo, new THREE.MeshBasicMaterial({
        color: 0x8a1015, transparent: true, opacity: 0.75, depthWrite: false,
      })),
    };
    pool.mesh.rotation.x = -Math.PI / 2;
    scene.add(pool.mesh);
  }
  pool.life = 3.2;
  pool.mesh.visible = true;
  pool.mesh.position.set(x, 0.02 + Math.random() * 0.01, z);
  const s = 0.7 + Math.random() * 0.9;
  pool.mesh.scale.set(s, s * (0.7 + Math.random() * 0.6), 1);
  pool.mesh.rotation.z = Math.random() * Math.PI * 2;
  bloodPools.push(pool);
}

function updateBloodPools(dt) {
  for (const pool of bloodPools) {
    if (!pool.mesh.visible) continue;
    pool.life -= dt;
    if (pool.life <= 0) {
      pool.mesh.visible = false;
      continue;
    }
    pool.mesh.material.opacity = Math.min(0.75, pool.life * 0.6);
  }
}

// 击杀特效：红色血浆迸溅 + 血泊
function gore(x, z) {
  spawnBurst(x, 0.9, z, 0xc01020, 16, 6, 0.5);
  spawnBurst(x, 0.6, z, 0x7a0a12, 8, 3.5, 0.65);
  spawnBloodPool(x, z);
}

// ============================================================ 士兵 & 僵尸群渲染（每种僵尸一个实例化渲染器）
let soldierGold = false;
let soldierCrowd = new CrowdRenderer(scene, soldierParts(false), MAX_SOLDIER_RENDER);
// 自适应画质：帧率不足时自动下调士兵渲染上限，恢复后回升
let currentRenderCap = MAX_SOLDIER_RENDER;

function swapSoldierCrowd(gold) {
  if (soldierGold === gold) return;
  soldierGold = gold;
  for (const mesh of soldierCrowd.meshes) scene.remove(mesh);
  soldierCrowd = new CrowdRenderer(scene, soldierParts(gold), MAX_SOLDIER_RENDER);
}
const zombieCrowds = {};
const zombieBuckets = {};
for (const key of ZOMBIE_TYPE_KEYS) {
  const t = ZOMBIE_TYPES[key];
  zombieCrowds[key] = new CrowdRenderer(scene, t.parts ? t.parts() : zombieParts(t.palette), t.maxRender);
  zombieBuckets[key] = [];
}

const unitSpiral = [];
for (let i = 0; i < MAX_SOLDIER_RENDER; i++) {
  const r = Math.sqrt(i);
  const a = i * 2.39996;
  unitSpiral.push({ dx: Math.cos(a) * r, dz: Math.sin(a) * r });
}
function formationScale(n) {
  if (n <= 1) return BASE_SPACING;
  // 编队半径随人数增长（受路面宽度约束），大部队铺满道路，视觉上人多势众
  const radius = Math.min(4.2, MAX_SQUAD_RADIUS + 0.28 * Math.sqrt(n));
  return Math.min(BASE_SPACING, radius / Math.sqrt(n - 1));
}
function squadRadius() {
  const n = Math.min(state.count, currentRenderCap);
  return n <= 1 ? 0.4 : formationScale(n) * Math.sqrt(n - 1) + 0.4;
}

const shieldMesh = new THREE.Mesh(
  new THREE.SphereGeometry(1, 24, 16),
  new THREE.MeshBasicMaterial({ color: 0x58baff, transparent: true, opacity: 0.22, depthWrite: false })
);
shieldMesh.visible = false;
scene.add(shieldMesh);

// ============================================================ 游戏状态
const sfx = new SFX();
const state = {
  phase: 'menu',            // menu | run | upgrade | result
  dist: 0,
  best: parseInt(localStorage.getItem('dg_best') || '0', 10),
  count: 10,
  maxCount: 10,
  kills: 0,
  weapon: 'rifle',
  weaponLevels: { rifle: 0, shotgun: 0, minigun: 0, rocket: 0, tesla: 0, flamer: 0 },
  // 击杀升级
  killXp: 0,
  killLevel: 0,
  xpMult: 1,
  // 局内成长叠加（三选一强化卡）
  runStats: { dmgMult: 1, rateMult: 1, pelletsAdd: 0, aoeAdd: 0, rangeMult: 1, speedAdd: 0, reinfMult: 0, xpMult: 0 },
  reinfMult: 1,           // 增援/奖励兵力倍率（meta × 局内叠加）
  meta: null,             // 开局时的 meta 快照
  fireAcc: 0,
  fireIndex: 0,
  rageTime: 0,
  shieldTime: 0,
  freezeTime: 0,
  laserZ: null,
  laserZ0: 0,
  shake: 0,
  // 无尽生成游标
  nextGateZ: -40,
  nextPickupZ: -70,
  nextWaveZ: -30,
  nextHordeAt: HORDE_FIRST_AT,
  lastHordeAt: 0,
  trickleTimer: 2,
  pullX: 0,
  pullTime: 0,
};

const squad = { x: 0, z: 0, targetX: 0, speed: 8.5 };
let gates = [];
let zombies = [];

// ============================================================ 敌人生成
// 按距离解锁的僵尸类型池：越往后特殊僵尸占比越高
function rollZombieType() {
  const unlocked = ZOMBIE_TYPE_KEYS.filter((k) => state.dist >= ZOMBIE_TYPES[k].unlockAt);
  // 普通僵尸始终是主力，特殊类型均分剩余概率
  const specialShare = Math.min(0.55, 0.12 * (unlocked.length - 1));
  if (unlocked.length === 1 || Math.random() > specialShare) return 'normal';
  const specials = unlocked.filter((k) => k !== 'normal');
  return specials[(Math.random() * specials.length) | 0];
}

function spawnWave(zCenter, size) {
  const diff = diffAt(state.dist);
  for (let i = 0; i < size; i++) {
    if (zombies.length >= MAX_ZOMBIE_RENDER) return;
    const typeKey = rollZombieType();
    const t = ZOMBIE_TYPES[typeKey];
    // 血量随兵力匹配增长（5 万兵力以下几乎无感，之后线性）：大部队面对的尸潮也"人多势众"
    const hp = t.hp(diff) + state.count * 0.8 * Math.min(1, state.count / 50000);
    zombies.push({
      type: typeKey,
      x: (Math.random() - 0.5) * (ROAD_W - 1.2),
      z: zCenter - Math.random() * 8,
      hp, maxHp: hp,
      phase: Math.random() * Math.PI * 2,
      rotY: 0,
      scale: t.scaleBase + Math.random() * 0.2,
      speedBonus: Math.random() * 0.5,
      skillT: 1 + Math.random() * 3, // 技能计时器错开
      hidden: false,
      y: 0,
    });
  }
}

// 每帧推进生成游标：门 / 道具 / 僵尸波 / Boss
function updateSpawners(dt) {
  const diff = diffAt(state.dist);

  while (state.nextGateZ > squad.z - 130) {
    makeGatePair(state.nextGateZ);
    state.nextGateZ -= GATE_SPACING + Math.random() * 20;
  }

  while (state.nextPickupZ > squad.z - 130) {
    const roll = Math.random();
    const type = roll < 0.28 ? 'medkit'
      : roll < 0.46 ? 'rage'
      : roll < 0.62 ? 'shield'
      : roll < 0.76 ? 'laser'
      : roll < 0.9 ? 'freeze'
      : 'nuke';
    createPickup((Math.random() - 0.5) * 6, state.nextPickupZ, type);
    state.nextPickupZ -= PICKUP_SPACING + Math.random() * 60;
  }

  // 波次规模随距离和兵力一起增长（人越多尸潮越大，主打堆兵力碾压）
  while (state.nextWaveZ > squad.z - 110) {
    spawnWave(state.nextWaveZ, Math.round(6 + 2.5 * diff * Math.sqrt(state.count / 10) + Math.random() * 4));
    state.nextWaveZ -= Math.max(7, WAVE_SPACING - diff * 1.6);
  }

  // 后期持续从前方渗入散兵
  state.trickleTimer -= dt;
  if (state.trickleTimer <= 0) {
    state.trickleTimer = Math.max(0.3, 2.2 - diff * 0.15);
    spawnWave(squad.z - 55, 1 + Math.floor(diff * 1.2));
  }

  // 周期性尸潮爆发（替代原 Boss）：一大波 + 增援奖励
  if (state.dist >= state.nextHordeAt) {
    state.lastHordeAt = state.nextHordeAt;
    state.nextHordeAt += HORDE_INTERVAL;
    spawnWave(squad.z - 90, Math.round(14 + diff * 8));
    const bonus = Math.round((8 + diff * 3) * state.reinfMult);
    state.count += bonus;
    state.maxCount = Math.max(state.maxCount, state.count);
    floatText(new THREE.Vector3(squad.x, 2.5, squad.z), `+${bonus} 增援!`, true);
    showBanner('🧟 尸潮来袭！');
    sfx.hammer();
    state.shake = Math.min(0.6, state.shake + 0.3);
  }
}

// 清理身后的实体
function cleanupBehind() {
  const behind = squad.z + 14;
  for (let i = gates.length - 1; i >= 0; i--) {
    if (gates[i].z > behind) {
      removeGatePair(gates[i]);
      gates.splice(i, 1);
    }
  }
  for (let i = pickups.length - 1; i >= 0; i--) {
    if (pickups[i].z > behind) {
      pickupGroup.remove(pickups[i].group);
      pickups.splice(i, 1);
    }
  }
  for (let i = zombies.length - 1; i >= 0; i--) {
    if (zombies[i].z > behind) zombies.splice(i, 1);
  }
}

// ============================================================ UI
const ui = {
  hud: document.getElementById('hud'),
  levelTag: document.getElementById('levelTag'),
  progressFill: document.getElementById('progressFill'),
  countBadge: document.getElementById('countBadge'),
  weaponTag: document.getElementById('weaponTag'),
  buffRow: document.getElementById('buffRow'),
  banner: document.getElementById('banner'),
  flash: document.getElementById('flash'),
  menu: document.getElementById('menuOverlay'),
  result: document.getElementById('resultOverlay'),
  resultTitle: document.getElementById('resultTitle'),
  resultStats: document.getElementById('resultStats'),
  resultBtn: document.getElementById('resultBtn'),
  resetBtn: document.getElementById('resetBtn'),
  startBtn: document.getElementById('startBtn'),
  muteBtn: document.getElementById('muteBtn'),
  meta: document.getElementById('metaOverlay'),
  metaCoins: document.getElementById('metaCoins'),
  metaList: document.getElementById('metaList'),
  metaBtn: document.getElementById('metaBtn'),
  metaCloseBtn: document.getElementById('metaCloseBtn'),
  upgrade: document.getElementById('upgradeOverlay'),
  upgradeCards: document.getElementById('upgradeCards'),
};
ui.resetBtn.style.display = 'none'; // 无尽模式没有"回到第 1 关"

function showBanner(text) {
  ui.banner.textContent = text;
  ui.banner.classList.remove('show');
  void ui.banner.offsetWidth;
  ui.banner.classList.add('show');
}

function floatText(worldPos, text, good) {
  const v = worldPos.clone().project(camera);
  const el = document.createElement('div');
  el.className = `floatText ${good ? 'good' : 'bad'}`;
  el.textContent = text;
  el.style.left = `${(v.x * 0.5 + 0.5) * window.innerWidth}px`;
  el.style.top = `${(-v.y * 0.5 + 0.5) * window.innerHeight}px`;
  ui.hud.appendChild(el);
  setTimeout(() => el.remove(), 1100);
}

function formatCount(n) {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

const _proj = new THREE.Vector3();
function updateHud() {
  _proj.set(squad.x, 2.6, squad.z).project(camera);
  ui.countBadge.style.left = `${(_proj.x * 0.5 + 0.5) * window.innerWidth}px`;
  ui.countBadge.style.top = `${(-_proj.y * 0.5 + 0.5) * window.innerHeight}px`;
  ui.countBadge.textContent = formatCount(state.count);

  ui.levelTag.textContent = `${Math.floor(state.dist)}m`;
  // 进度条 = 距下一次尸潮爆发
  const span = state.nextHordeAt - state.lastHordeAt;
  ui.progressFill.style.width = `${Math.min(100, ((state.dist - state.lastHordeAt) / span) * 100).toFixed(1)}%`;

  let html = '';
  if (state.rageTime > 0) html += `<div class="buffChip">🔥 狂暴 ${state.rageTime.toFixed(0)}s</div>`;
  if (state.shieldTime > 0) html += `<div class="buffChip">🛡️ 护盾 ${state.shieldTime.toFixed(0)}s</div>`;
  if (state.freezeTime > 0) html += `<div class="buffChip">❄️ 冰冻 ${state.freezeTime.toFixed(0)}s</div>`;
  ui.buffRow.innerHTML = html;
}

// ============================================================ 输入
let dragging = false, lastPX = 0;
const keys = {};
renderer.domElement.addEventListener('pointerdown', (e) => { dragging = true; lastPX = e.clientX; });
window.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastPX;
  lastPX = e.clientX;
  squad.targetX = THREE.MathUtils.clamp(squad.targetX + dx * 0.02, -SQUAD_X_LIMIT, SQUAD_X_LIMIT);
});
window.addEventListener('pointerup', () => { dragging = false; });
window.addEventListener('keydown', (e) => { keys[e.code] = true; });
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

// ============================================================ 击杀升级（三选一强化卡）
function xpNeed(level) {
  return Math.round(KILL_XP_BASE * Math.pow(level, KILL_XP_POW));
}

function addKill() {
  state.kills++;
  state.killXp += state.xpMult;
  tryLevelUp();
}

function tryLevelUp() {
  if (state.phase !== 'run') return;
  const need = xpNeed(state.killLevel + 1);
  if (state.killXp < need) return;
  state.killXp -= need;
  state.killLevel++;
  openUpgradeChoice();
}

function openUpgradeChoice() {
  state.phase = 'upgrade';
  const opts = [...RUN_UPGRADES].sort(() => Math.random() - 0.5).slice(0, 3);
  ui.upgradeCards.innerHTML = '';
  for (const u of opts) {
    const card = document.createElement('div');
    card.className = 'upgCard';
    card.innerHTML = `<div class="uc-icon">${u.icon}</div><div class="uc-label">${u.label}</div>`;
    card.addEventListener('click', () => {
      applyRunUpgrade(u.id);
      ui.upgrade.classList.remove('visible');
      state.phase = 'run';
      sfx.levelUp();
      showBanner(`🆙 ${u.icon} ${u.label}`);
      tryLevelUp(); // 若又攒够一次升级则继续弹出
    });
    ui.upgradeCards.appendChild(card);
  }
  ui.upgrade.classList.add('visible');
}

function applyRunUpgrade(id) {
  const rs = state.runStats;
  const m = state.meta;
  switch (id) {
    case 'dmg': rs.dmgMult += 0.15; break;
    case 'rate': rs.rateMult += 0.12; break;
    case 'pellet': rs.pelletsAdd += 1; break;
    case 'aoe': rs.aoeAdd += 0.4; break;
    case 'range': rs.rangeMult += 0.2; break;
    case 'speed':
      rs.speedAdd += 0.5;
      squad.speed = 8.5 + m.speed + rs.speedAdd;
      break;
    case 'reinf':
      rs.reinfMult += 0.2;
      state.reinfMult = (1 + m.reinf) * (1 + rs.reinfMult);
      break;
    case 'shield': state.shieldTime = Math.max(state.shieldTime, 3); break;
    case 'xp':
      rs.xpMult += 0.2;
      state.xpMult = (1 + m.xpGain) * (1 + rs.xpMult);
      break;
  }
}

// ============================================================ 局外成长面板
function openMetaPanel() {
  renderMetaList();
  ui.menu.classList.remove('visible');
  ui.meta.classList.add('visible');
}

function closeMetaPanel() {
  ui.meta.classList.remove('visible');
  ui.menu.classList.add('visible');
}

function renderMetaList() {
  ui.metaCoins.textContent = `💰 ${getCoins()}`;
  ui.metaList.innerHTML = '';
  const levels = metaLevels();
  const paid = paidUnlocked();
  for (const upg of META_UPGRADES) {
    const item = document.createElement('div');
    item.className = `metaItem${upg.paid ? ' paid' : ''}`;
    const lv = upg.paid ? (paid.includes(upg.id) ? 1 : 0) : (levels[upg.id] || 0);
    const maxed = lv >= upg.max;
    const unlocked = upg.paid && lv >= 1;
    const cost = upg.paid ? `💎 ¥${upg.price}` : `🪙 ${levelCost(upg, lv)}`;

    const info = document.createElement('div');
    info.className = 'mi-info';
    info.innerHTML =
      `<div class="mi-name">${upg.icon} ${upg.name}</div>` +
      `<div class="mi-desc">${upg.desc}</div>` +
      (upg.paid ? '' : `<div class="mi-level">Lv ${lv} / ${upg.max}</div>`);

    const btn = document.createElement('button');
    btn.className = `mi-btn${upg.paid ? ' paid-btn' : ''}`;
    if (upg.paid) {
      btn.textContent = unlocked ? '已解锁 ✓' : `解锁 ${cost}`;
      btn.disabled = unlocked;
      btn.addEventListener('click', () => {
        btn.disabled = true;
        btn.textContent = '💳 支付中…';
        sfx.pickup('medkit');
        // 破解钩子：模拟支付流程后直接放行
        mockPurchase(upg).then(() => {
          sfx.levelUp();
          renderMetaList();
        });
      });
    } else {
      btn.textContent = maxed ? '已满级' : (lv > 0 ? `升级 ${cost}` : `购买 ${cost}`);
      btn.disabled = maxed;
      btn.addEventListener('click', () => {
        if (getCoins() < levelCost(upg, lv)) {
          btn.textContent = '金币不足';
          setTimeout(renderMetaList, 700);
          return;
        }
        addCoins(-levelCost(upg, lv));
        const next = metaLevels();
        next[upg.id] = (next[upg.id] || 0) + 1;
        setMetaLevels(next);
        sfx.levelUp();
        renderMetaList();
      });
    }
    item.appendChild(info);
    item.appendChild(btn);
    ui.metaList.appendChild(item);
  }
}

ui.metaBtn.addEventListener('click', openMetaPanel);
ui.metaCloseBtn.addEventListener('click', closeMetaPanel);

// ============================================================ 游戏流程
function startRun() {
  // 清理旧战场
  for (const pair of gates) removeGatePair(pair);
  gates = [];
  pickupGroup.clear();
  pickups = [];
  zombies = [];
  bullets.length = 0;
  skulls = [];
  skullMesh.count = 0;
  warnRingMesh.count = 0;
  enemyBullets = [];
  enemyBulletMesh.count = 0;
  for (const pool of bloodPools) pool.mesh.visible = false;
  resetChunks();

  // ---- 应用局外成长（叠加在初始状态上）
  const m = state.meta = getMetaSnapshot();
  squad.x = 0; squad.targetX = 0; squad.z = 0;
  squad.speed = 8.5 + m.speed;
  state.dist = 0;
  state.count = 10 + m.startSoldiers;
  state.maxCount = state.count;
  state.kills = 0;
  state.weapon = 'rifle';
  state.weaponLevels = { rifle: 0, shotgun: 0, minigun: 0, rocket: 0, tesla: 0, flamer: 0 };
  state.runStats = { dmgMult: 1, rateMult: 1, pelletsAdd: 0, aoeAdd: 0, rangeMult: 1, speedAdd: 0, reinfMult: 0, xpMult: 0 };
  state.killXp = 0;
  state.killLevel = 0;
  state.xpMult = 1 + m.xpGain;
  state.reinfMult = 1 + m.reinf;
  state.fireAcc = 0;
  state.rageTime = 0;
  state.shieldTime = 0;
  state.freezeTime = 0;
  state.laserZ = null;
  laserMesh.visible = false;
  for (const z of zapPool) { z.life = 0; z.line.visible = false; }
  state.nextGateZ = -40;
  state.nextPickupZ = -70;
  state.nextWaveZ = -30;
  state.nextHordeAt = HORDE_FIRST_AT;
  state.lastHordeAt = 0;
  state.trickleTimer = 2;
  state.pullTime = 0;
  ui.weaponTag.textContent = `${WEAPONS[state.weapon].name} Lv${state.weaponLevels[state.weapon]}`;
  swapSoldierCrowd(!!m.goldArmy);

  // 开局 buff 类 meta
  if (m.shieldStart > 0) state.shieldTime = m.shieldStart;
  if (m.rageStart > 0) state.rageTime = m.rageStart;
  if (m.freezeStart > 0) state.freezeTime = m.freezeStart;
  if (m.luckyStart > 0) applyPickup(rngPick(Object.keys(ITEMS)));
  if (m.startNuke) {
    // 付费「开局核弹」：起跑后一小波僵尸 + 核弹清屏
    setTimeout(() => {
      if (state.phase === 'run') {
        spawnWave(squad.z - 80, 26);
        applyPickup('nuke');
      }
    }, 600);
  }

  state.phase = 'run';
  ui.menu.classList.remove('visible');
  ui.result.classList.remove('visible');
  ui.hud.classList.add('visible');
  sfx.ensure();
  sfx.startBgm();
}

function onDefeat() {
  state.phase = 'result';
  ui.hud.classList.remove('visible');
  ui.result.classList.add('visible');
  const dist = Math.floor(state.dist);
  const isRecord = dist > state.best;
  if (isRecord) {
    state.best = dist;
    localStorage.setItem('dg_best', String(dist));
  }
  // 金币结算：击杀 ×2 + 距离/10，双倍金币付费特权 ×2
  const coins = Math.floor((state.kills * 2 + dist / 10) * (state.meta?.doubleCoins ? 2 : 1));
  const balance = addCoins(coins);
  ui.resultTitle.textContent = '💀 全 军 覆 没';
  ui.resultTitle.className = 'lose';
  ui.resultStats.innerHTML =
    `冲锋 ${dist}m ${isRecord ? '🏆 新纪录！' : `（最佳 ${state.best}m）`}<br/>` +
    `击杀 ${state.kills} &nbsp;|&nbsp; 巅峰兵力 ${formatCount(state.maxCount)} 人<br/>` +
    `💰 金币 +${coins}（余额 ${balance}）`;
  ui.resultBtn.textContent = '再次出击 ↻';
  sfx.stopBgm();
  sfx.lose();
}

ui.startBtn.addEventListener('click', startRun);
ui.resultBtn.addEventListener('click', startRun);
ui.muteBtn.addEventListener('click', () => {
  sfx.setMuted(!sfx.muted);
  ui.muteBtn.textContent = sfx.muted ? '🔇' : '🔊';
});

function loseSoldiers(n) {
  if (state.count <= 0 || state.shieldTime > 0) return;
  state.count = Math.max(0, state.count - n);
  state.shake = Math.min(0.5, state.shake + 0.18);
  sfx.squadHurt();
  if (state.count <= 0) {
    spawnBurst(squad.x, 1, squad.z, 0xff4040, 30, 7, 0.8);
    onDefeat();
  }
}

// ============================================================ 道具效果
function applyPickup(type) {
  const info = ITEMS[type];
  sfx.pickup(type);
  floatText(new THREE.Vector3(squad.x, 2.5, squad.z), `${info.icon} ${info.name}`, true);
  if (type === 'medkit') {
    const add = Math.max(5, Math.round(state.count * 0.15 * state.reinfMult));
    state.count += add;
    state.maxCount = Math.max(state.maxCount, state.count);
  } else if (type === 'rage') {
    state.rageTime = 8;
  } else if (type === 'shield') {
    state.shieldTime = 6;
  } else if (type === 'laser') {
    // 光墙从队前向远方推进
    state.laserZ = squad.z - 3;
    state.laserZ0 = state.laserZ; // 本次激光的标记，Boss 只受创一次
    laserMesh.visible = true;
    sfx.laser();
    state.shake = Math.min(0.5, state.shake + 0.2);
  } else if (type === 'freeze') {
    state.freezeTime = 5;
    sfx.freeze();
    for (const zb of zombies) spawnBurst(zb.x, 0.9, zb.z, 0x9adfff, 3, 1.2, 0.4);
  } else if (type === 'nuke') {
    sfx.nuke();
    ui.flash.classList.remove('boom');
    void ui.flash.offsetWidth;
    ui.flash.classList.add('boom');
    state.shake = 0.6;
    for (let i = zombies.length - 1; i >= 0; i--) {
      gore(zombies[i].x, zombies[i].z);
      addKill();
      zombies.splice(i, 1);
    }
  }
}

// 门是否还能吃子弹：负数门未升满级 / 武器门未激活
function gateInteractive(gate) {
  return (gate.upgradable && gate.value < 15) || (gate.op === 'weapon' && gate.remaining > 0);
}

// 子弹 / 电弧命中门的统一结算
function hitInteractiveGate(gate) {
  if (gate.op === 'weapon') {
    gate.remaining--;
    if (gate.remaining <= 0) {
      activateWeaponGate(gate);
    } else {
      drawGateCanvas(gate);
      if (gate.remaining % 4 === 0) sfx.gateCharge();
    }
  } else {
    gate.hits++;
    if (gate.hits % 3 === 0) {
      gate.value += 1;
      drawGateCanvas(gate);
      sfx.gateTick();
    }
  }
}

// 武器门被打到 0 → 立即装备并升 1 级；二选一，激活后整对门关闭
function activateWeaponGate(gate) {
  const key = gate.value;
  state.weapon = key;
  state.weaponLevels[key] = (state.weaponLevels[key] || 0) + 1;
  const lvl = state.weaponLevels[key];
  ui.weaponTag.textContent = `${WEAPONS[key].name} Lv${lvl}`;
  drawGateCanvas(gate);
  floatText(new THREE.Vector3(gate.x, GATE_H, gate.z), `${WEAPONS[key].name} Lv${lvl} 已装备!`, true);
  spawnBurst(gate.x, 1.8, gate.z, 0xffd24a, 26, 6, 0.5);
  spawnBurst(gate.x, 2.4, gate.z, 0x7dff9b, 18, 5, 0.5);
  sfx.weaponUp();
  const pair = gate.pair;
  if (pair && !pair.consumed) {
    pair.consumed = true;
    pair.a.group.visible = false;
    pair.b.group.visible = false;
  }
}

// ============================================================ 每帧逻辑
function updateRun(dt, time) {
  // ---- 移动（永远向前跑）
  if (keys.ArrowLeft || keys.KeyA) squad.targetX -= 9 * dt;
  if (keys.ArrowRight || keys.KeyD) squad.targetX += 9 * dt;
  squad.targetX = THREE.MathUtils.clamp(squad.targetX, -SQUAD_X_LIMIT, SQUAD_X_LIMIT);
  squad.x += (squad.targetX - squad.x) * Math.min(1, dt * 12);
  squad.z -= squad.speed * dt;
  state.dist = -squad.z;

  state.rageTime = Math.max(0, state.rageTime - dt);
  state.shieldTime = Math.max(0, state.shieldTime - dt);
  state.freezeTime = Math.max(0, state.freezeTime - dt);

  // ---- 全屏激光推进
  if (state.laserZ !== null) {
    state.laserZ -= 55 * dt;
    laserMesh.position.set(0, 1.3, state.laserZ);
    laserMesh.material.opacity = 0.55 + Math.sin(performance.now() * 0.05) * 0.25;
    for (let i = zombies.length - 1; i >= 0; i--) {
      const zb = zombies[i];
      if (zb.z > state.laserZ - 0.5) {
        gore(zb.x, zb.z);
        spawnBurst(zb.x, 1.0, zb.z, 0xff4a6a, 8, 4, 0.35);
        addKill();
        zombies.splice(i, 1);
      }
    }
    if (state.laserZ < squad.z - 75) {
      state.laserZ = null;
      laserMesh.visible = false;
    }
  }

  updateSpawners(dt);
  cleanupBehind();

  // ---- 全员齐射（伤害/射速/弹丸/范围叠加武器等级与局内成长）
  const weapon = WEAPONS[state.weapon];
  const renderN = Math.max(1, Math.min(state.count, currentRenderCap));
  const scale = formationScale(renderN);
  const shooters = Math.min(state.count, MAX_SHOOTERS);
  const rageMult = state.rageTime > 0 ? 2 : 1;
  const weaponPower = 1 + state.dist / 600; // 武器随距离越来越强
  const rs = state.runStats;
  const wlvl = state.weaponLevels[state.weapon] || 0;
  // 伤害随兵力增长但压缩：count ≤ 1 万几乎无感，99 万时约 1/26，配合僵尸血量匹配避免秒杀
  const dmgScale = (state.count / shooters) * weaponPower * (1 + wlvl * 0.12) * rs.dmgMult * (1 + state.meta.startDmg) / (1 + state.count / 40000);
  state.fireAcc += shooters * weapon.rate * rs.rateMult * (1 + state.meta.startRate) * rageMult * dt;
  let shots = Math.min(Math.floor(state.fireAcc), 96);
  state.fireAcc -= shots;
  while (shots-- > 0) {
    const idx = state.fireIndex++ % renderN;
    const sx = squad.x + unitSpiral[idx].dx * scale;
    const sz = squad.z + unitSpiral[idx].dz * scale;
    if (weapon.kind === 'zap') {
      fireZap(sx, sz - 0.5, weapon.dmg * dmgScale);
    } else {
      for (let p = 0; p < weapon.pellets + rs.pelletsAdd; p++) {
        spawnBullet(sx + 0.16, 0.72, sz - 0.5, weapon, dmgScale);
      }
    }
    sfx.shot(state.weapon);
  }

  // ---- 门逻辑
  for (const pair of gates) {
    if (pair.consumed) continue;
    for (const gate of [pair.a, pair.b]) {
      if (!gateInteractive(gate)) continue;
      for (const b of bullets) {
        if (b.dead) continue;
        if (b.z <= gate.z + 0.4 && b.z >= gate.z - 1.2 && Math.abs(b.x - gate.x) < GATE_W / 2) {
          b.dead = true;
          spawnBurst(b.x, b.y + 0.6, gate.z, 0xffe27a, 6, 3, 0.3);
          hitInteractiveGate(gate);
        }
      }
    }
    // 穿门（武器门优先打掉换枪；没打掉就穿过 → 兜底自动装备，保证永远能换）
    if (squad.z <= pair.z && squad.z > pair.z - 2) {
      const gate = Math.abs(squad.x - pair.a.x) < Math.abs(squad.x - pair.b.x) ? pair.a : pair.b;
      pair.consumed = true;
      if (gate.op !== 'weapon') {
        const before = state.count;
        state.count = applyGate(gate, state.count);
        state.maxCount = Math.max(state.maxCount, state.count);
        const good = state.count >= before;
        floatText(new THREE.Vector3(gate.x, GATE_H, gate.z), gateLabel(gate), good);
        spawnBurst(gate.x, 1.6, gate.z, good ? 0x59b8ff : 0xff6060, 20, 6, 0.5);
        good ? sfx.gateGood() : sfx.gateBad();
      } else if (gate.remaining > 0) {
        // 兜底：没打掉也直接装备，后期移速快时不会白白穿过去
        activateWeaponGate(gate);
      }
      pair.a.group.visible = false;
      pair.b.group.visible = false;
      if (state.count <= 0) {
        onDefeat();
        return;
      }
    }
  }

  // ---- 道具箱拾取
  const pickR = squadRadius() + 0.9;
  for (let i = pickups.length - 1; i >= 0; i--) {
    const pk = pickups[i];
    pk.crate.rotation.y = time * 2;
    pk.group.position.y = Math.sin(time * 3 + pk.x) * 0.12;
    if (Math.abs(pk.z - squad.z) < 1.2 && Math.abs(pk.x - squad.x) < pickR) {
      applyPickup(pk.type);
      spawnBurst(pk.x, 1.2, pk.z, ITEMS[pk.type].color, 18, 5, 0.5);
      pickupGroup.remove(pk.group);
      pickups.splice(i, 1);
    }
  }

  // ---- 僵尸：生成即追击，手臂朝向小队；每种类型有专属技能
  // 后期基础速度贴着小队跑（慢 1），前期保持原节奏；猎手冲刺等技能可追上
  const diff = diffAt(state.dist);
  const zSpeed = Math.min(3.4 + diff * 0.55, squad.speed - 1);
  const frozen = state.freezeTime > 0;
  for (let i = zombies.length - 1; i >= 0; i--) {
    const zb = zombies[i];
    const t = ZOMBIE_TYPES[zb.type];
    const dx = squad.x - zb.x;
    const dz = squad.z - zb.z;
    const len = Math.hypot(dx, dz) || 1;

    // ---- 类型技能（冰冻时全部停摆）
    if (!frozen) zb.skillT -= dt;
    let skillSpeedMul = frozen ? 0 : 1;
    if (frozen) {
      // 冻结中：不移动、不放技能，但照常挨打
    } else if (zb.type === 'normal') {
      // 暴走：逼近后短暂提速
      if (len < 13) skillSpeedMul = 1.4;
    } else if (zb.type === 'hunter') {
      // 突进：周期性猛冲，冲刺时留下红色残影
      if (zb.skillT <= 0) zb.skillT = 2.6 + Math.random();
      if (zb.skillT < 0.7) {
        skillSpeedMul = 2.6;
        if (Math.random() < 0.3) spawnBurst(zb.x, 0.6, zb.z, 0xc4553c, 3, 1, 0.25);
      }
    } else if (zb.type === 'butcher') {
      // 投掷兽颅：中远距离抡起兽颅砸向小队（后期频率随距离加快）
      if (zb.skillT <= 0 && len > 8 && len < 34) {
        zb.skillT = Math.max(1.6, 4 + Math.random() * 2 - diff * 0.04);
        throwSkull(zb.x, 1.6 * zb.scale, zb.z, 0.045);
      }
    } else if (zb.type === 'shadow') {
      // 潜行：周期性相位隐身，隐身时子弹打不中
      if (zb.skillT <= 0) {
        zb.hidden = !zb.hidden;
        zb.skillT = zb.hidden ? 1.2 : 1.8;
        spawnBurst(zb.x, 0.8, zb.z, 0x8a7ab8, 8, 2.5, 0.3);
      }
    } else if (zb.type === 'witch') {
      // 咒疗：周期性治疗周围僵尸
      if (zb.skillT <= 0 && len < 30) {
        zb.skillT = 4;
        let healed = false;
        for (const other of zombies) {
          if (other === zb || other.hp <= 0) continue;
          if (Math.hypot(other.x - zb.x, other.z - zb.z) < 5) {
            other.hp = Math.min(other.maxHp, other.hp + Math.max(1, other.maxHp * 0.35));
            healed = true;
          }
        }
        if (healed) spawnBurst(zb.x, 1.2, zb.z, 0x58e4a8, 16, 3.5, 0.5);
      }
    } else if (zb.type === 'banshee') {
      // 诱捕：放出蝙蝠把小队横向拽向自己
      if (zb.skillT <= 0 && len < 22) {
        zb.skillT = 5;
        state.pullX = zb.x;
        state.pullTime = 0.7;
        spawnBurst(zb.x, 1.5, zb.z, 0xc46aa8, 20, 4, 0.6);
        floatText(new THREE.Vector3(zb.x, 2.2, zb.z), '🦇 诱捕！', false);
        sfx.gateBad();
      }
    } else if (zb.type === 'infected') {
      // 被感染的士兵：保持距离，低射速朝人类开火
      if (len < 15) skillSpeedMul = 0; // 到达射程后站定
      if (zb.skillT <= 0 && len < 32) {
        zb.skillT = 2.4 + Math.random() * 1.6;
        const mx = zb.x + ((squad.x - zb.x) / len) * 0.5;
        const mz = zb.z + ((squad.z - zb.z) / len) * 0.5;
        spawnEnemyBullet(mx, 0.75, mz);
        spawnBurst(mx, 0.8, mz, 0xffb060, 4, 1.5, 0.15); // 枪口焰
        sfx.enemyShot(len);
      }
    }

    // 电击麻痹减速
    if (zb.slowT > 0) {
      zb.slowT -= dt;
      skillSpeedMul *= 0.3;
    }
    const sp = (zSpeed * t.speedMul + (zb.speedBonus ?? 0)) * skillSpeedMul;
    zb.x += (dx / len) * sp * dt;
    zb.z += (dz / len) * sp * dt;
    zb.rotY = Math.atan2(-dx, -dz); // 模型面朝 -z，此角度让它面向小队
    zb.y = 0;

    // 隐身状态不吃子弹
    if (!zb.hidden) {
      for (const b of bullets) {
        if (b.dead) continue;
        const hitR = (b.aoe > 0 ? 0.9 : 0.6) * Math.max(1, zb.scale * 0.8);
        if (Math.abs(b.z - zb.z) < hitR + 0.1 && Math.abs(b.x - zb.x) < hitR) {
          b.dead = true;
          zb.hp -= b.dmg;
          if (b.aoe > 0) {
            if (b.kind === 'rocket') {
              spawnBurst(b.x, 0.8, b.z, 0xff8a3a, 22, 7, 0.5);
              spawnBurst(b.x, 0.5, b.z, 0x555049, 10, 3, 0.7);
              sfx.explosion();
              state.shake = Math.min(0.4, state.shake + 0.06);
            } else if (Math.random() < 0.25) {
              spawnBurst(b.x, 0.7, b.z, 0xff9a3a, 6, 2.5, 0.3);
            }
            for (const other of zombies) {
              if (other === zb) continue;
              if (Math.hypot(other.x - b.x, other.z - b.z) < b.aoe) other.hp -= b.dmg;
            }
          }
          if (zb.hp <= 0) break;
        }
      }
    }
    if (zb.hp <= 0) {
      gore(zb.x, zb.z);
      sfx.zombieDie(Math.hypot(zb.x - squad.x, zb.z - squad.z));
      addKill();
      zombies.splice(i, 1);
      continue;
    }
    if (Math.abs(zb.z - squad.z) < 1.0 + squadRadius() * 0.6 &&
        Math.abs(zb.x - squad.x) < 0.9 + squadRadius() * 0.6) {
      zombies.splice(i, 1);
      spawnBurst(zb.x, 0.9, zb.z, state.shieldTime > 0 ? 0x58baff : 0xff5050, 14, 5, 0.4);
      // 接触损失按兵力百分比（后期大规模部队也有真实损耗）
      loseSoldiers(Math.max(1, Math.round(state.count * t.contactLoss)));
      if (state.phase === 'result') return;
    }
  }

  // 女妖诱捕的拖拽效果
  if (state.pullTime > 0) {
    state.pullTime -= dt;
    squad.targetX = THREE.MathUtils.clamp(
      squad.targetX + (state.pullX - squad.targetX) * Math.min(1, dt * 5),
      -SQUAD_X_LIMIT, SQUAD_X_LIMIT
    );
  }
  // AoE 溅射死亡统一清理
  for (let i = zombies.length - 1; i >= 0; i--) {
    if (zombies[i].hp <= 0) {
      gore(zombies[i].x, zombies[i].z);
      sfx.zombieDie(Math.hypot(zombies[i].x - squad.x, zombies[i].z - squad.z));
      addKill();
      zombies.splice(i, 1);
    }
  }
}

// ============================================================ 渲染循环
const soldierAgents = [];
const clock = new THREE.Clock();
const frameTimes = [];

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;

  // 自适应画质：持续掉帧则降低士兵渲染上限，恢复后回升
  frameTimes.push(dt);
  if (frameTimes.length > 60) frameTimes.shift();
  if (frameTimes.length === 60) {
    const avg = frameTimes.reduce((a, b) => a + b, 0) / 60;
    if (avg > 1 / 45) currentRenderCap = Math.max(800, currentRenderCap - 600);
    else if (avg < 1 / 58) currentRenderCap = Math.min(MAX_SOLDIER_RENDER, currentRenderCap + 600);
    frameTimes.length = 0;
  }

  updateChunks();

  if (state.phase === 'run') {
    updateRun(dt, time);
    updateBullets(dt);
    updateEnemyBullets(dt);
    updateSkulls(dt, time);
    updateZapLines(dt);
    updateHud();
  }
  updateBursts(dt);
  updateBloodPools(dt);

  soldierAgents.length = 0;
  const renderN = Math.min(state.count, currentRenderCap);
  const scale = formationScale(renderN);
  for (let i = 0; i < renderN; i++) {
    soldierAgents.push({
      x: squad.x + unitSpiral[i].dx * scale,
      z: squad.z + unitSpiral[i].dz * scale,
      rotY: 0,
      phase: i * 1.7,
      scale: 1,
    });
  }
  soldierCrowd.update(soldierAgents, time, 0.08, 11);
  // 按类型分桶渲染僵尸；暗影芭比隐身期间不渲染
  for (const key of ZOMBIE_TYPE_KEYS) zombieBuckets[key].length = 0;
  for (const zb of zombies) {
    if (zb.hidden) continue;
    zombieBuckets[zb.type].push(zb);
  }
  for (const key of ZOMBIE_TYPE_KEYS) {
    zombieCrowds[key].update(zombieBuckets[key], time, 0.05, key === 'hunter' ? 9 : 7);
  }

  shieldMesh.visible = state.shieldTime > 0 && state.phase === 'run';
  if (shieldMesh.visible) {
    const r = squadRadius() + 1.1;
    shieldMesh.scale.set(r, r * 0.8, r);
    shieldMesh.position.set(squad.x, 0.6, squad.z);
    shieldMesh.material.opacity = 0.16 + Math.sin(time * 6) * 0.06;
  }

  state.shake = Math.max(0, state.shake - dt * 1.2);
  const shx = (Math.random() - 0.5) * state.shake;
  const shy = (Math.random() - 0.5) * state.shake;
  camera.position.set(squad.x * 0.55 + shx, 8.8 + shy, squad.z + 11);
  camera.lookAt(squad.x * 0.55, 0.8, squad.z - 7);

  sun.position.set(squad.x + 12, 20, squad.z + 8);
  sun.target.position.set(squad.x, 0, squad.z - 5);

  renderer.render(scene, camera);
}

animate();

// 调试接口（控制台可用：__dbg.spawnWave() 等）
window.__dbg = { state, squad, throwSkull, spawnWave, applyPickup, openUpgradeChoice, getCoins, addCoins };
