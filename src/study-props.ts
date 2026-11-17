import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { batchStatic } from './static-meshes';

/** Static desk objects stay outside the board and fence racks; none are input targets. */
export function studyProps(envMap: THREE.Texture) {
  const decor = new THREE.Group();
  decor.name = 'study-decoration';
  const brass = new THREE.MeshStandardMaterial({ color: 0xb69a60, metalness: 0.75, roughness: 0.3, envMap, envMapIntensity: 0.65 });
  const porcelain = new THREE.MeshPhysicalMaterial({ color: 0xe9e0ca, roughness: 0.22, clearcoat: 0.8, clearcoatRoughness: 0.15, envMap, envMapIntensity: 0.75 });
  const green = new THREE.MeshPhysicalMaterial({ color: 0x294c41, roughness: 0.32, clearcoat: 0.65, envMap, envMapIntensity: 0.65 });
  const paper = new THREE.MeshStandardMaterial({ color: 0xd8c7a6, roughness: 0.95 });
  const leather = new THREE.MeshStandardMaterial({ color: 0x263d32, roughness: 0.78 });
  const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = decor) => {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(x, y, z);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  };

  // Each player's tea stays in a corner, clear of the fence stacks.
  function teacup(x: number, z: number, rotation: number) {
    const tea = new THREE.Group();
    tea.name = z > 0 ? 'near-teacup' : 'far-teacup';
    tea.position.set(x, -0.345, z);
    tea.rotation.y = rotation;
    decor.add(tea);
    mesh(new THREE.CylinderGeometry(0.88, 0.8, 0.06, 40), porcelain, 0, 0.05, 0, tea);
    const saucerRim = mesh(new THREE.TorusGeometry(0.78, 0.018, 6, 48), brass, 0, 0.09, 0, tea);
    saucerRim.rotation.x = Math.PI / 2;
    const cupProfile = [[0, 0], [0.35, 0], [0.4, 0.06], [0.49, 0.48], [0.53, 0.57], [0.5, 0.6], [0.46, 0.56], [0.41, 0.14], [0, 0.13]];
    mesh(new THREE.LatheGeometry(cupProfile.map(([x, y]) => new THREE.Vector2(x, y)), 40), porcelain, 0, 0.1, 0, tea);
    const cupLip = mesh(new THREE.TorusGeometry(0.505, 0.012, 6, 48), brass, 0, 0.68, 0, tea);
    cupLip.rotation.x = Math.PI / 2;
    const handle = mesh(new THREE.TorusGeometry(0.24, 0.06, 8, 28), porcelain, 0.54, 0.4, 0, tea);
    handle.scale.set(0.8, 1.1, 1);
    mesh(new THREE.CylinderGeometry(0.435, 0.435, 0.008, 40), new THREE.MeshPhysicalMaterial({ color: 0x5a2c0c, roughness: 0.14, clearcoat: 1 }), 0, 0.58, 0, tea);
    const spoon = mesh(new THREE.CapsuleGeometry(0.025, 0.85, 3, 8), brass, 1.03, 0.12, 0.1, tea);
    spoon.rotation.set(Math.PI / 2, 0, -0.2);
    const bowl = mesh(new THREE.SphereGeometry(0.13, 12, 8), brass, 0.94, 0.12, -0.4, tea);
    bowl.scale.set(0.7, 0.2, 1.2);
    return tea;
  }
  const nearCup = teacup(-7.4, 1.65, 0.2);
  nearCup.scale.setScalar(0.72);
  nearCup.position.y = -0.32;
  const farCup = teacup(7.65, -4.8, Math.PI);
  farCup.scale.setScalar(0.6);
  farCup.position.y = -0.27;

  for (const [x, z, depth] of [[-7.05, 2.95, 5.1], [7.05, -3.5, 4.6]]) {
    const mat = new THREE.Group();
    mat.name = x < 0 ? 'near-player-mat' : 'far-player-mat';
    mat.userData.support = true;
    mat.position.set(x, -0.345, z);
    decor.add(mat);
    mesh(new RoundedBoxGeometry(2.65, 0.025, depth, 1, 0.08), brass, 0, 0.013, 0, mat);
    mesh(new RoundedBoxGeometry(2.59, 0.012, depth - 0.06, 1, 0.07), leather, 0, 0.032, 0, mat);
  }

  const tray = new THREE.Group();
  tray.name = 'tea-service-tray';
  tray.userData.support = true;
  tray.position.set(7.05, -0.345, -4.9);
  decor.add(tray);
  mesh(new RoundedBoxGeometry(2.67, 0.055, 1.65, 1, 0.08), brass, 0, 0.035, 0, tray);
  mesh(new RoundedBoxGeometry(2.55, 0.018, 1.53, 1, 0.07), leather, 0, 0.071, 0, tray);
  for (const side of [-1, 1]) {
    const handle = mesh(new THREE.TorusGeometry(0.2, 0.025, 6, 20, Math.PI), brass, side * 1.32, 0.09, 0, tray);
    handle.rotation.set(Math.PI / 2, 0, side * Math.PI / 2);
    handle.scale.x = 1.5;
  }

  const books = new THREE.Group();
  books.name = 'leather-books';
  books.position.set(-7.05, -0.345, -2.35);
  books.rotation.y = 0.33;
  books.scale.setScalar(0.74);
  decor.add(books);
  const cover = new THREE.MeshStandardMaterial({ color: 0x314b40, roughness: 0.8 });
  mesh(new RoundedBoxGeometry(1.75, 0.24, 2.55, 1, 0.035), paper, 0, 0.17, 0, books);
  for (const y of [0.025, 0.315]) mesh(new RoundedBoxGeometry(1.88, 0.05, 2.7, 1, 0.025), cover, 0, y, 0, books);
  mesh(new RoundedBoxGeometry(0.12, 0.34, 2.7, 1, 0.025), cover, -0.89, 0.17, 0, books);
  for (const z of [-0.95, 0.95]) mesh(new THREE.BoxGeometry(0.13, 0.01, 0.055), brass, -0.89, 0.345, z, books);
  const pen = mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.65, 12), brass, 0.12, 0.38, 0, books);
  pen.rotation.set(Math.PI / 2, 0, -0.24);
  const nib = mesh(new THREE.ConeGeometry(0.036, 0.18, 12), brass, -0.1, 0.38, 0.86, books);
  nib.rotation.x = Math.PI / 2;

  // A compact, asymmetric jade plant: branches and leaves share geometries and materials.
  const plant = new THREE.Group();
  plant.name = 'jade-plant';
  plant.position.set(7.1, -0.345, 3.7);
  plant.scale.setScalar(0.72);
  decor.add(plant);
  mesh(new THREE.CylinderGeometry(0.8, 0.69, 0.08, 32), porcelain, 0, 0.04, 0, plant);
  const potProfile = [[0, 0], [0.5, 0], [0.58, 0.08], [0.68, 0.88], [0.7, 0.98], [0.61, 0.98], [0.58, 0.84], [0, 0.1]];
  mesh(new THREE.LatheGeometry(potProfile.map(([x, y]) => new THREE.Vector2(x, y)), 32), green, 0, 0.08, 0, plant);
  mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.04, 24), new THREE.MeshStandardMaterial({ color: 0x30281f, roughness: 1 }), 0, 0.96, 0, plant);
  const stem = new THREE.MeshStandardMaterial({ color: 0x5c6040, roughness: 0.9 });
  const leafMat = new THREE.MeshPhysicalMaterial({ color: 0x3d6544, roughness: 0.47, clearcoat: 0.25 });
  const leafGeo = new THREE.SphereGeometry(1, 12, 8);
  for (let branch = 0; branch < 4; branch++) {
    const angle = branch * 2.1;
    const length = 1.25 + branch * 0.17;
    const axis = new THREE.Group();
    axis.position.set(0, 0.95, 0);
    axis.rotation.set(Math.sin(angle) * 0.45, angle, Math.cos(angle) * 0.33);
    plant.add(axis);
    mesh(new THREE.CylinderGeometry(0.025, 0.055, length, 7), stem, 0, length / 2, 0, axis);
    for (let i = 0; i < 4; i++) {
      const side = i % 2 ? -1 : 1;
      const leaf = mesh(leafGeo, leafMat, side * 0.22, 0.38 + i * length * 0.19, Math.sin(i * 2.3) * 0.14, axis);
      leaf.scale.set(0.32 - i * 0.025, 0.07, 0.19);
      leaf.rotation.z = side * 0.35;
      leaf.rotation.y = i * 1.3;
    }
  }

  const pot = new THREE.Group();
  pot.name = 'porcelain-teapot';
  pot.position.set(6.45, -0.27, -5.0);
  pot.rotation.y = 0.3;
  pot.scale.setScalar(0.64);
  decor.add(pot);
  mesh(new THREE.CylinderGeometry(0.34, 0.32, 0.08, 24), porcelain, 0, 0.04, 0, pot);
  const potBody = [[0, 0], [0.32, 0], [0.45, 0.1], [0.61, 0.45], [0.57, 0.7], [0.39, 0.87], [0.34, 0.9]];
  mesh(new THREE.LatheGeometry(potBody.map(([x, y]) => new THREE.Vector2(x, y)), 32), porcelain, 0, 0.08, 0, pot);
  mesh(new THREE.CylinderGeometry(0.4, 0.42, 0.055, 32), brass, 0, 0.98, 0, pot);
  const lid = mesh(new THREE.SphereGeometry(0.4, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), porcelain, 0, 1.0, 0, pot);
  lid.scale.y = 0.35;
  mesh(new THREE.SphereGeometry(0.075, 12, 8), green, 0, 1.19, 0, pot);
  const potHandle = mesh(new THREE.TorusGeometry(0.35, 0.065, 8, 32), porcelain, 0.6, 0.58, 0, pot);
  potHandle.scale.x = 0.75;
  const spout = new THREE.CubicBezierCurve3(new THREE.Vector3(-0.4, 0.35, 0), new THREE.Vector3(-0.85, 0.3, 0), new THREE.Vector3(-0.85, 0.9, 0), new THREE.Vector3(-1.0, 0.93, 0));
  mesh(new THREE.TubeGeometry(spout, 16, 0.09, 10, false), porcelain, 0, 0, 0, pot);
  for (const y of [0.2, 0.88]) {
    const band = mesh(new THREE.TorusGeometry(y < 0.5 ? 0.46 : 0.39, 0.012, 6, 32), brass, 0, y, 0, pot);
    band.rotation.x = Math.PI / 2;
  }

  const candle = new THREE.Group();
  candle.name = 'brass-candelabra';
  candle.position.set(-7.1, -0.345, -4.8);
  candle.scale.setScalar(0.82);
  decor.add(candle);
  mesh(new THREE.CylinderGeometry(0.37, 0.46, 0.09, 24), brass, 0, 0.055, 0, candle);
  mesh(new THREE.CylinderGeometry(0.085, 0.16, 1.05, 16), brass, 0, 0.62, 0, candle);
  mesh(new THREE.SphereGeometry(0.13, 16, 10), brass, 0, 0.87, 0, candle);
  const wax = new THREE.MeshStandardMaterial({ color: 0xe9d7b1, roughness: 0.85 });
  const wick = new THREE.MeshStandardMaterial({ color: 0x34271c });
  const flame = new THREE.MeshBasicMaterial({ color: 0xffd68a });
  for (const side of [-1, 0, 1]) {
    const x = side * 0.7, y = side === 0 ? 1.27 : 1.05;
    if (side !== 0) {
      const arm = new THREE.CubicBezierCurve3(new THREE.Vector3(0, 0.62, 0), new THREE.Vector3(x, 0.45, 0), new THREE.Vector3(x, 0.75, 0), new THREE.Vector3(x, y, 0));
      mesh(new THREE.TubeGeometry(arm, 12, 0.04, 8, false), brass, 0, 0, 0, candle);
    }
    mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.06, 20), brass, x, y, 0, candle);
    mesh(new THREE.CylinderGeometry(0.07, 0.075, 0.63, 16), wax, x, y + 0.33, 0, candle);
    mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.05, 6), wick, x, y + 0.67, 0, candle);
    const tip = mesh(new THREE.SphereGeometry(1, 10, 8), flame, x, y + 0.77, 0, candle);
    tip.scale.set(0.045, 0.105, 0.045);
    tip.castShadow = false;
  }

  const handMat = new THREE.MeshStandardMaterial({ color: 0x263b32, roughness: 0.5 });
  const watch = new THREE.Group();
  watch.name = 'pocket-watch';
  watch.position.set(-6.35, -0.32, 1.65);
  watch.rotation.y = -0.3;
  watch.scale.setScalar(0.75);
  decor.add(watch);
  mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 32), brass, 0, 0.055, 0, watch);
  mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.012, 32), porcelain, 0, 0.092, 0, watch);
  const watchRing = mesh(new THREE.TorusGeometry(0.075, 0.018, 6, 16), brass, 0, 0.06, -0.37, watch);
  watchRing.rotation.x = Math.PI / 2;
  mesh(new THREE.BoxGeometry(0.02, 0.01, 0.19), handMat, 0, 0.104, -0.06, watch);
  mesh(new THREE.BoxGeometry(0.14, 0.01, 0.02), handMat, 0.055, 0.105, 0, watch);
  const chain = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.05, -0.4), new THREE.Vector3(0.35, 0.03, -0.68), new THREE.Vector3(0.65, 0.03, -0.35), new THREE.Vector3(0.5, 0.03, 0.1)]);
  mesh(new THREE.TubeGeometry(chain, 28, 0.014, 6, false), brass, 0, 0, 0, watch);
  for (const object of decor.children) if (object instanceof THREE.Group) batchStatic(object);
  return decor;
}
