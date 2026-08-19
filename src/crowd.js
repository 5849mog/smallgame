import * as THREE from 'three';

const _dummy = new THREE.Object3D();

/**
 * 用若干 InstancedMesh"零件"批量渲染一群小人（士兵/僵尸），
 * 每个个体只需提供 { x, z, rotY, phase, scale }，整体每帧只有几个 draw call。
 */
export class CrowdRenderer {
  constructor(scene, parts, maxCount) {
    this.maxCount = maxCount;
    this.meshes = parts.map((p) => {
      const mesh = new THREE.InstancedMesh(p.geometry, p.material, maxCount);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      mesh.userData.local = new THREE.Matrix4().compose(
        new THREE.Vector3(...p.position),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...(p.rotation ?? [0, 0, 0]))),
        new THREE.Vector3(1, 1, 1)
      );
      scene.add(mesh);
      return mesh;
    });
  }

  update(agents, time, bobAmp = 0.07, bobSpeed = 10) {
    const n = Math.min(agents.length, this.maxCount);
    for (const mesh of this.meshes) mesh.count = n;
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const a = agents[i];
      const bob = Math.abs(Math.sin(time * bobSpeed + a.phase)) * bobAmp;
      _dummy.position.set(a.x, (a.y ?? 0) + bob, a.z);
      _dummy.rotation.set(Math.sin(time * bobSpeed + a.phase) * 0.06, a.rotY ?? 0, 0);
      const s = a.scale ?? 1;
      _dummy.scale.set(s, s, s);
      _dummy.updateMatrix();
      for (const mesh of this.meshes) {
        m.multiplyMatrices(_dummy.matrix, mesh.userData.local);
        mesh.setMatrixAt(i, m);
      }
    }
    for (const mesh of this.meshes) mesh.instanceMatrix.needsUpdate = true;
  }

  setVisible(v) {
    for (const mesh of this.meshes) mesh.visible = v;
  }
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...opts });

export function soldierParts(gold = false) {
  if (gold) {
    // 黄金军团：付费外观，金属质感全金
    const g = (c) => mat(c, { metalness: 0.7, roughness: 0.3 });
    return [
      { geometry: box(0.34, 0.36, 0.22), material: g(0x9c7c1e), position: [0, 0.18, 0] },          // 腿
      { geometry: box(0.44, 0.4, 0.28), material: g(0xd4af37), position: [0, 0.56, 0] },           // 躯干
      { geometry: box(0.5, 0.1, 0.32), material: g(0x9c7c1e), position: [0, 0.4, 0] },             // 腰带
      { geometry: new THREE.SphereGeometry(0.15, 8, 8), material: g(0xbfa04a), position: [0, 0.88, 0] }, // 头
      { geometry: box(0.32, 0.13, 0.34), material: g(0xd4af37), position: [0, 0.99, 0] },          // 头盔
      { geometry: box(0.09, 0.1, 0.55), material: mat(0x6b5a20, { roughness: 0.4, metalness: 0.8 }), position: [0.16, 0.62, -0.18] }, // 枪
    ];
  }
  return [
    { geometry: box(0.34, 0.36, 0.22), material: mat(0x2a3550), position: [0, 0.18, 0] },          // 腿
    { geometry: box(0.44, 0.4, 0.28), material: mat(0x3f7bd9), position: [0, 0.56, 0] },           // 躯干
    { geometry: box(0.5, 0.1, 0.32), material: mat(0x2a3550), position: [0, 0.4, 0] },             // 腰带
    { geometry: new THREE.SphereGeometry(0.15, 8, 8), material: mat(0xf0c8a0), position: [0, 0.88, 0] }, // 头
    { geometry: box(0.32, 0.13, 0.34), material: mat(0x27406e), position: [0, 0.99, 0] },          // 头盔
    { geometry: box(0.09, 0.1, 0.55), material: mat(0x222226, { roughness: 0.4, metalness: 0.6 }), position: [0.16, 0.62, -0.18] }, // 枪
  ];
}

export function zombieParts(palette = {}) {
  const {
    legs = 0x3d4a2c,
    torso = 0x5c8a3c,
    head = 0x8fc46a,
    arms = 0x74a84e,
  } = palette;
  return [
    { geometry: box(0.36, 0.4, 0.24), material: mat(legs), position: [0, 0.2, 0] },            // 腿
    { geometry: box(0.5, 0.44, 0.32), material: mat(torso), position: [0, 0.62, 0] },          // 躯干
    { geometry: new THREE.SphereGeometry(0.17, 8, 8), material: mat(head), position: [0, 1.0, 0] }, // 头
    { geometry: box(0.1, 0.1, 0.5), material: mat(arms), position: [-0.2, 0.78, -0.3] },       // 左臂前伸
    { geometry: box(0.1, 0.1, 0.5), material: mat(arms), position: [0.2, 0.78, -0.3] },        // 右臂前伸
  ];
}

/** 被感染的士兵僵尸：残破军装 + 病变绿皮肤，仍然端着枪 */
export function infectedSoldierParts() {
  return [
    { geometry: box(0.34, 0.36, 0.22), material: mat(0x2c3328), position: [0, 0.18, 0] },          // 破烂军裤
    { geometry: box(0.44, 0.4, 0.28), material: mat(0x3e5a44), position: [0, 0.56, 0] },           // 染污军服
    { geometry: box(0.5, 0.1, 0.32), material: mat(0x252a22), position: [0, 0.4, 0] },             // 腰带
    { geometry: new THREE.SphereGeometry(0.15, 8, 8), material: mat(0x8fc46a), position: [0, 0.88, 0] }, // 病变头
    { geometry: box(0.32, 0.13, 0.34), material: mat(0x37432e), position: [0, 0.99, 0] },          // 破头盔
    { geometry: box(0.09, 0.1, 0.55), material: mat(0x1c1c20, { roughness: 0.4, metalness: 0.6 }), position: [0.16, 0.62, -0.18] }, // 枪
  ];
}

/** 士兵编队偏移：黄金角螺旋，队形紧凑均匀 */
export function formationOffsets(max) {
  const offsets = [];
  for (let i = 0; i < max; i++) {
    const r = 0.62 * Math.sqrt(i);
    const a = i * 2.39996;
    offsets.push({ dx: Math.cos(a) * r, dz: Math.sin(a) * r });
  }
  return offsets;
}
