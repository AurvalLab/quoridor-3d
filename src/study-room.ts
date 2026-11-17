import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { batchStatic } from './static-meshes';

export function layoutStudyRoom(room: THREE.Group, portrait: boolean) {
  const chair = room.getObjectByName('near-player-chair')!;
  chair.position.z = portrait ? 8 : 6.25;
  chair.scale.y = portrait ? 1 : 1.08;
  room.getObjectByName('walnut-games-table')!.scale.z = portrait ? 1.15 : 1;
}

/** Furniture has the same tabletop height as the board's original support. */
export function studyRoom(wood: THREE.Texture, envMap: THREE.Texture) {
  const room = new THREE.Group();
  room.name = 'study-room';
  const walnut = new THREE.MeshStandardMaterial({ map: wood, color: 0xd1b49a, roughness: 0.43 });
  const darkWood = new THREE.MeshStandardMaterial({ map: wood, color: 0x79553a, roughness: 0.48 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xa88b52, metalness: 0.72, roughness: 0.36, envMap, envMapIntensity: 0.5 });
  const leather = new THREE.MeshStandardMaterial({ color: 0x203b32, roughness: 0.62 });
  const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = room) => {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(x, y, z);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  };
  const box = (w: number, h: number, d: number, radius: number, material: THREE.Material, x: number, y: number, z: number, parent = room) =>
    mesh(new RoundedBoxGeometry(w, h, d, 1, radius), material, x, y, z, parent);

  const floorMap = wood.clone();
  floorMap.wrapS = floorMap.wrapT = THREE.RepeatWrapping;
  floorMap.repeat.set(3, 32);
  const floor = new THREE.InstancedMesh(new THREE.BoxGeometry(2.4, 0.08, 160), new THREE.MeshStandardMaterial({ map: floorMap, color: 0xbeb3a2, roughness: 0.9 }), 24);
  floor.name = 'floorboards';
  const stamp = new THREE.Object3D();
  for (let i = 0; i < 24; i++) {
    stamp.position.set((i - 11.5) * 2.42, -4.57, 0);
    stamp.updateMatrix();
    floor.setMatrixAt(i, stamp.matrix);
    floor.setColorAt(i, new THREE.Color().setScalar(0.7 + (i % 4) * 0.05));
  }
  floor.receiveShadow = true;
  room.add(floor);

  const rugBorder = new THREE.MeshStandardMaterial({ color: 0x756346, roughness: 1 });
  const rugGreen = new THREE.MeshStandardMaterial({ color: 0x23362f, roughness: 1 });
  const rug = box(23.2, 0.035, 20.3, 0.08, rugBorder, 0, -4.505, 0);
  rug.name = 'woven-rug';
  rug.castShadow = false;
  box(22.9, 0.012, 20, 0.06, rugGreen, 0, -4.48, 0).castShadow = false;
  box(21.7, 0.012, 18.8, 0.05, rugBorder, 0, -4.468, 0).castShadow = false;
  box(21.55, 0.012, 18.65, 0.05, rugGreen, 0, -4.456, 0).castShadow = false;
  const weave = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.012, 0.2), rugBorder, 84);
  let stitch = 0;
  for (const side of [-1, 1]) {
    for (let i = 0; i < 24; i++) {
      stamp.position.set((i - 11.5) * 0.9, -4.46, side * 9.65);
      stamp.rotation.y = Math.PI / 4;
      stamp.updateMatrix();
      weave.setMatrixAt(stitch++, stamp.matrix);
    }
    for (let i = 0; i < 18; i++) {
      stamp.position.set(side * 11.15, -4.46, (i - 8.5) * 1.02);
      stamp.updateMatrix();
      weave.setMatrixAt(stitch++, stamp.matrix);
    }
  }
  room.add(weave);

  const table = new THREE.Group();
  table.name = 'walnut-games-table';
  room.add(table);
  box(17.45, 0.16, 12.55, 0.15, darkWood, 0, -0.83, 0, table);
  box(17.3, 0.4, 12.4, 0.14, walnut, 0, -0.59, 0, table);
  box(17.15, 0.065, 12.25, 0.12, walnut, 0, -0.3775, 0, table);
  for (const side of [-1, 1]) {
    box(16.45, 0.012, 0.022, 0.005, brass, 0, -0.337, side * 5.93, table);
    box(0.022, 0.012, 11.87, 0.005, brass, side * 8.22, -0.337, 0, table);
    box(15.6, 0.82, 0.22, 0.06, darkWood, 0, -1.31, side * 5.72, table);
    box(15.25, 0.035, 0.245, 0.01, brass, 0, -1.56, side * 5.72, table);
    box(0.22, 0.82, 11.45, 0.06, darkWood, side * 7.7, -1.31, 0, table);
    for (const x of [-5.8, -2.9, 0, 2.9, 5.8]) {
      box(2.55, 0.48, 0.035, 0.035, walnut, x, -1.28, side * 5.85, table);
      const diamond = mesh(new THREE.BoxGeometry(0.14, 0.14, 0.04), brass, x, -1.28, side * 5.88, table);
      diamond.rotation.z = Math.PI / 4;
    }
  }
  const legProfile = [[0.27, 0], [0.36, 0.12], [0.31, 0.28], [0.2, 0.45], [0.17, 1.1], [0.26, 1.65], [0.32, 1.85], [0.23, 2.15], [0.29, 2.5], [0.36, 2.6], [0.36, 3.55]];
  const legGeo = new THREE.LatheGeometry(legProfile.map(([x, y]) => new THREE.Vector2(x, y)), 24);
  for (const x of [-7.7, 7.7]) for (const z of [-5.65, 5.65]) {
    mesh(legGeo, darkWood, x, -4.45, z, table);
    for (const y of [-4.29, -2.63, -1.86]) mesh(new THREE.CylinderGeometry(0.325, 0.325, 0.055, 24), brass, x, y, z, table);
  }

  for (const side of [-1, 1]) {
    const chair = new THREE.Group();
    chair.name = side === 1 ? 'near-player-chair' : 'far-player-chair';
    chair.position.set(0, -4.45, side === 1 ? 6.25 : -6.85);
    chair.rotation.y = side === 1 ? 0 : Math.PI;
    if (side === 1) chair.scale.y = 1.08;
    room.add(chair);
    box(3.2, 0.25, 2.4, 0.12, darkWood, 0, 2.0, 0, chair);
    box(2.95, 0.25, 2.15, 0.12, leather, 0, 2.21, 0, chair);
    for (const x of [-1.25, 1.25]) for (const z of [-0.85, 0.85]) {
      mesh(new THREE.CylinderGeometry(0.09, 0.17, 1.95, 12), darkWood, x, 0.98, z, chair);
      mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.12, 12), brass, x, 0.1, z, chair);
    }
    box(3.15, 3.85, 0.26, 0.12, darkWood, 0, 4.25, 0.94, chair);
    box(2.72, 3.35, 0.12, 0.055, brass, 0, 4.27, 0.78, chair);
    box(2.61, 3.24, 0.19, 0.09, leather, 0, 4.27, 0.69, chair);
    // The reverse is upholstered too, so the near chair reads well from behind.
    box(2.68, 3.3, 0.1, 0.045, leather, 0, 4.27, 1.1, chair);
    for (const x of [-0.8, 0, 0.8]) for (const y of [3.35, 4.3, 5.25]) {
      mesh(new THREE.SphereGeometry(0.045, 8, 6), brass, x, y, 0.57, chair);
    }
    for (const x of [-1.45, 1.45]) mesh(new THREE.SphereGeometry(0.15, 12, 8), brass, x, 6.24, 0.94, chair);
    const crest = mesh(new THREE.TorusGeometry(0.3, 0.045, 8, 24), brass, 0, 6.17, 0.94, chair);
    crest.scale.y = 0.65;
  }
  for (const object of room.children) if (object instanceof THREE.Group) batchStatic(object);
  return room;
}
