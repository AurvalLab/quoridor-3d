import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { cellCenter, frameCamera, slotCenter } from '../src/scene';
import { studyProps } from '../src/study-props';
import { layoutStudyRoom, studyRoom } from '../src/study-room';
import { fenceBox, rackLayout, stockSlot, STOCK_HEIGHT, STOCK_Y } from '../src/fence-box';

const room = studyRoom(new THREE.Texture(), new THREE.Texture());
const decor = studyProps(new THREE.Texture());
room.updateMatrixWorld(true);
decor.updateMatrixWorld(true);

describe('classical table scene', () => {
  it('supports the board at its original height and has two opposing seats', () => {
    const ray = new THREE.Raycaster(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0));
    expect(ray.intersectObject(room, true)[0].point.y).toBeCloseTo(-0.345, 5);
    const near = room.getObjectByName('near-player-chair')!;
    const far = room.getObjectByName('far-player-chair')!;
    expect(near.position.z).toBeGreaterThan(0);
    expect(far.position.z).toBeLessThan(0);
    expect(far.rotation.y - near.rotation.y).toBeCloseTo(Math.PI);
  });

  it('keeps decorations on the tabletop and outside the board and stock footprints', () => {
    const board = { minX: -5.675, maxX: 5.675, minZ: -5.675, maxZ: 5.675 };
    const racks = rackLayout(false).map((r) => ({ minX: r.x - r.hx, maxX: r.x + r.hx, minZ: r.z - r.hz, maxZ: r.z + r.hz }));
    for (const prop of decor.children) {
      const bounds = new THREE.Box3().setFromObject(prop, true);
      expect(bounds.min.y, prop.name).toBeGreaterThanOrEqual(-0.346);
      expect(Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x)), prop.name).toBeLessThan(8.575);
      expect(Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z)), prop.name).toBeLessThan(6.125);
      for (const target of [board, ...(prop.userData.support ? [] : racks)]) {
        const overlaps = bounds.min.x < target.maxX && bounds.max.x > target.minX && bounds.min.z < target.maxZ && bounds.max.z > target.minZ;
        expect(overlaps, prop.name).toBe(false);
      }
    }
  });

  for (const aspect of [320 / 740, 375 / 812, 768 / 1024, 1440 / 900, 2560 / 1440]) {
    for (const view of ['angled', 'top'] as const) {
      it(`leaves every cell, slot and rack unobscured in ${view} at aspect ${aspect}`, () => {
        const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 80);
        frameCamera(camera, aspect, view);
        layoutStudyRoom(room, aspect < 1);
        room.updateMatrixWorld(true);
        const points = [];
        for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) points.push(cellCenter(c, r));
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) points.push(slotCenter(c, r));
        points.push(...rackLayout(aspect < 1));
        const ray = new THREE.Raycaster();
        const obstacles = aspect < 1 ? room.children : [...room.children, ...decor.children];
        for (const p of points) {
          const target = new THREE.Vector3(p.x, 0.08, p.z);
          const projected = target.clone().project(camera);
          ray.setFromCamera(new THREE.Vector2(projected.x, projected.y), camera);
          const distance = ray.ray.origin.distanceTo(target);
          expect(ray.intersectObjects(obstacles, true).some((hit) => hit.distance < distance - 0.001), `${p.x},${p.z}`).toBe(false);
        }
      });
    }
  }
});

describe('slotted fence coffers', () => {
  for (const portrait of [false, true]) {
    it(`supports ten distinct fixed slots inside each ${portrait ? 'portrait' : 'landscape'} coffer`, () => {
      const boxes = rackLayout(portrait);
      const table = room.getObjectByName('walnut-games-table')!;
      layoutStudyRoom(room, portrait);
      room.updateMatrixWorld(true);
      const tableBounds = new THREE.Box3().setFromObject(table, true);
      for (const rack of boxes) {
        const box = fenceBox(new THREE.MeshStandardMaterial(), new THREE.MeshStandardMaterial());
        box.position.set(rack.x, -0.345, rack.z);
        box.rotation.y = portrait ? Math.PI / 2 : 0;
        box.scale.x = portrait ? 0.45 : 1;
        box.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(box, true);
        expect(bounds.min.x).toBeGreaterThan(tableBounds.min.x);
        expect(bounds.max.x).toBeLessThan(tableBounds.max.x);
        expect(bounds.min.z).toBeGreaterThan(tableBounds.min.z);
        expect(bounds.max.z).toBeLessThan(tableBounds.max.z);
        const centres = new Set<number>();
        const slots = Array.from({ length: 10 }, (_, i) => stockSlot(rack, i));
        for (let i = 0; i < 10; i++) {
          const slot = slots[i];
          const p = new THREE.Vector3(slot.x, STOCK_Y, slot.z);
          expect(bounds.containsPoint(p)).toBe(true);
          centres.add(rack.along === 'z' ? slot.z : slot.x);
          if (i < 9) {
            const next = slots[i + 1];
            expect(Math.hypot(next.x, next.z)).toBeLessThan(Math.hypot(slot.x, slot.z));
          }
        }
        expect(centres.size).toBe(10);
        expect(STOCK_Y + 0.64 * STOCK_HEIGHT).toBeLessThan(0.3);
      }
    });
  }
});
