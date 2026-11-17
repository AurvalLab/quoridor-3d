/**
 * Ceremonial opening coin (Hearthstone-style toss) adapted for the walnut/ivory/jade study theme.
 *
 * Combines the 3-material cylinder + RepeatWrapping milled edge from rene78/Rotating-Coin (MIT)
 * with the raised TorusGeometry bezel rim and ExtrudeGeometry 3D reliefs from
 * aMoniker/coins-visualization (MIT).
 *
 * Local +Y is Moon White (face 1), local -Y is Jade Green (face 2), matching topFace() in dice.ts.
 */
import * as THREE from 'three';
import { COIN_RADIUS, DIE_HALF } from './dice';

const THICKNESS = DIE_HALF * 2;

function createCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return { canvas, g: canvas.getContext('2d')! };
}

function makeMilledEdgeTexture(): THREE.CanvasTexture {
  const { canvas, g } = createCanvas(256, 64);
  for (let x = 0; x < 256; x++) {
    const reed = 0.5 + 0.5 * Math.sin((x / 256) * Math.PI * 2 * 4);
    const v = Math.round(145 + reed * 95);
    g.fillStyle = `rgb(${v}, ${Math.round(v * 0.84)}, ${Math.round(v * 0.48)})`;
    g.fillRect(x, 0, 1, 64);
  }
  const topSheen = g.createLinearGradient(0, 0, 0, 64);
  topSheen.addColorStop(0, 'rgba(255, 244, 210, 0.35)');
  topSheen.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
  topSheen.addColorStop(1, 'rgba(30, 18, 6, 0.42)');
  g.fillStyle = topSheen;
  g.fillRect(0, 0, 256, 64);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(28, 1);
  tex.needsUpdate = true;
  return tex;
}

function drawArcText(
  g: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  radius: number,
  centerAngle: number,
  stepAngle: number,
  bottomUp = false,
) {
  const chars = [...text];
  const total = (chars.length - 1) * stepAngle;
  for (let i = 0; i < chars.length; i++) {
    const offset = i * stepAngle - total / 2;
    const angle = bottomUp ? centerAngle - offset : centerAngle + offset;
    g.save();
    g.translate(cx, cy);
    g.rotate(angle);
    g.fillText(chars[i], 0, bottomUp ? radius : -radius);
    g.restore();
  }
}

function makeCoinFaceTexture(side: 'white' | 'jade'): THREE.CanvasTexture {
  const S = 512;
  const { canvas, g } = createCanvas(S, S);
  const cx = S / 2;
  const cy = S / 2;
  const white = side === 'white';

  g.save();
  g.translate(cx, cy);
  // Align canvas +Y up with the board orientation on CylinderGeometry top (+Y) and flipped bottom (-Y) caps.
  g.rotate(white ? -Math.PI / 2 : Math.PI / 2);
  g.translate(-cx, -cy);

  const bg = g.createRadialGradient(cx - 48, cy - 56, 20, cx, cy, 250);
  if (white) {
    bg.addColorStop(0, '#fcf8ee');
    bg.addColorStop(0.65, '#eee2ca');
    bg.addColorStop(1, '#d2bc92');
  } else {
    bg.addColorStop(0, '#2e6f5f');
    bg.addColorStop(0.65, '#1d4d41');
    bg.addColorStop(1, '#102d25');
  }
  g.fillStyle = bg;
  g.fillRect(0, 0, S, S);

  // Outer engraved brass rings
  g.strokeStyle = white ? '#9c7838' : '#d5b56f';
  g.lineWidth = 6;
  g.beginPath();
  g.arc(cx, cy, 232, 0, Math.PI * 2);
  g.stroke();

  g.strokeStyle = white ? 'rgba(138, 102, 42, 0.55)' : 'rgba(218, 188, 120, 0.55)';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(cx, cy, 218, 0, Math.PI * 2);
  g.stroke();

  // Guilloché compass ticks
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const major = i % 4 === 0;
    const r0 = major ? 204 : 210;
    const r1 = 217;
    g.strokeStyle = white ? 'rgba(122, 88, 32, 0.72)' : 'rgba(226, 198, 134, 0.7)';
    g.lineWidth = major ? 2.5 : 1.2;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    g.stroke();
  }

  // Inner medallion field
  const inner = g.createRadialGradient(cx, cy, 10, cx, cy, 150);
  if (white) {
    inner.addColorStop(0, '#f3e7cf');
    inner.addColorStop(1, '#dfd0af');
  } else {
    inner.addColorStop(0, '#2a6859');
    inner.addColorStop(1, '#143930');
  }
  g.fillStyle = inner;
  g.beginPath();
  g.arc(cx, cy, 152, 0, Math.PI * 2);
  g.fill();

  // Subtle sunburst engraving inside medallion
  g.strokeStyle = white ? 'rgba(138, 102, 42, 0.22)' : 'rgba(218, 188, 120, 0.2)';
  g.lineWidth = 1.5;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * 26, cy + Math.sin(a) * 26);
    g.lineTo(cx + Math.cos(a) * 146, cy + Math.sin(a) * 146);
    g.stroke();
  }

  g.strokeStyle = white ? '#9b7534' : '#caa65f';
  g.lineWidth = 3.5;
  g.beginPath();
  g.arc(cx, cy, 152, 0, Math.PI * 2);
  g.stroke();

  g.fillStyle = white ? '#5b421c' : '#efe1be';
  g.font = '700 22px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  drawArcText(
    g,
    white ? 'MOON WHITE · 月牙白 · FIRST' : 'JADE GREEN · 翡翠绿 · FIRST',
    cx,
    cy,
    182,
    0,
    0.095,
    false,
  );
  drawArcText(
    g,
    white ? '先手 · IVORY SEAL' : '先手 · JADE SEAL',
    cx,
    cy,
    182,
    0,
    0.09,
    true,
  );

  g.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function makeCrescentGeometry(): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  const rOut = 0.34;
  const rIn = 0.27;
  const offset = 0.13;
  shape.absarc(0, 0, rOut, -Math.PI * 0.62, Math.PI * 0.62, false);
  const topY = Math.sin(Math.PI * 0.62) * rOut;
  const topX = Math.cos(Math.PI * 0.62) * rOut;
  const endAngle = Math.atan2(topY, topX - offset);
  shape.absarc(offset, 0, rIn, endAngle, -endAngle, true);
  shape.closePath();

  return new THREE.ExtrudeGeometry(shape, {
    depth: 0.022,
    steps: 1,
    curveSegments: 28,
    bevelEnabled: true,
    bevelSize: 0.008,
    bevelThickness: 0.008,
    bevelSegments: 2,
  });
}

function makeJadeStarGeometry(): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  const points = 8;
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const r = i % 2 === 0 ? 0.36 : 0.125;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();

  return new THREE.ExtrudeGeometry(shape, {
    depth: 0.022,
    steps: 1,
    curveSegments: 16,
    bevelEnabled: true,
    bevelSize: 0.008,
    bevelThickness: 0.008,
    bevelSegments: 2,
  });
}

function faceMaterials(): THREE.SpriteMaterial[] {
  const specs = [
    {
      pip: '#f5ede0',
      rim: '#d4b572',
      en: 'MOON WHITE 1ST · JADE 2ND',
      zh: '月牙白先手 · 翡翠绿后手',
    },
    {
      pip: '#4ba791',
      rim: '#d4b572',
      en: 'JADE GREEN 1ST · WHITE 2ND',
      zh: '翡翠绿先手 · 月牙白后手',
    },
  ];
  return specs.map((spec) => {
    const { canvas, g } = createCanvas(512, 160);
    const x = 10, y = 14, w = 492, h = 132, r = 28;
    g.beginPath();
    g.moveTo(x + r, y);
    g.lineTo(x + w - r, y);
    g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r);
    g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h);
    g.quadraticCurveTo(x, y + h, x, y + r);
    g.lineTo(x, y + r);
    g.quadraticCurveTo(x, y, x + r, y);
    g.closePath();
    g.fillStyle = 'rgba(20, 12, 8, 0.88)';
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = spec.rim;
    g.stroke();

    // Inner medallion pip
    g.beginPath();
    g.arc(68, 80, 30, 0, Math.PI * 2);
    g.fillStyle = spec.pip;
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = spec.rim;
    g.stroke();

    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#f6efe2';
    g.font = '700 23px Manrope, sans-serif';
    g.fillText(spec.en, 302, 56);

    g.fillStyle = '#e7c986';
    g.font = '700 28px "PingFang SC", "Microsoft YaHei", sans-serif';
    g.fillText(spec.zh, 302, 104);

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
  halo: THREE.Mesh;
}

function addPart(parent: THREE.Group, mesh: THREE.Object3D) {
  mesh.layers.enable(1);
  if (mesh instanceof THREE.Mesh) {
    mesh.castShadow = false;
    mesh.receiveShadow = true;
  }
  parent.add(mesh);
}

export function createOpeningDice(envMap?: THREE.Texture): { dice: OpeningDie[]; faces: THREE.SpriteMaterial[] } {
  const faces = faceMaterials();
  const edgeTex = makeMilledEdgeTexture();
  const whiteTex = makeCoinFaceTexture('white');
  const jadeTex = makeCoinFaceTexture('jade');

  const edgeMat = new THREE.MeshStandardMaterial({
    map: edgeTex,
    bumpMap: edgeTex,
    bumpScale: 0.014,
    color: 0xd9b974,
    metalness: 0.82,
    roughness: 0.28,
    envMap,
    envMapIntensity: 0.95,
  });
  const obverseMat = new THREE.MeshPhysicalMaterial({
    map: whiteTex,
    roughness: 0.24,
    metalness: 0.14,
    clearcoat: 0.72,
    clearcoatRoughness: 0.15,
    envMap,
    envMapIntensity: 0.78,
  });
  const reverseMat = new THREE.MeshPhysicalMaterial({
    map: jadeTex,
    roughness: 0.22,
    metalness: 0.18,
    clearcoat: 0.76,
    clearcoatRoughness: 0.14,
    envMap,
    envMapIntensity: 0.85,
  });
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xcfa95f,
    metalness: 0.82,
    roughness: 0.25,
    envMap,
    envMapIntensity: 1.0,
  });
  const moonReliefMat = new THREE.MeshStandardMaterial({
    color: 0xd6b05c,
    roughness: 0.24,
    metalness: 0.78,
    envMap,
    envMapIntensity: 1.0,
  });
  const jadeReliefMat = new THREE.MeshPhysicalMaterial({
    color: 0x76cdb8,
    roughness: 0.2,
    metalness: 0.22,
    clearcoat: 0.75,
    envMap,
    envMapIntensity: 0.9,
  });

  const body = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(COIN_RADIUS, COIN_RADIUS, THICKNESS, 64, 1, false),
    [edgeMat, obverseMat, reverseMat],
  );
  addPart(body, core);

  const outerRimGeo = new THREE.TorusGeometry(COIN_RADIUS - 0.035, 0.042, 14, 64);
  const innerRimGeo = new THREE.TorusGeometry(COIN_RADIUS * 0.66, 0.016, 10, 64);
  for (const sign of [1, -1] as const) {
    const outerRim = new THREE.Mesh(outerRimGeo, brassMat);
    outerRim.rotation.x = Math.PI / 2;
    outerRim.position.y = sign * (DIE_HALF - 0.008);
    addPart(body, outerRim);

    const innerRim = new THREE.Mesh(innerRimGeo, brassMat);
    innerRim.rotation.x = Math.PI / 2;
    innerRim.position.y = sign * (DIE_HALF - 0.002);
    addPart(body, innerRim);
  }

  // Obverse (+Y, Moon White): crescent moon + brass pip
  const crescent = new THREE.Mesh(makeCrescentGeometry(), moonReliefMat);
  crescent.rotation.x = -Math.PI / 2;
  crescent.position.set(-0.08, DIE_HALF - 0.004, 0);
  addPart(body, crescent);

  const moonStar = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.105, 0.026, 16), brassMat);
  moonStar.position.set(0.18, DIE_HALF + 0.01, 0);
  addPart(body, moonStar);

  // Reverse (-Y, Jade Green): faceted star + jade cabochon boss
  const jadeStar = new THREE.Mesh(makeJadeStarGeometry(), jadeReliefMat);
  jadeStar.rotation.x = Math.PI / 2;
  jadeStar.position.set(0, -(DIE_HALF - 0.004), 0);
  addPart(body, jadeStar);

  const jadeBoss = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.026, 16), brassMat);
  jadeBoss.position.set(0, -(DIE_HALF + 0.01), 0);
  addPart(body, jadeBoss);

  body.visible = false;
  body.layers.enable(1);

  const label = new THREE.Sprite(faces[0]);
  label.scale.set(2.2, 0.68, 1);
  label.visible = false;
  label.layers.enable(1);
  label.renderOrder = 6;

  const halo = new THREE.Mesh(
    new THREE.RingGeometry(COIN_RADIUS * 1.06, COIN_RADIUS * 1.24, 64),
    new THREE.MeshBasicMaterial({ color: 0xf3ddb0, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }),
  );
  halo.rotation.x = -Math.PI / 2;
  halo.visible = false;
  halo.layers.enable(1);
  halo.renderOrder = 3;

  return { dice: [{ body, label, halo }], faces };
}
