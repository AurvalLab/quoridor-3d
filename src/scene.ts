/**
 * A walnut table, a maple board, two turned pawns and the fence stacks.
 * Screen position comes from the hand (already mapped through toScreen). A ray from that pixel
 * hits the board plane; the rules stay in grid cells, and this file only turns cells into wood.
 *
 * No post-processing. Shadows are real, and the shadow map is marked dirty once at setup so the
 * first frame is not a missing-sampler error.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { Cell, Fence, Orientation, Player } from './rules';
import { studyProps } from './study-props';
import { layoutStudyRoom, studyRoom } from './study-room';
import { fenceBox, rackLayout, STOCK_HEIGHT, STOCK_Y, stockOffset, PLACED_FENCE_COLORS } from './fence-box';
import { ReferenceScene } from './reference-scene';
import { TopScene } from './top-scene';
import { referenceFrame, referencePoint, referenceStockAt, referenceWorld, REFERENCE_STOCK, REFERENCE_WIDTH, REFERENCE_HEIGHT } from './reference-projection';
import { flipDiePose, type DiePose } from './dice';
import { createOpeningDice, type OpeningDie } from './dice-mesh';

const CELL = 1;
const SURFACE = 0.08;
export const RACKS = rackLayout(false);

const PALE = 0xeee5cf;
const DARK = 0x294b40;
const PALE_FENCE = 0xac8051;
const DARK_FENCE = 0x514335;

export function cellCenter(c: number, r: number) {
  return { x: (c - 4) * CELL, z: (4 - r) * CELL };
}

export function slotCenter(c: number, r: number) {
  return { x: (c - 3.5) * CELL, z: (3.5 - r) * CELL };
}

export type BoardView = 'angled' | 'top';

export function frameCamera(camera: THREE.PerspectiveCamera | THREE.OrthographicCamera, aspect: number, view: BoardView, player: Player = 0) {
  const portrait = aspect < 1;
  const fov = portrait ? 54 : 34;
  if (camera instanceof THREE.PerspectiveCamera) { camera.fov = fov; camera.aspect = aspect; }
  const sin = view === 'top' ? 1 : Math.sin(THREE.MathUtils.degToRad(50));
  const cos = view === 'top' ? 0 : Math.cos(THREE.MathUtils.degToRad(50));
  const tan = Math.tan(THREE.MathUtils.degToRad(fov / 2));
  const rackX = portrait ? 2.9 : 8.35, rackZ = portrait ? 6.95 : 5.25;
  // Fit the board frame and both stacks, including perspective at the near edge.
  const distance = 1.08 * Math.max(
    5.2 / (tan * aspect) + 5.2 * cos, 5.2 * sin / tan + 5.2 * cos,
    rackX / (tan * aspect) + rackZ * cos, rackZ * sin / tan + rackZ * cos,
  );
  if (camera instanceof THREE.OrthographicCamera) {
    camera.top = distance * tan; camera.bottom = -camera.top;
    camera.right = camera.top * aspect; camera.left = -camera.right;
  }
  // Aim slightly toward the near baseline to leave more table below the angled board.
  const direction = player === 0 ? 1 : -1;
  const targetZ = view === 'top' ? 0 : 0.5 * direction;
  camera.position.set(0, SURFACE + distance * sin, targetZ + distance * cos * direction);
  // Negative Z stays at the top, including when looking straight down.
  camera.up.set(0, 0, -direction);
  camera.lookAt(0, SURFACE, targetZ);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}

export function frameReferenceCamera(camera: THREE.PerspectiveCamera, width: number, height: number) {
  const frame = referenceFrame(width, height);
  const farWidth = 623, nearWidth = 790;
  const ratio = 4.5 * (nearWidth + farWidth) / (nearWidth - farWidth);
  const focalOverDistance = farWidth / 9 * (1 + 4.5 / ratio);
  const sin = 529 * (1 - (4.5 / ratio) ** 2) / (9 * focalOverDistance);
  const cos = Math.sqrt(1 - sin * sin), distance = ratio * cos;
  const focal = focalOverDistance * distance;
  const center = referencePoint(0, 0);
  camera.aspect = width / height;
  camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(height / (2 * focal * frame.scale)));
  camera.position.set(0, SURFACE + distance * sin, distance * cos);
  camera.up.set(0, 1, 0);
  camera.lookAt(0, SURFACE, 0);
  camera.updateProjectionMatrix();
  camera.projectionMatrix.elements[8] = -(2 * (frame.x + center.x * frame.scale) / width - 1);
  camera.projectionMatrix.elements[9] = -(1 - 2 * (frame.y + center.y * frame.scale) / height);
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  camera.updateMatrixWorld();
}

/** Align the orthographic scene with the grid in the overhead artwork. */
export function frameTopCamera(camera: THREE.OrthographicCamera, width: number, height: number, player: Player) {
  const frame = referenceFrame(width, height);
  const cx = frame.x + (player ? 1586 - 791 : 791) * frame.scale;
  const cy = frame.y + (player ? 992 - 481 : 481) * frame.scale;
  const sx = 652 / 9 * frame.scale, sy = 634 / 9 * frame.scale;
  camera.left = -cx / sx; camera.right = (width - cx) / sx;
  camera.top = cy / sy; camera.bottom = -(height - cy) / sy;
  camera.position.set(0, SURFACE + 20, 0);
  camera.up.set(0, 0, player ? 1 : -1);
  camera.lookAt(0, SURFACE, 0);
  camera.updateProjectionMatrix(); camera.updateMatrixWorld();
}

/** Prefer the nearest gap; keep the previous direction at a crossing to avoid flicker. */
export function fenceOrientation(x: number, z: number, slot: Cell, previous: Orientation): Orientation {
  const center = slotCenter(slot.c, slot.r);
  const dx = Math.abs(x - center.x), dz = Math.abs(z - center.z);
  const margin = 0.12 * CELL;
  if (dx > dz + margin) return 'h';
  if (dz > dx + margin) return 'v';
  return previous;
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
  /** Right-click, R, or the button locks this carry's direction against automatic changes. */
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
  /** Opening dice, already in the view that render() is drawing. */
  dice?: DiePose[] | null;
}

export const flipCell = (cell: Cell): Cell => ({ c: 8 - cell.c, r: 8 - cell.r });
export function reverseRenderState(s: RenderState): RenderState {
  const flipPlayer = (player: Player): Player => player === 0 ? 1 : 0;
  return {
    ...s,
    pawns: [flipCell(s.pawns[1]), flipCell(s.pawns[0])],
    fences: s.fences.map(f => ({ ...f, c: 7 - f.c, r: 7 - f.r, owner: flipPlayer(f.owner) })),
    remaining: [s.remaining[1], s.remaining[0]], turn: flipPlayer(s.turn),
    legal: s.legal.map(flipCell),
    drag: s.drag && { ...s.drag, x: -s.drag.x, z: -s.drag.z, owner: flipPlayer(s.drag.owner),
      cell: s.drag.cell && flipCell(s.drag.cell), slot: s.drag.slot && { c: 7 - s.drag.slot.c, r: 7 - s.drag.slot.r } },
    cursor: s.cursor && { ...s.cursor, x: -s.cursor.x, z: -s.cursor.z },
    ...(s.dice ? { dice: s.dice.map(flipDiePose) } : {}),
  };
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c, g: c.getContext('2d')! };
}

function woodTexture(tint: [number, number, number], grooves: boolean): THREE.Texture {
  const S = 512;
  const { c, g } = canvas(S, S);
  const img = g.createImageData(S, S);
  const d = img.data;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const wave = Math.sin(y * 0.016 + Math.sin(x * 0.007) * 1.6);
      const fine = Math.sin(y * 0.18 + x * 0.015);
      const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      const frac = n - Math.floor(n);
      const pore = frac > 0.992 ? -0.04 : 0;
      const v = 0.85 + wave * 0.014 + fine * 0.007 + (frac - 0.5) * 0.02 + pore;
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
  const profile = [[0, 0], [0.22, 0], [0.29, 0.04], [0.3, 0.085], [0.26, 0.14], [0.21, 0.2],
    [0.14, 0.37], [0.115, 0.53], [0.15, 0.59], [0.105, 0.65], [0.17, 0.72], [0.19, 0.81], [0.145, 0.91], [0, 0.96]];
  const curve = new THREE.SplineCurve(profile.map(([x, y]) => new THREE.Vector2(x, y)));
  return new THREE.LatheGeometry(curve.getPoints(56).map((p) => new THREE.Vector2(Math.max(0, p.x), Math.max(0, p.y))), 40);
}

function roundedBox(w: number, h: number, d: number, radius: number, material: THREE.Material) {
  return new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 1, radius), material);
}

function coordinateTexture() {
  const { c, g } = canvas(1024, 1024);
  g.fillStyle = '#ccb986';
  g.font = '22px Georgia';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let i = 0; i < 9; i++) {
    const p = 512 + (i - 4) * 1024 / 10.25;
    for (const y of [37, 987]) g.fillText(String.fromCharCode(65 + i), p, y);
    for (const x of [37, 987]) g.fillText(String(9 - i), x, p);
  }
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
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
  private angledCamera = new THREE.PerspectiveCamera(32, 1, 0.1, 80);
  private topCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 80);
  get camera() { return this.view === 'top' ? this.topCamera : this.angledCamera; }
  view: BoardView = 'angled';
  private player: Player = 0;
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
  private fenceGeo: THREE.BufferGeometry;
  private trays: THREE.Group[] = [];
  private decor: THREE.Group;
  private room: THREE.Group;
  private topBoard: THREE.Mesh;
  private topTable: THREE.Texture;
  private references: [ReferenceScene, ReferenceScene];
  private topScene: TopScene;
  private get reference() { return this.references[this.player]; }
  private reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  private shadowState = '';
  private openingDice: OpeningDie[] = [];
  private faceLabels: THREE.SpriteMaterial[] = [];

  constructor(el: HTMLElement, private dprCap = 2) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, dprCap));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    el.appendChild(this.renderer.domElement);
    this.references = [new ReferenceScene(el), new ReferenceScene(el, true)];
    this.topScene = new TopScene(el);
    this.scene.background = backdrop();
    this.topTable = new THREE.TextureLoader().load(new URL('./assets/reference-top-table.png', import.meta.url).href);
    this.topTable.colorSpace = THREE.SRGBColorSpace;
    const environment = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envMap = pmrem.fromScene(environment, 0.04).texture;
    environment.dispose();
    pmrem.dispose();

    const hemi = new THREE.HemisphereLight(0xffe7c8, 0x3a271c, 0.62);
    hemi.layers.enable(1);
    this.scene.add(hemi);
    this.key = new THREE.DirectionalLight(0xfff4e2, 2.55);
    this.key.layers.enable(1);
    this.key.position.set(-5.2, 11, 6.4);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(1024, 1024);
    this.key.shadow.autoUpdate = false;
    this.key.shadow.camera.near = 2;
    this.key.shadow.camera.far = 32;
    this.key.shadow.camera.left = -12;
    this.key.shadow.camera.right = 12;
    this.key.shadow.camera.top = 12;
    this.key.shadow.camera.bottom = -12;
    this.key.shadow.bias = -0.00025;
    this.key.shadow.normalBias = 0.035;
    this.key.shadow.radius = 3;
    // A shadow light with no map yet makes every receiver fail the first draw.
    this.key.shadow.needsUpdate = true;
    this.scene.add(this.key);
    const fill = new THREE.DirectionalLight(0xd9c2a4, 0.45);
    fill.layers.enable(1);
    fill.position.set(6, 5, 4);
    this.scene.add(fill);

    const tableWood = woodTexture([96, 62, 40], false);
    new THREE.ImageLoader().load(new URL('./assets/salon-walnut.webp', import.meta.url).href, (image) => {
      tableWood.dispose();
      tableWood.image = image;
      tableWood.needsUpdate = true;
    });
    this.room = studyRoom(tableWood, envMap);
    this.scene.add(this.room);

    const felt = roundedBox(10.8, 0.045, 10.8, 0.02, new THREE.MeshStandardMaterial({ color: 0x334238, roughness: 1 }));
    felt.position.y = -0.325;
    felt.receiveShadow = true;
    this.scene.add(felt);
    const walnut = new THREE.MeshStandardMaterial({ map: woodTexture([62, 43, 29], false), roughness: 0.38 });
    const plinth = roundedBox(10.6, 0.11, 10.6, 0.04, walnut);
    plinth.position.y = -0.25;
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    this.scene.add(plinth);
    const frame = roundedBox(10.4, 0.32, 10.4, 0.07, walnut);
    frame.position.y = -0.14;
    frame.castShadow = true;
    frame.receiveShadow = true;
    this.scene.add(frame);

    const grooves = roundedBox(9.12, 0.1, 9.12, 0.03, new THREE.MeshStandardMaterial({ color: 0x35291e, roughness: 0.8 }));
    grooves.position.y = -0.025;
    grooves.receiveShadow = true;
    this.scene.add(grooves);
    const tileGeo = new RoundedBoxGeometry(0.916, 0.11, 0.916, 1, 0.024);
    const tiles = new THREE.InstancedMesh(tileGeo, new THREE.MeshStandardMaterial({ map: woodTexture([184, 155, 115], false), roughness: 0.4 }), 81);
    tiles.name = 'board-tiles';
    const tile = new THREE.Object3D();
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      const p = cellCenter(c, r);
      tile.position.set(p.x, SURFACE - 0.055, p.z);
      tile.rotation.y = (c + r) % 2 ? Math.PI : 0;
      tile.updateMatrix();
      const index = r * 9 + c;
      tiles.setMatrixAt(index, tile.matrix);
      tiles.setColorAt(index, new THREE.Color().setRGB(0.94 + ((c * 7 + r * 3) % 5) * 0.012, 0.94 + ((c * 5 + r) % 4) * 0.012, 0.94));
    }
    tiles.receiveShadow = true;
    this.scene.add(tiles);
    const topTexture = new THREE.TextureLoader().load(new URL('./assets/reference-top-board.png', import.meta.url).href);
    topTexture.colorSpace = THREE.SRGBColorSpace;
    this.topBoard = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ map: topTexture }));
    this.topBoard.rotation.x = -Math.PI / 2;
    this.topBoard.position.y = SURFACE + 0.003;
    this.scene.add(this.topBoard);
    const brass = new THREE.MeshStandardMaterial({ color: 0xbca36c, metalness: 0.72, roughness: 0.32, envMap, envMapIntensity: 0.65 });
    for (const side of [-1, 1]) {
      for (const across of [false, true]) {
        const line = new THREE.Mesh(new THREE.BoxGeometry(across ? 9.96 : 0.018, 0.012, across ? 0.018 : 9.96), brass);
        line.position.set(across ? 0 : side * 4.98, 0.028, across ? side * 4.98 : 0);
        this.scene.add(line);
      }
      const goal = new THREE.Mesh(new THREE.BoxGeometry(8.85, 0.012, 0.025), brass);
      goal.position.set(0, 0.027, side * 4.67);
      this.scene.add(goal);
    }
    const coordinates = new THREE.Mesh(new THREE.PlaneGeometry(10.25, 10.25), new THREE.MeshBasicMaterial({ map: coordinateTexture(), transparent: true, depthWrite: false, opacity: 0.8 }));
    coordinates.rotation.x = -Math.PI / 2;
    coordinates.position.y = 0.035;
    this.scene.add(coordinates);

    this.decor = studyProps(envMap);
    this.scene.add(this.decor);

    const pawnGeo = pawnGeometry();
    const contactShadow = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.ShadowMaterial({ opacity: 0.28 }));
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.y = SURFACE + 0.002;
    contactShadow.receiveShadow = true;
    contactShadow.layers.set(1);
    this.scene.add(contactShadow);
    for (const color of [PALE, DARK]) {
      const mesh = new THREE.Mesh(pawnGeo, new THREE.MeshPhysicalMaterial({ color, roughness: 0.2, clearcoat: 0.8, clearcoatRoughness: 0.12, envMap, envMapIntensity: 0.75 }));
      mesh.layers.enable(1);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.pawns.push(mesh);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.278, 0.014, 6, 40), brass);
      band.layers.enable(1);
      band.rotation.x = Math.PI / 2;
      band.position.y = 0.105;
      mesh.add(band);
    }
    this.handPawn = new THREE.Mesh(pawnGeo, new THREE.MeshPhysicalMaterial({ color: PALE, roughness: 0.2, clearcoat: 0.8, clearcoatRoughness: 0.12, envMap, envMapIntensity: 0.75 }));
    this.handPawn.layers.enable(1);
    const handBand = new THREE.Mesh(new THREE.TorusGeometry(0.278, 0.014, 6, 40), brass);
    handBand.layers.enable(1);
    handBand.rotation.x = Math.PI / 2;
    handBand.position.y = 0.105;
    this.handPawn.add(handBand);
    this.handPawn.castShadow = true;
    this.handPawn.visible = false;
    this.scene.add(this.handPawn);
    this.ghostPawn = new THREE.Mesh(pawnGeo, new THREE.MeshStandardMaterial({
      color: 0x3cba6e, transparent: true, opacity: 0.4, roughness: 0.4, depthWrite: false,
    }));
    this.ghostPawn.visible = false;
    this.ghostPawn.layers.enable(1);
    this.ghostPawn.renderOrder = 2;
    this.scene.add(this.ghostPawn);

    this.fenceGeo = new RoundedBoxGeometry(1.86, 0.64, 0.11, 1, 0.024);
    this.fenceGeo.translate(0, 0.32, 0);
    const cofferWood = new THREE.MeshStandardMaterial({ map: tableWood, color: 0xb09475, roughness: 0.38 });
    for (const rack of RACKS) {
      const tray = fenceBox(cofferWood, brass);
      tray.position.set(rack.x, -0.345, rack.z);
      this.trays.push(tray);
      this.scene.add(tray);
      for (let i = 0; i < 10; i++) {
        const mesh = this.makeFence(rack.player === 0 ? PALE_FENCE : DARK_FENCE);
        mesh.castShadow = false;
        mesh.scale.y = STOCK_HEIGHT;
        this.stock[rack.player].push(mesh);
        this.scene.add(mesh);
      }
    }
    this.handFence = this.makeFence(PALE_FENCE);
    this.handFence.layers.enable(1);
    this.handFence.visible = false;
    this.scene.add(this.handFence);
    this.ghostFence = this.makeFence(0x3cba6e);
    const ghostMat = this.ghostFence.material as THREE.MeshStandardMaterial;
    ghostMat.transparent = true;
    ghostMat.opacity = 0.45;
    ghostMat.depthWrite = false;
    this.ghostFence.visible = false;
    this.ghostFence.layers.enable(1);
    this.ghostFence.renderOrder = 2;
    this.scene.add(this.ghostFence);

    for (let i = 0; i < 8; i++) {
      const pip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.068, 0.068, 0.025, 16),
        new THREE.MeshStandardMaterial({ color: 0xf0d7a4, roughness: 0.45, emissive: 0x6a4a22, emissiveIntensity: 0.25 }),
      );
      pip.visible = false;
      pip.layers.enable(1);
      pip.castShadow = false;
      this.pips.push(pip);
      this.scene.add(pip);
    }

    this.turnRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.4, 0.018, 8, 40),
      new THREE.MeshStandardMaterial({ color: 0xf2d39a, emissive: 0xc48a3a, emissiveIntensity: 0.4, roughness: 0.4 }),
    );
    this.turnRing.rotation.x = Math.PI / 2;
    this.turnRing.layers.enable(1);
    this.scene.add(this.turnRing);
    this.ring = new THREE.Mesh(
      new THREE.CircleGeometry(0.18, 32),
      new THREE.MeshBasicMaterial({ color: 0xfff1dc, transparent: true, opacity: 0, depthTest: false }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.layers.enable(1);
    this.ring.renderOrder = 4;
    this.scene.add(this.ring);

    const opening = createOpeningDice(envMap);
    this.openingDice = opening.dice;
    this.faceLabels = opening.faces;
    for (const die of opening.dice) {
      this.scene.add(die.body);
      this.scene.add(die.label);
      this.scene.add(die.halo);
    }

    this.resize();
    this.renderer.compile(this.scene, this.camera);
  }

  private makeFence(color: number) {
    const mesh = new THREE.Mesh(this.fenceGeo, new THREE.MeshStandardMaterial({ color, roughness: 0.34, metalness: 0.04 }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    if (w < 2 || h < 2) return;
    this.aspect = w / h;
    // Large/HiDPI windows share the GPU with hand tracking; keep the 3D buffer near Full HD.
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, this.dprCap, Math.sqrt(2_000_000 / (w * h))));
    this.renderer.setSize(w, h);
    const portrait = this.aspect < 1;
    this.references.forEach(reference => reference.resize());
    this.references[1 - this.player].setEnabled(false);
    this.reference.setEnabled(!portrait && this.view === 'angled');
    this.decor.visible = !portrait && this.view !== 'top';
    this.room.visible = this.view !== 'top';
    layoutStudyRoom(this.room, portrait);
    this.layoutRacks(portrait);
    frameCamera(this.camera, this.aspect, this.view, this.player);
    if (this.view === 'top') frameTopCamera(this.topCamera, w, h, this.player);
    this.key.shadow.needsUpdate = true;
  }

  setPlayer(player: Player) {
    if (this.player === player) return;
    this.player = player;
    this.resize();
  }

  /** Side stacks on a wide screen, baseline stacks on a phone, so both stay reachable. */
  private layoutRacks(portrait: boolean) {
    rackLayout(portrait).forEach((rack, i) => Object.assign(RACKS[i], rack));
    if (this.view === 'top') RACKS.forEach((rack, i) => {
      rack.x = i === 0 ? -7.7 : 7.7; rack.z = i === 0 ? 4.65 : -1.9;
      rack.hx = 1.85; rack.hz = 1.1;
    });
    RACKS.forEach((rack, i) => {
      const tray = this.trays[i];
      if (!tray) return;
      tray.position.set(rack.x, -0.345, rack.z);
      tray.rotation.y = portrait ? Math.PI / 2 : 0;
      tray.scale.set(portrait ? 0.45 : 1, 1, 1);
    });
  }

  private project(x: number, z: number) {
    if (this.reference.enabled) {
      const p = referencePoint(this.player ? -x : x, this.player ? -z : z), frame = referenceFrame(innerWidth, innerHeight);
      return { x: (frame.x + p.x * frame.scale) / innerWidth, y: (frame.y + p.y * frame.scale) / innerHeight };
    }
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
    if (this.reference.enabled) {
      const p = REFERENCE_STOCK[this.player ? 1 - player : player], frame = referenceFrame(innerWidth, innerHeight);
      return { x: (frame.x + p.x * frame.scale) / innerWidth, y: (frame.y + p.y * frame.scale) / innerHeight };
    }
    const rack = RACKS[player];
    return this.project(rack.x, rack.z);
  }

  boardPoint(sx: number, sy: number, pickingUp = true): { x: number; z: number } | null {
    if (innerWidth < 2 || innerHeight < 2) return null;
    if (this.reference.enabled) {
      const frame = referenceFrame(innerWidth, innerHeight);
      const x = (sx * innerWidth - frame.x) / frame.scale, y = (sy * innerHeight - frame.y) / frame.scale;
      const point = x >= 0 && x <= REFERENCE_WIDTH && y >= 0 && y <= REFERENCE_HEIGHT ? referenceWorld(x, y) : null;
      return point && this.player ? { x: -point.x, z: -point.z } : point;
    }
    this.ndc.set(sx * 2 - 1, -(sy * 2 - 1));
    this.ray.setFromCamera(this.ndc, this.camera);
    if (pickingUp) {
      const pawn = this.ray.intersectObjects(this.pawns, true)[0]?.object;
      const root = this.pawns.find(mesh => mesh === pawn || mesh.children.includes(pawn!));
      if (root?.visible) return { x: root.position.x, z: root.position.z };
    }
    const hit = this.ray.ray.intersectPlane(this.plane, this.hitV);
    if (!hit) return null;
    return { x: hit.x, z: hit.z };
  }

  classify(x: number, z: number, pawns: [Cell, Cell], pickingUp = true): BoardHit {
    let cell: Cell | null = null;
    const cc = Math.round(x / CELL + 4);
    const rr = Math.round(4 - z / CELL);
    if (cc >= 0 && rr >= 0 && cc < 9 && rr < 9) {
      const p = cellCenter(cc, rr);
      if (Math.hypot(p.x - x, p.z - z) <= 0.72) cell = { c: cc, r: rr };
    }
    let slot: Cell | null = null;
    const sc = THREE.MathUtils.clamp(Math.round(x / CELL + 3.5), 0, 7);
    const sr = THREE.MathUtils.clamp(Math.round(3.5 - z / CELL), 0, 7);
    {
      const p = slotCenter(sc, sr);
      if (Math.hypot(p.x - x, p.z - z) <= 0.85) slot = { c: sc, r: sr };
    }
    let stock: Player | null = null;
    for (const rack of RACKS) {
      if (Math.abs(x - rack.x) <= rack.hx && Math.abs(z - rack.z) <= rack.hz) stock = rack.player;
    }
    if (this.reference.enabled) {
      const p = referencePoint(this.player ? -x : x, this.player ? -z : z), hit = referenceStockAt(p.x, p.y);
      stock = hit === null ? null : this.player ? (1 - hit) as Player : hit;
    }
    let pawn: Player | null = null;
    let pawnD = 0.52;
    for (const id of [0, 1] as const) {
      const p = cellCenter(pawns[id].c, pawns[id].r);
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < pawnD) { pawnD = d; pawn = id; }
    }
    if (this.reference.enabled && pickingUp) {
      const p = referencePoint(this.player ? -x : x, this.player ? -z : z);
      const mapped: [Cell, Cell] = this.player ? [flipCell(pawns[1]), flipCell(pawns[0])] : pawns;
      const hit = this.reference.hitPawn(p.x, p.y, mapped);
      const visiblePawn = hit === null ? null : this.player ? (1 - hit) as Player : hit;
      if (visiblePawn !== null) {
        pawn = visiblePawn;
        cell = { ...pawns[visiblePawn] };
        const centre = cellCenter(cell.c, cell.r);
        x = centre.x; z = centre.z;
      }
    }
    return { x, z, cell, slot, pawn, stock };
  }

  render(s: RenderState) {
    if (innerWidth < 2 || innerHeight < 2) return;
    this.reference.setEnabled(this.aspect >= 1 && this.view === 'angled');
    const hybrid = this.reference.enabled;
    const topImage = this.topScene.setEnabled(this.view === 'top');
    if (topImage) this.topScene.render(s, this.player);
    this.topBoard.visible = this.view === 'top';
    if (hybrid) {
      s = this.player ? reverseRenderState(s) : s;
      this.reference.render(s);
      frameReferenceCamera(this.angledCamera, innerWidth, innerHeight);
    }
    const motionT = this.reducedMotion.matches ? 0 : s.t;
    const draggingPawn = s.drag?.kind === 'pawn' ? s.drag.owner : null;
    for (let i = 0; i < 2; i++) {
      const mesh = this.pawns[i];
      (mesh.material as THREE.MeshPhysicalMaterial).color.set((i === 0) !== (hybrid && this.player === 1) ? PALE : DARK);
      const cell = s.pawns[i as Player];
      const p = cellCenter(cell.c, cell.r);
      mesh.visible = draggingPawn !== i;
      mesh.position.set(p.x, SURFACE, p.z);
    }
    if (s.drag?.kind === 'pawn') {
      this.handPawn.visible = true;
      const lost = !s.drag.cell;
      (this.handPawn.material as THREE.MeshStandardMaterial).color.set(lost ? 0xc4473a : (s.drag.owner === 0) !== (hybrid && this.player === 1) ? PALE : DARK);
      this.handPawn.position.set(s.drag.x, SURFACE + 0.72, s.drag.z);
    } else this.handPawn.visible = false;

    const showGhostPawn = s.drag?.kind === 'pawn' && s.drag.cell;
    this.ghostPawn.visible = !!showGhostPawn;
    if (s.drag?.kind === 'pawn' && s.drag.cell) {
      const p = cellCenter(s.drag.cell.c, s.drag.cell.r);
      this.ghostPawn.position.set(p.x, SURFACE, p.z);
      const mat = this.ghostPawn.material as THREE.MeshStandardMaterial;
      mat.color.set(s.drag.legal ? 0x3cba6e : 0xc4473a);
      mat.opacity = 0.38 + Math.sin(motionT * 5) * 0.06;
    }

    while (this.placed.length < s.fences.length) {
      const mesh = this.makeFence(PALE_FENCE);
      mesh.layers.enable(1);
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
      (mesh.material as THREE.MeshStandardMaterial).color.set(PLACED_FENCE_COLORS[hybrid && this.player === 1 ? 1 - f.owner : f.owner]);
    }

    for (const id of [0, 1] as const) {
      const rack = RACKS[id];
      const held = s.drag?.kind === 'fence' && s.drag.owner === id ? 1 : 0;
      const n = Math.max(0, s.remaining[id] - held);
      for (let i = 0; i < 10; i++) {
        const mesh = this.stock[id][i];
        mesh.visible = i < n;
        const along = stockOffset(i, rack.along === 'z');
        if (rack.along === 'z') {
          mesh.position.set(rack.x, STOCK_Y, rack.z - along);
          mesh.rotation.y = 0;
        } else {
          mesh.position.set(rack.x + along, STOCK_Y, rack.z);
          mesh.rotation.y = Math.PI / 2;
        }
      }
    }

    if (s.drag?.kind === 'fence') {
      this.handFence.visible = true;
      this.handFence.position.set(s.drag.x, SURFACE + 0.7, s.drag.z);
      this.handFence.rotation.y = s.drag.o === 'v' ? Math.PI / 2 : 0;
      (this.handFence.material as THREE.MeshStandardMaterial).color.set(!s.drag.slot ? 0xc4473a : PLACED_FENCE_COLORS[hybrid && this.player === 1 ? 1 - s.drag.owner : s.drag.owner]);
      this.ghostFence.visible = !!s.drag.slot;
      if (s.drag.slot) {
        const p = slotCenter(s.drag.slot.c, s.drag.slot.r);
        this.ghostFence.position.set(p.x, SURFACE, p.z);
        this.ghostFence.rotation.y = s.drag.o === 'v' ? Math.PI / 2 : 0;
        const mat = this.ghostFence.material as THREE.MeshStandardMaterial;
        mat.color.set(s.drag.legal ? 0x3cba6e : 0xc4473a);
        mat.opacity = 0.42 + Math.sin(motionT * 5) * 0.05;
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
      const pulse = 1 + Math.sin(motionT * 2.4) * 0.04;
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
    for (let i = 0; i < this.openingDice.length; i++) {
      const pose = s.dice?.[i];
      const die = this.openingDice[i];
      die.body.visible = !!pose;
      die.label.visible = !!pose?.face;
      die.halo.visible = !!pose?.face || !!pose?.edge;
      if (!pose) continue;
      die.body.position.set(pose.x, pose.y, pose.z);
      die.body.quaternion.set(pose.qx, pose.qy, pose.qz, pose.qw);
      if (pose.face) {
        die.label.position.set(pose.x, pose.y + 0.86, pose.z);
        die.label.material = this.faceLabels[pose.face - 1];
        die.halo.position.set(pose.x, SURFACE + 0.012, pose.z);
        die.halo.scale.setScalar(1 + Math.sin(motionT * 6) * 0.025);
        (die.halo.material as THREE.MeshBasicMaterial).color.set(pose.face === 1 ? 0xf3ddb0 : 0x72cfb8);
      } else if (pose.edge) {
        die.halo.position.set(pose.x, SURFACE + 0.012, pose.z);
        die.halo.scale.setScalar(1.06 + Math.sin(motionT * 8) * 0.06);
        (die.halo.material as THREE.MeshBasicMaterial).color.set(0xffdf78);
      }
    }
    const shadowState = [s.pawns[0].c, s.pawns[0].r, s.pawns[1].c, s.pawns[1].r,
      s.fences.length, ...s.remaining, s.drag?.kind, s.drag?.x, s.drag?.z, s.drag?.o].join(',');
    if (shadowState !== this.shadowState) {
      this.key.shadow.needsUpdate = true;
      this.shadowState = shadowState;
    }
    const background = this.scene.background;
    if (hybrid || topImage) this.scene.background = null;
    else if (this.view === 'top') this.scene.background = this.topTable;
    this.camera.layers.set(hybrid || topImage ? 1 : 0);
    this.renderer.render(this.scene, this.camera);
    this.camera.layers.set(0);
    this.scene.background = background;
  }
}
