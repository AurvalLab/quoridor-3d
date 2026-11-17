/**
 * Ivory and jade dice for the opening roll. Pips are small inlays on a
 * clear-coated cube, in the same material family as the pawns. Face values
 * match the axes in dice.ts, so the physical top face is the number we read.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { DIE_HALF } from './dice';

const SIZE = DIE_HALF * 2;
const PIP = 0.105;

const LAYOUT: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[-PIP, -PIP], [PIP, PIP]],
  3: [[-PIP, -PIP], [0, 0], [PIP, PIP]],
  4: [[-PIP, -PIP], [PIP, -PIP], [-PIP, PIP], [PIP, PIP]],
  5: [[-PIP, -PIP], [PIP, -PIP], [0, 0], [-PIP, PIP], [PIP, PIP]],
  6: [[-PIP, -PIP], [-PIP, 0], [-PIP, PIP], [PIP, -PIP], [PIP, 0], [PIP, PIP]],
};

/** Local +Y is 1, and opposites sum to 7, matching topFace() in dice.ts. */
const FACES: { n: [number, number, number]; u: [number, number, number]; v: [number, number, number]; value: number }[] = [
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], value: 1 },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1], value: 6 },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], value: 2 },
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0], value: 5 },
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0], value: 3 },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0], value: 4 },
];

function faceMaterials(): THREE.SpriteMaterial[] {
  return [1, 2, 3, 4, 5, 6].map(value => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const g = canvas.getContext('2d')!;
    g.fillStyle = 'rgba(20, 12, 8, 0.78)';
    g.beginPath();
    g.arc(64, 64, 48, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#f6efe2';
    g.font = '700 74px Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(value), 64, 70);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.generateMipmaps = false;
    map.minFilter = THREE.LinearFilter;
    map.magFilter = THREE.LinearFilter;
    map.needsUpdate = true;
    const material = new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false });
    material.toneMapped = false;
    return material;
  });
}

export interface OpeningDie {
  body: THREE.Group;
  label: THREE.Sprite;
}

export function createOpeningDice(): { dice: OpeningDie[]; faces: THREE.SpriteMaterial[] } {
  const faces = faceMaterials();
  const pipGeo = new THREE.SphereGeometry(0.04, 12, 8);
  const box = new RoundedBoxGeometry(SIZE, SIZE, SIZE, 2, 0.055);
  const dice: OpeningDie[] = [];
  for (const owner of [0, 0, 1, 1] as const) {
    const ivory = owner === 0 ? 0xf6f1e6 : 0x7fbfae;
    const ink = owner === 0 ? 0x2a2118 : 0x102820;
    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: ivory, roughness: 0.22, metalness: 0.04, clearcoat: 0.55, clearcoatRoughness: 0.18,
    });
    const pipMat = new THREE.MeshStandardMaterial({ color: ink, roughness: 0.38, metalness: 0.08 });
    const body = new THREE.Group();
    const shell = new THREE.Mesh(box, bodyMat);
    shell.castShadow = false;
    shell.receiveShadow = true;
    shell.layers.enable(1);
    body.add(shell);
    for (const face of FACES) {
      const n = new THREE.Vector3(...face.n);
      const u = new THREE.Vector3(...face.u);
      const v = new THREE.Vector3(...face.v);
      for (const [pu, pv] of LAYOUT[face.value]) {
        const pip = new THREE.Mesh(pipGeo, pipMat);
        pip.position.copy(n).multiplyScalar(SIZE / 2 + 0.012).addScaledVector(u, pu).addScaledVector(v, pv);
        pip.castShadow = false;
        pip.layers.enable(1);
        body.add(pip);
      }
    }
    body.visible = false;
    body.layers.enable(1);
    const label = new THREE.Sprite(faces[0]);
    label.scale.set(0.4, 0.4, 1);
    label.visible = false;
    label.layers.enable(1);
    label.renderOrder = 6;
    dice.push({ body, label });
  }
  return { dice, faces };
}
