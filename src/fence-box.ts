import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { batchStatic } from './static-meshes';
import type { Player } from './rules';

export const STOCK_PITCH = 0.22;
export const STOCK_Y = -0.155;
export const STOCK_HEIGHT = 0.6;
export const PLACED_FENCE_COLORS = ['#f2e9cf', '#68b4ad'] as const;
export type Rack = { player: Player; x: number; z: number; hx: number; hz: number; along: 'x' | 'z' };

export function rackLayout(portrait: boolean): Rack[] {
  return portrait ? [
    { player: 0, x: -1.55, z: 6.35, hx: 1.2, hz: 0.58, along: 'z' },
    { player: 1, x: 1.55, z: -6.35, hx: 1.2, hz: 0.58, along: 'z' },
  ] : [
    { player: 0, x: -7.05, z: 4.1, hx: 1.28, hz: 1.15, along: 'x' },
    { player: 1, x: 7.05, z: -2.55, hx: 1.28, hz: 1.15, along: 'x' },
  ];
}

export function stockOffset(index: number, portrait: boolean) {
  return (index - 4.5) * STOCK_PITCH * (portrait ? 0.45 : 1);
}

export function fenceBox(walnut: THREE.Material, brass: THREE.Material) {
  const box = new THREE.Group();
  box.name = 'slotted-fence-box';
  const lining = new THREE.MeshStandardMaterial({ color: 0x284438, roughness: 0.95 });
  const divider = new THREE.MeshStandardMaterial({ color: 0x3b5746, roughness: 0.9 });
  const part = (w: number, h: number, d: number, radius: number, material: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 1, radius), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    box.add(mesh);
    return mesh;
  };
  part(2.55, 0.1, 2.3, 0.055, walnut, 0, 0.05, 0);
  part(2.3, 0.025, 2.06, 0.025, lining, 0, 0.1175, 0);
  for (const side of [-1, 1]) {
    part(2.55, 0.2, 0.1, 0.035, walnut, 0, 0.2, side * 1.1);
    part(0.1, 0.2, 2.12, 0.035, walnut, side * 1.225, 0.2, 0);
    part(2.4, 0.012, 0.014, 0.005, brass, 0, 0.301, side * 1.105);
    part(0.014, 0.012, 2.12, 0.005, brass, side * 1.23, 0.301, 0);
  }
  for (let i = 0; i < 9; i++) part(0.028, 0.11, 2.0, 0.009, divider, (i - 4) * STOCK_PITCH, 0.185, 0);
  part(0.48, 0.09, 0.018, 0.025, brass, 0, 0.18, 1.155);
  for (const x of [-0.18, 0.18]) {
    const pin = new THREE.Mesh(new THREE.SphereGeometry(0.013, 8, 6), brass);
    pin.position.set(x, 0.18, 1.168);
    box.add(pin);
  }
  batchStatic(box);
  return box;
}
