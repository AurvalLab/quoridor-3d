import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { cellCenter, fenceOrientation, frameCamera, frameReferenceCamera, frameTopCamera, reverseRenderState, Scene, slotCenter, type RenderState } from '../src/scene';
import { rackLayout } from '../src/fence-box';
import { referenceFrame, referencePoint } from '../src/reference-projection';

describe('board views', () => {
  it('aligns the overhead grid and box positions for either player and viewport', () => {
    for (const [width, height] of [[1586, 992], [375, 812]]) for (const player of [0, 1] as const) {
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 80);
      frameTopCamera(camera, width, height, player);
      const frame = referenceFrame(width, height);
      for (const [x, z] of [[-4, -4], [0, 0], [4, 4], [-7.7, 4.65], [7.7, -1.9]]) {
        const point = new THREE.Vector3(x, 0.08, z).project(camera);
        const px = 791 + x * 652 / 9, py = 481 + z * 634 / 9;
        const expectedX = frame.x + (player ? 1586 - px : px) * frame.scale;
        const expectedY = frame.y + (player ? 992 - py : py) * frame.scale;
        expect((point.x + 1) * width / 2).toBeCloseTo(expectedX, 6);
        expect((1 - point.y) * height / 2).toBeCloseTo(expectedY, 6);
      }
    }
  });
  it('projects elevated objects straight down in the top view for both players', () => {
    for (const aspect of [375 / 812, 1440 / 900]) for (const player of [0, 1] as const) {
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 80);
      frameCamera(camera, aspect, 'top', player);
      const ground = new THREE.Vector3(3, 0.08, -2).project(camera);
      const raised = new THREE.Vector3(3, 1, -2).project(camera);
      expect(raised.x).toBeCloseTo(ground.x, 10);
      expect(raised.y).toBeCloseTo(ground.y, 10);
    }
  });
  it('aligns 3D pieces with the photographed board across the playing surface', () => {
    for (const [width, height] of [[1586, 992], [1920, 1080]]) {
      const camera = new THREE.PerspectiveCamera();
      frameReferenceCamera(camera, width, height);
      const frame = referenceFrame(width, height);
      for (const x of [-4.5, 0, 4.5]) for (const z of [-4.5, 0, 4.5]) {
        const projected = new THREE.Vector3(x, 0.08, z).project(camera);
        const expected = referencePoint(x, z);
        expect(Math.abs((projected.x + 1) * width / 2 - (frame.x + expected.x * frame.scale))).toBeLessThan(8 * frame.scale);
        expect(Math.abs((1 - projected.y) * height / 2 - (frame.y + expected.y * frame.scale))).toBeLessThan(8 * frame.scale);
      }
    }
  });
  it('picks up a 3D pawn by its head without snapping a carried piece', () => {
    vi.stubGlobal('innerWidth', 1440);
    vi.stubGlobal('innerHeight', 900);
    try {
      const camera = new THREE.PerspectiveCamera();
      frameCamera(camera, 1.6, 'angled');
      const pawn = new THREE.Mesh(new THREE.SphereGeometry(0.2), new THREE.MeshBasicMaterial());
      pawn.position.set(0, 0.9, 4);
      pawn.updateMatrixWorld();
      const scene = { reference: { enabled: false }, camera, pawns: [pawn], ndc: new THREE.Vector2(),
        ray: new THREE.Raycaster(), plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.08), hitV: new THREE.Vector3() } as unknown as Scene;
      const head = pawn.position.clone().project(camera);
      const sx = (head.x + 1) / 2, sy = (1 - head.y) / 2;
      expect(Scene.prototype.boardPoint.call(scene, sx, sy)).toEqual({ x: 0, z: 4 });
      expect(Scene.prototype.boardPoint.call(scene, sx, sy, false)!.z).not.toBeCloseTo(4, 2);
    } finally { vi.unstubAllGlobals(); }
  });
  it('reverses board and ownership consistently for Jade and reverses back', () => {
    const state: RenderState = { pawns: [{ c: 2, r: 1 }, { c: 6, r: 7 }], fences: [{ c: 1, r: 3, o: 'h', owner: 1 }],
      remaining: [9, 8], turn: 1, legal: [{ c: 6, r: 6 }], showLegal: true,
      drag: { kind: 'fence', o: 'h', x: 2, z: -1, legal: true, cell: null, slot: { c: 1, r: 3 }, owner: 1, manual: false },
      cursor: { x: 1, z: -2, pinch: 1 }, thinking: false, dt: 0, t: 0 };
    const reversed = reverseRenderState(state);
    expect(reversed.pawns).toEqual([{ c: 2, r: 1 }, { c: 6, r: 7 }]);
    expect(reversed.fences[0]).toEqual({ c: 6, r: 4, o: 'h', owner: 0 });
    expect(reversed.remaining).toEqual([8, 9]);
    expect(reverseRenderState(reversed)).toEqual(state);
  });
  it('puts each online player near the bottom in both views', () => {
    for (const view of ['angled', 'top'] as const) for (const player of [0, 1] as const) {
      const camera = new THREE.PerspectiveCamera();
      frameCamera(camera, 1.6, view, player);
      const own = cellCenter(4, player === 0 ? 0 : 8);
      const other = cellCenter(4, player === 0 ? 8 : 0);
      expect(new THREE.Vector3(own.x, 0.08, own.z).project(camera).y)
        .toBeLessThan(new THREE.Vector3(other.x, 0.08, other.z).project(camera).y);
    }
  });
  it('allows head pickup without snapping a carried pawn back to the photographed head', () => {
    const scene = { reference: { enabled: true, hitPawn: () => 0 } } as unknown as Scene;
    const pawns: [{ c: number; r: number }, { c: number; r: number }] = [{ c: 4, r: 1 }, { c: 4, r: 6 }];
    const target = cellCenter(4, 2);
    expect(Scene.prototype.classify.call(scene, target.x, target.z, pawns).cell).toEqual(pawns[0]);
    expect(Scene.prototype.classify.call(scene, target.x, target.z, pawns, false).cell).toEqual({ c: 4, r: 2 });
  });
  it('snaps near edge fence slots but not far outside the board', () => {
    const scene = { reference: { enabled: false } } as unknown as Scene;
    const pawns: [{ c: number; r: number }, { c: number; r: number }] = [{ c: 4, r: 0 }, { c: 4, r: 8 }];
    expect(Scene.prototype.classify.call(scene, -4.1, 3.5, pawns, false).slot).toEqual({ c: 0, r: 0 });
    expect(Scene.prototype.classify.call(scene, -4.5, 3.5, pawns, false).slot).toBeNull();
  });
  for (const [width, height] of [[320, 740], [375, 812], [768, 1024], [1440, 900], [2560, 1440]]) {
    for (const view of ['angled', 'top'] as const) {
      it(`fits and correctly aims in ${view} at ${width}×${height}`, () => {
        const camera = view === 'top' ? new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 80)
          : new THREE.PerspectiveCamera(32, 1, 0.1, 80);
        frameCamera(camera, width / height, view);
        const ray = new THREE.Raycaster();
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.08);
        const points = [];
        for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) points.push(cellCenter(c, r));
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) points.push(slotCenter(c, r));
        for (const [x, z] of [[5.2, 5.2]]) {
          for (const sx of [-1, 1]) for (const sz of [-1, 1]) points.push({ x: sx * x, z: sz * z });
        }
        for (const rack of rackLayout(width < height)) {
          for (const sx of [-1, 1]) for (const sz of [-1, 1]) points.push({ x: rack.x + sx * rack.hx, z: rack.z + sz * rack.hz });
        }
        for (const p of points) {
          const screen = new THREE.Vector3(p.x, 0.08, p.z).project(camera);
          expect(Math.abs(screen.x)).toBeLessThan(1);
          expect(Math.abs(screen.y)).toBeLessThan(1);
          ray.setFromCamera(new THREE.Vector2(screen.x, screen.y), camera);
          const hit = ray.ray.intersectPlane(plane, new THREE.Vector3())!;
          expect(hit.x).toBeCloseTo(p.x, 8);
          expect(hit.z).toBeCloseTo(p.z, 8);
        }
        const project = (x: number, z: number) => new THREE.Vector3(x, 0.08, z).project(camera);
        expect(project(0, 4).y).toBeLessThan(project(0, -4).y);
        if (view === 'top') {
          expect(camera.position.z).toBe(0);
          expect(project(1, 4).x).toBeCloseTo(project(1, -4).x, 8);
          expect((project(1, 0).x - project(0, 0).x) * width)
            .toBeCloseTo((project(0, 0).y - project(0, 1).y) * height, 8);
        }
      });
    }
  }

  it('uses a 50-degree angled view and leaves space below the board', () => {
    const camera = new THREE.PerspectiveCamera();
    frameCamera(camera, 1.6, 'angled');
    const direction = camera.getWorldDirection(new THREE.Vector3());
    expect(Math.atan2(-direction.y, Math.hypot(direction.x, direction.z)))
      .toBeCloseTo(THREE.MathUtils.degToRad(50), 10);
    expect(new THREE.Vector3(0, 0.08, 0).project(camera).y).toBeGreaterThan(0);
    expect(new THREE.Vector3(0, 0.08, 5.2).project(camera).y).toBeGreaterThan(-0.75);
  });
});

describe('automatic camera fence direction', () => {
  for (const slot of [{ c: 0, r: 0 }, { c: 3, r: 4 }, { c: 7, r: 7 }]) {
    it(`follows horizontal and vertical gaps at ${slot.c},${slot.r}`, () => {
      const { x, z } = slotCenter(slot.c, slot.r);
      expect(fenceOrientation(x + 0.3, z + 0.02, slot, 'v')).toBe('h');
      expect(fenceOrientation(x - 0.3, z - 0.02, slot, 'v')).toBe('h');
      expect(fenceOrientation(x + 0.02, z + 0.3, slot, 'h')).toBe('v');
      expect(fenceOrientation(x - 0.02, z - 0.3, slot, 'h')).toBe('v');
    });
  }

  it('preserves either direction at the intersection and through small jitter', () => {
    const slot = { c: 3, r: 4 };
    const { x, z } = slotCenter(slot.c, slot.r);
    for (const previous of ['h', 'v'] as const) {
      for (const [dx, dz] of [[0, 0], [0.06, 0.01], [-0.04, 0.08], [0.3, 0.32]]) {
        expect(fenceOrientation(x + dx, z + dz, slot, previous)).toBe(previous);
      }
    }
  });
});
