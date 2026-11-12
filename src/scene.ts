/**
 * A walnut table, a maple board, two turned pawns and the fence stacks.
 * Screen position comes from the hand (already mapped through toScreen). A ray from that pixel
 * hits the board plane; the rules stay in grid cells, and this file only turns cells into wood.
 *
 * No post-processing. Shadows are real, and the shadow map is marked dirty once at setup so the
 * first frame is not a missing-sampler error.
 */
import * as THREE from 'three';
import type { Cell, Fence, Orientation, Player } from './rules';

const CELL = 1;
const SURFACE = 0.08;
export const RACKS: { player: Player; x: number; z: number; hx: number; hz: number; along: 'x' | 'z' }[] = [
  { player: 0, x: -6.2, z: 1.35, hx: 1.05, hz: 1.3, along: 'x' },
  { player: 1, x: 6.2, z: -1.35, hx: 1.05, hz: 1.3, along: 'x' },
];

const PALE = 0xe4c79a;
const DARK = 0x4a2e22;
const PALE_FENCE = 0xd7b184;
const DARK_FENCE = 0x7a5136;

export function cellCenter(c: number, r: number) {
  return { x: (c - 4) * CELL, z: (4 - r) * CELL };
}

export function slotCenter(c: number, r: number) {
  return { x: (c - 3.5) * CELL, z: (3.5 - r) * CELL };
}

export interface BoardHit {
  x: number;
  z: number;
  cell: Cell | null;
  slot: Cell | null;
  pawn: Player | null;
  stock: Player | null;
}

export interface DragView {
  kind: 'pawn' | 'fence';
  o: Orientation;
  x: number;
  z: number;
  legal: boolean;
  cell: Cell | null;
  slot: Cell | null;
  owner: Player;
  /** Right-click, R, or the button. While set, palm roll does not overwrite the orientation. */
  manual: boolean;
}

export interface RenderState {
  pawns: [Cell, Cell];
  fences: Fence[];
  remaining: [number, number];
  turn: Player;
  legal: Cell[];
  showLegal: boolean;
  drag: DragView | null;
  cursor: { x: number; z: number; pinch: number } | null;
  thinking: boolean;
  dt: number;
  t: number;
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c, g: c.getContext('2d')! };
}

function woodTexture(tint: [number, number, number], grooves: boolean): THREE.Texture {
  const S = 1024;
  const { c, g } = canvas(S, S);
  const img = g.createImageData(S, S);
  const d = img.data;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const wave = Math.sin(y * 0.016 + Math.sin(x * 0.007) * 1.6);
      const fine = Math.sin(y * 0.18 + x * 0.015);
      const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      const frac = n - Math.floor(n);
      const pore = frac > 0.992 ? -0.12 : 0;
      const v = 0.82 + wave * 0.028 + fine * 0.015 + (frac - 0.5) * 0.035 + pore;
      const i = (y * S + x) * 4;
      d[i] = tint[0] * v;
      d[i + 1] = tint[1] * v;
      d[i + 2] = tint[2] * v;
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  if (grooves) {
    g.fillStyle = 'rgba(62, 36, 18, 0.88)';
    for (let i = 1; i < 9; i++) {
      const p = (i / 9) * S;
      g.fillRect(p - 5, 22, 10, S - 44);
      g.fillRect(22, p - 5, S - 44, 10);
    }
    g.strokeStyle = 'rgba(90, 58, 32, 0.95)';
    g.lineWidth = 14;
    g.strokeRect(16, 16, S - 32, S - 32);
    g.strokeStyle = 'rgba(236, 214, 176, 0.35)';
    g.lineWidth = 4;
    g.strokeRect(28, 28, S - 56, S - 56);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function pawnGeometry(): THREE.LatheGeometry {
  const pts = [
    new THREE.Vector2(0.02, 0),
    new THREE.Vector2(0.26, 0),
    new THREE.Vector2(0.3, 0.05),
    new THREE.Vector2(0.2, 0.11),
    new THREE.Vector2(0.17, 0.24),
    new THREE.Vector2(0.23, 0.5),
    new THREE.Vector2(0.15, 0.64),
    new THREE.Vector2(0.2, 0.8),
    new THREE.Vector2(0.02, 0.9),
  ];
  return new THREE.LatheGeometry(pts, 28);
}

function backdrop(): THREE.Texture {
  const { c, g } = canvas(16, 512);
  const sky = g.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0, '#3a2a22');
  sky.addColorStop(0.45, '#241810');
  sky.addColorStop(1, '#140e0b');
  g.fillStyle = sky;
  g.fillRect(0, 0, 16, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Scene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(32, 1, 0.1, 80);
  aspect = 1;
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private hitV = new THREE.Vector3();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -SURFACE);
  private tmp = new THREE.Vector3();
  private key: THREE.DirectionalLight;
  private pawns: THREE.Mesh[] = [];
  private handPawn: THREE.Mesh;
  private ghostPawn: THREE.Mesh;
  private placed: THREE.Mesh[] = [];
  private stock: THREE.Mesh[][] = [[], []];
  private handFence: THREE.Mesh;
  private ghostFence: THREE.Mesh;
  private pips: THREE.Mesh[] = [];
  private ring: THREE.Mesh;
  private turnRing: THREE.Mesh;
  private fenceGeo: THREE.BoxGeometry;
  private trays: THREE.Mesh[] = [];

  constructor(el: HTMLElement, dprCap = 2) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, dprCap));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(this.renderer.domElement);
    this.scene.background = backdrop();

    const hemi = new THREE.HemisphereLight(0xffe7c8, 0x3a271c, 0.62);
    this.scene.add(hemi);
    this.key = new THREE.DirectionalLight(0xfff4e2, 2.55);
    this.key.position.set(-5.2, 11, 6.4);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(1024, 1024);
    this.key.shadow.camera.near = 2;
    this.key.shadow.camera.far = 32;
    this.key.shadow.camera.left = -10;
    this.key.shadow.camera.right = 10;
    this.key.shadow.camera.top = 10;
    this.key.shadow.camera.bottom = -10;
    this.key.shadow.bias = -0.00025;
    this.key.shadow.normalBias = 0.035;
    // A shadow light with no map yet makes every receiver fail the first draw.
    this.key.shadow.needsUpdate = true;
    this.scene.add(this.key);
    const fill = new THREE.DirectionalLight(0xd9c2a4, 0.45);
    fill.position.set(6, 5, 4);
    this.scene.add(fill);

    const tableMat = new THREE.MeshStandardMaterial({ map: woodTexture([96, 62, 40], false), roughness: 0.78, metalness: 0.02 });
    const table = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 0.55, 64), tableMat);
    table.position.y = -0.62;
    table.receiveShadow = true;
    this.scene.add(table);

    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(10.55, 0.46, 10.55),
      new THREE.MeshStandardMaterial({ map: woodTexture([112, 70, 42], false), roughness: 0.62, metalness: 0.04 }),
    );
    frame.position.y = -0.18;
    frame.castShadow = true;
    frame.receiveShadow = true;
    this.scene.add(frame);

    const top = new THREE.Mesh(
      new THREE.BoxGeometry(9.06, 0.1, 9.06),
      new THREE.MeshStandardMaterial({ map: woodTexture([214, 170, 112], true), roughness: 0.5, metalness: 0.03 }),
    );
    top.position.y = SURFACE - 0.05;
    top.receiveShadow = true;
    top.castShadow = true;
    this.scene.add(top);

    const pawnGeo = pawnGeometry();
    for (const color of [PALE, DARK]) {
      const mesh = new THREE.Mesh(pawnGeo, new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.05 }));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.pawns.push(mesh);
    }
    this.handPawn = new THREE.Mesh(pawnGeo, new THREE.MeshStandardMaterial({ color: PALE, roughness: 0.42, metalness: 0.05 }));
    this.handPawn.castShadow = true;
    this.handPawn.visible = false;
    this.scene.add(this.handPawn);
    this.ghostPawn = new THREE.Mesh(pawnGeo, new THREE.MeshStandardMaterial({
      color: 0x3cba6e, transparent: true, opacity: 0.4, roughness: 0.4, depthWrite: false,
    }));
    this.ghostPawn.visible = false;
    this.ghostPawn.renderOrder = 2;
    this.scene.add(this.ghostPawn);

    this.fenceGeo = new THREE.BoxGeometry(1.86, 0.72, 0.1);
    this.fenceGeo.translate(0, 0.36, 0);
    for (const rack of RACKS) {
      const tray = new THREE.Mesh(
        new THREE.BoxGeometry(1.55, 0.05, 2.3),
        new THREE.MeshStandardMaterial({ color: rack.player === 0 ? 0x8a6244 : 0x3d291c, roughness: 0.7 }),
      );
      tray.position.set(rack.x, SURFACE, rack.z);
      tray.receiveShadow = true;
      this.trays.push(tray);
      this.scene.add(tray);
      for (let i = 0; i < 10; i++) {
        const mesh = this.makeFence(rack.player === 0 ? PALE_FENCE : DARK_FENCE);
        mesh.castShadow = false;
        this.stock[rack.player].push(mesh);
        this.scene.add(mesh);
      }
    }
    this.handFence = this.makeFence(PALE_FENCE);
    this.handFence.visible = false;
    this.scene.add(this.handFence);
    this.ghostFence = this.makeFence(0x3cba6e);
    const ghostMat = this.ghostFence.material as THREE.MeshStandardMaterial;
    ghostMat.transparent = true;
    ghostMat.opacity = 0.45;
    ghostMat.depthWrite = false;
    this.ghostFence.visible = false;
    this.ghostFence.renderOrder = 2;
    this.scene.add(this.ghostFence);

    for (let i = 0; i < 8; i++) {
      const pip = new THREE.Mesh(
        new THREE.CylinderGeometry(0.075, 0.075, 0.025, 16),
        new THREE.MeshStandardMaterial({ color: 0xf0d7a4, roughness: 0.45, emissive: 0x6a4a22, emissiveIntensity: 0.25 }),
      );
      pip.visible = false;
      pip.castShadow = false;
      this.pips.push(pip);
      this.scene.add(pip);
    }

    this.turnRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.4, 0.018, 8, 40),
      new THREE.MeshStandardMaterial({ color: 0xf2d39a, emissive: 0xc48a3a, emissiveIntensity: 0.4, roughness: 0.4 }),
    );
    this.turnRing.rotation.x = Math.PI / 2;
    this.scene.add(this.turnRing);
    this.ring = new THREE.Mesh(
      new THREE.CircleGeometry(0.18, 32),
      new THREE.MeshBasicMaterial({ color: 0xfff1dc, transparent: true, opacity: 0, depthTest: false }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.renderOrder = 4;
    this.scene.add(this.ring);

    this.resize();
    this.renderer.compile(this.scene, this.camera);
  }

  private makeFence(color: number) {
    const mesh = new THREE.Mesh(this.fenceGeo, new THREE.MeshStandardMaterial({ color, roughness: 0.48, metalness: 0.04 }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    if (w < 2 || h < 2) return;
    this.aspect = w / h;
    this.renderer.setSize(w, h);
    const portrait = this.aspect < 1;
    this.layoutRacks(portrait);
    this.camera.fov = portrait ? 54 : 34;
    this.camera.aspect = this.aspect;
    const dist = portrait ? 21.6 : 17.6;
    this.camera.position.set(0.05, dist * (portrait ? 0.7 : 0.58), dist * (portrait ? 0.62 : 0.72));
    this.camera.lookAt(0, 0.1, portrait ? 0.45 : -0.05);
    this.camera.updateProjectionMatrix();
    this.key.shadow.needsUpdate = true;
  }

  /** Side stacks on a wide screen, baseline stacks on a phone, so both stay reachable. */
  private layoutRacks(portrait: boolean) {
    if (portrait) {
      Object.assign(RACKS[0], { x: -1.55, z: 5.85, hx: 1.3, hz: 0.85, along: 'z' });
      Object.assign(RACKS[1], { x: 1.55, z: -5.85, hx: 1.3, hz: 0.85, along: 'z' });
    } else {
      Object.assign(RACKS[0], { x: -6.2, z: 1.35, hx: 1.05, hz: 1.3, along: 'x' });
      Object.assign(RACKS[1], { x: 6.2, z: -1.35, hx: 1.05, hz: 1.3, along: 'x' });
    }
    RACKS.forEach((rack, i) => {
      const tray = this.trays[i];
      if (!tray) return;
      tray.position.set(rack.x, SURFACE, rack.z);
      tray.scale.set(rack.along === 'z' ? 2.35 / 1.55 : 1, 1, rack.along === 'z' ? 1.15 / 2.3 : 1);
    });
  }

  private project(x: number, z: number) {
    this.camera.updateMatrixWorld();
    this.tmp.set(x, SURFACE, z).project(this.camera);
    return { x: (this.tmp.x + 1) / 2, y: (1 - this.tmp.y) / 2 };
  }

  cellToScreen(c: number, r: number) {
    const p = cellCenter(c, r);
    return this.project(p.x, p.z);
  }

  slotToScreen(c: number, r: number) {
    const p = slotCenter(c, r);
    return this.project(p.x, p.z);
  }

  stockToScreen(player: Player) {
    const rack = RACKS[player];
    return this.project(rack.x, rack.z);
  }

  boardPoint(sx: number, sy: number): { x: number; z: number } | null {
    if (innerWidth < 2 || innerHeight < 2) return null;
    this.ndc.set(sx * 2 - 1, -(sy * 2 - 1));
    this.ray.setFromCamera(this.ndc, this.camera);
    const hit = this.ray.ray.intersectPlane(this.plane, this.hitV);
    if (!hit) return null;
    return { x: hit.x, z: hit.z };
  }

  classify(x: number, z: number, pawns: [Cell, Cell]): BoardHit {
    let cell: Cell | null = null;
    const cc = Math.round(x / CELL + 4);
    const rr = Math.round(4 - z / CELL);
    if (cc >= 0 && rr >= 0 && cc < 9 && rr < 9) {
      const p = cellCenter(cc, rr);
      if (Math.hypot(p.x - x, p.z - z) <= 0.72) cell = { c: cc, r: rr };
    }
    let slot: Cell | null = null;
    const sc = Math.round(x / CELL + 3.5);
    const sr = Math.round(3.5 - z / CELL);
    if (sc >= 0 && sr >= 0 && sc < 8 && sr < 8) {
      const p = slotCenter(sc, sr);
      if (Math.hypot(p.x - x, p.z - z) <= 0.78) slot = { c: sc, r: sr };
    }
    let stock: Player | null = null;
    for (const rack of RACKS) {
      if (Math.abs(x - rack.x) <= rack.hx && Math.abs(z - rack.z) <= rack.hz) stock = rack.player;
    }
    let pawn: Player | null = null;
    let pawnD = 0.52;
    for (const id of [0, 1] as const) {
      const p = cellCenter(pawns[id].c, pawns[id].r);
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < pawnD) { pawnD = d; pawn = id; }
    }
    return { x, z, cell, slot, pawn, stock };
  }

  render(s: RenderState) {
    if (innerWidth < 2 || innerHeight < 2) return;
    const draggingPawn = s.drag?.kind === 'pawn' ? s.drag.owner : null;
    for (let i = 0; i < 2; i++) {
      const mesh = this.pawns[i];
      const cell = s.pawns[i as Player];
      const p = cellCenter(cell.c, cell.r);
      mesh.visible = draggingPawn !== i;
      mesh.position.set(p.x, SURFACE, p.z);
    }
    if (s.drag?.kind === 'pawn') {
      this.handPawn.visible = true;
      const lost = !s.drag.cell;
      (this.handPawn.material as THREE.MeshStandardMaterial).color.set(lost ? 0xc4473a : s.drag.owner === 0 ? PALE : DARK);
      this.handPawn.position.set(s.drag.x, SURFACE + 0.72, s.drag.z);
    } else this.handPawn.visible = false;

    const showGhostPawn = s.drag?.kind === 'pawn' && s.drag.cell;
    this.ghostPawn.visible = !!showGhostPawn;
    if (s.drag?.kind === 'pawn' && s.drag.cell) {
      const p = cellCenter(s.drag.cell.c, s.drag.cell.r);
      this.ghostPawn.position.set(p.x, SURFACE, p.z);
      const mat = this.ghostPawn.material as THREE.MeshStandardMaterial;
      mat.color.set(s.drag.legal ? 0x3cba6e : 0xc4473a);
      mat.opacity = 0.38 + Math.sin(s.t * 5) * 0.06;
    }

    while (this.placed.length < s.fences.length) {
      const mesh = this.makeFence(PALE_FENCE);
      this.placed.push(mesh);
      this.scene.add(mesh);
    }
    for (let i = 0; i < this.placed.length; i++) {
      const mesh = this.placed[i];
      const f = s.fences[i];
      mesh.visible = !!f;
      if (!f) continue;
      const p = slotCenter(f.c, f.r);
      mesh.position.set(p.x, SURFACE, p.z);
      mesh.rotation.y = f.o === 'v' ? Math.PI / 2 : 0;
      (mesh.material as THREE.MeshStandardMaterial).color.set(f.owner === 0 ? PALE_FENCE : DARK_FENCE);
    }

    for (const id of [0, 1] as const) {
      const rack = RACKS[id];
      const held = s.drag?.kind === 'fence' && s.drag.owner === id ? 1 : 0;
      const n = Math.max(0, s.remaining[id] - held);
      for (let i = 0; i < 10; i++) {
        const mesh = this.stock[id][i];
        mesh.visible = i < n;
        const along = (i - (n - 1) / 2) * 0.13;
        if (rack.along === 'z') {
          mesh.position.set(rack.x, SURFACE, rack.z + along);
          mesh.rotation.y = 0;
        } else {
          mesh.position.set(rack.x + along, SURFACE, rack.z);
          mesh.rotation.y = Math.PI / 2;
        }
      }
    }

    if (s.drag?.kind === 'fence') {
      this.handFence.visible = true;
      this.handFence.position.set(s.drag.x, SURFACE + 0.7, s.drag.z);
      this.handFence.rotation.y = s.drag.o === 'v' ? Math.PI / 2 : 0;
      (this.handFence.material as THREE.MeshStandardMaterial).color.set(!s.drag.slot ? 0xc4473a : s.drag.owner === 0 ? PALE_FENCE : DARK_FENCE);
      this.ghostFence.visible = !!s.drag.slot;
      if (s.drag.slot) {
        const p = slotCenter(s.drag.slot.c, s.drag.slot.r);
        this.ghostFence.position.set(p.x, SURFACE, p.z);
        this.ghostFence.rotation.y = s.drag.o === 'v' ? Math.PI / 2 : 0;
        const mat = this.ghostFence.material as THREE.MeshStandardMaterial;
        mat.color.set(s.drag.legal ? 0x3cba6e : 0xc4473a);
        mat.opacity = 0.42 + Math.sin(s.t * 5) * 0.05;
      }
    } else {
      this.handFence.visible = false;
      this.ghostFence.visible = false;
    }

    for (let i = 0; i < this.pips.length; i++) {
      const cell = s.showLegal ? s.legal[i] : undefined;
      const pip = this.pips[i];
      pip.visible = !!cell;
      if (!cell) continue;
      const p = cellCenter(cell.c, cell.r);
      pip.position.set(p.x, SURFACE + 0.03, p.z);
    }

    const active = s.drag?.kind === 'pawn' ? null : s.pawns[s.turn];
    if (active && s.drag?.kind !== 'pawn') {
      const p = cellCenter(active.c, active.r);
      const pulse = 1 + Math.sin(s.t * 2.4) * 0.04;
      this.turnRing.visible = true;
      this.turnRing.position.set(p.x, SURFACE + 0.03, p.z);
      this.turnRing.scale.setScalar(s.thinking ? pulse * 1.08 : pulse);
    } else this.turnRing.visible = false;

    const rm = this.ring.material as THREE.MeshBasicMaterial;
    const target = s.cursor ? 0.9 : 0;
    rm.opacity += (target - rm.opacity) * Math.min(1, s.dt * 10);
    if (s.cursor) {
      this.ring.position.set(s.cursor.x, SURFACE + 0.04, s.cursor.z);
      const size = 1 - Math.min(1, s.cursor.pinch) * 0.35;
      this.ring.scale.setScalar(size);
      const legal = s.drag ? s.drag.legal : null;
      rm.color.set(legal === null ? 0xfff1dc : legal ? 0x8ee0b0 : 0xf0a090);
    }
    this.renderer.render(this.scene, this.camera);
  }
}
