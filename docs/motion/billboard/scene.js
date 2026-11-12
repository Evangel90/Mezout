// The billboard spot: a 15 s, silent, 1920×1080 3D scene (three.js) filmed in one continuous camera move.
// Everything is a pure function of time: frame(t) poses the scene and renders it with motion blur.
// 2D helpers (txt, mark, pill, setFont, E, C…) come from ../ads/lib.js, loaded before this module.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { canvasOf, texOf, seg, makeText as kitText, poseText, coinFace } from "../three-kit.js";

const makeText = (str, o) => kitText(scene, str, o);

export const DURATION = 15;
const OUT_W = 1920;
const OUT_H = 1080;
const SS = 2; // supersampling: the 3D scene renders at twice the output size

await Promise.all([document.fonts.load('650 60px "Geist"'), document.fonts.load('500 40px "Geist Mono"')]);

const out = document.getElementById("c");
const octx = out.getContext("2d");
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(SS);
renderer.setSize(OUT_W, OUT_H, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(C.ink);
scene.fog = new THREE.Fog(C.ink, 10, 24);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.75;

const camera = new THREE.PerspectiveCamera(35, OUT_W / OUT_H, 0.1, 80);

const composer = new EffectComposer(renderer);
composer.setPixelRatio(SS);
composer.setSize(OUT_W, OUT_H);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(OUT_W, OUT_H), 0.22, 0.6, 1.02));
composer.addPass(new OutputPass());

// ---------- set

const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: "#1a1512", roughness: 0.88, metalness: 0, envMapIntensity: 0.05 }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -1.75;
floor.receiveShadow = true;
scene.add(floor);

const key = new THREE.DirectionalLight("#ffffff", 2.4);
key.position.set(3, 7, 6);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -8, right: 8, top: 6, bottom: -6, near: 1, far: 30 });
key.shadow.radius = 8;
key.shadow.bias = -0.0004;
scene.add(key, key.target);
const warm = new THREE.PointLight(C.signal, 0, 30, 1.6);
const cool = new THREE.PointLight(C.musd4, 0, 30, 1.6);
const violet = new THREE.PointLight(C.agent, 0, 30, 1.6);
scene.add(warm, cool, violet);

// Soft colour washes behind the subject.
const [glowC, glowG] = canvasOf(256, 256);
const gr = glowG.createRadialGradient(128, 128, 0, 128, 128, 128);
gr.addColorStop(0, "rgba(255,255,255,1)");
gr.addColorStop(1, "rgba(255,255,255,0)");
glowG.fillStyle = gr;
glowG.fillRect(0, 0, 256, 256);
const glowTex = texOf(glowC);
const glow = (color) => {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(22, 22),
    new THREE.MeshBasicMaterial({ map: glowTex, color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
  );
  mesh.position.z = -9;
  scene.add(mesh);
  return mesh;
};
const glowWarm = glow(C.signal);
const glowCool = glow(C.musd);
const glowViolet = glow(C.agent);

// Dust, for depth.
const DUST = 420;
const dustPos = new Float32Array(DUST * 3);
for (let i = 0; i < DUST; i++) dustPos.set([(rnd(i) - 0.5) * 26, (rnd(i + 500) - 0.3) * 9, (rnd(i + 900) - 0.6) * 16], i * 3);
const dustGeo = new THREE.BufferGeometry();
dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ map: glowTex, size: 0.07, color: "#ffffff", transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
scene.add(dust);

// ---------- the coin: Bitcoin on one face, MUSD on the other

const coin3 = new THREE.Group();
const edgeMat = new THREE.MeshStandardMaterial({ color: C.btc, metalness: 0.95, roughness: 0.22 });
const btcFace = coinFace(C.btc, "₿", 620, 215, Math.PI / 2);
const musdFace = coinFace(C.musd, "M", 560, 195, Math.PI / 2);
const R = 1.3;
const disc = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.2, 128), [edgeMat, btcFace, musdFace]);
disc.rotation.x = Math.PI / 2;
disc.castShadow = true;
coin3.add(disc);
for (const z of [0.1, -0.1]) {
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R - 0.045, 0.055, 20, 128), edgeMat);
  rim.position.z = z;
  rim.castShadow = true;
  coin3.add(rim);
}
scene.add(coin3);

// A swarm of small coins that orbits behind and changes colour with the flip.
const SWARM = 90;
const swarm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.16, 0.035, 40), new THREE.MeshStandardMaterial({ metalness: 0.9, roughness: 0.28 }), SWARM);
swarm.castShadow = true;
scene.add(swarm);
const dummy = new THREE.Object3D();
const cA = new THREE.Color(C.btc);
const cB = new THREE.Color(C.musd4);
const cTmp = new THREE.Color();

// ---------- the paid card and the logo tile

const [cardC, cg] = canvasOf(920, 1240);
rr(cg, 0, 0, 920, 1240, 52);
cg.fillStyle = "#ffffff";
cg.fill();
mark(cg, 104, 108, 76, { fill: C.ink, stroke: C.white });
txt(cg, "Merchant's Store", 164, 126, { size: 52, weight: 600, fill: C.ink });
txt(cg, "25.00", 60, 420, { size: 230, weight: 650, fill: C.ink });
txt(cg, "MUSD", 64, 510, { size: 70, weight: 600, fill: C.stone5 });
cg.fillStyle = C.stone2;
cg.fillRect(60, 580, 800, 4);
[["Paid with", "Bitcoin"], ["Network fee", "None"], ["Merchant gets", "25.00 MUSD"]].forEach(([a, b], i) => {
  txt(cg, a, 60, 680 + i * 96, { size: 46, weight: 450, fill: C.stone5 });
  txt(cg, b, 860, 680 + i * 96, { size: 46, weight: 600, fill: C.ink, align: "right" });
});
rr(cg, 60, 1000, 800, 170, 44);
cg.fillStyle = C.musd;
cg.fill();
txt(cg, "Paid", 500, 1112, { size: 84, weight: 650, align: "center" });
check(cg, 360, 1086, 60, C.white, 16);
const card = new THREE.Group();
const CW = 2.3;
const CH = 3.1;
const slab = new THREE.Mesh(new RoundedBoxGeometry(CW, CH, 0.1, 6, 0.13), new THREE.MeshStandardMaterial({ color: "#8a8683", roughness: 0.6, metalness: 0, envMapIntensity: 0.4 }));
slab.castShadow = true;
const cardFront = new THREE.Mesh(new THREE.PlaneGeometry(CW, CH), new THREE.MeshBasicMaterial({ map: texOf(cardC), alphaTest: 0.5, color: "#f2f2f2" }));
cardFront.position.z = 0.052;
card.add(slab, cardFront);
scene.add(card);

const [tileC, tg] = canvasOf(512, 512);
rr(tg, 0, 0, 512, 512, 124);
tg.fillStyle = "#ffffff";
tg.fill();
check(tg, 256, 262, 200, C.ink, 50);
const tile = new THREE.Group();
const tileBox = new THREE.Mesh(new RoundedBoxGeometry(1.5, 1.5, 0.34, 8, 0.36), new THREE.MeshStandardMaterial({ color: "#8a8683", roughness: 0.6, metalness: 0, envMapIntensity: 0.4 }));
tileBox.castShadow = true;
const tileMark = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), new THREE.MeshBasicMaterial({ map: texOf(tileC), alphaTest: 0.5, color: "#f2f2f2" }));
tileMark.position.z = 0.172;
tile.add(tileBox, tileMark);
scene.add(tile);

// ---------- type

const place = (T, x, y, z = 0) => (T.group.position.set(x, y, z), T);
const t1a = place(makeText("They pay in", { size: 0.52, maxWidth: 3.3 }), -5.3, 0.66);
const t1b = place(makeText("Bitcoin.", { size: 1, maxWidth: 3.3, color: C.signal4 }), -5.3, -0.42);
const t2a = place(makeText("You get", { size: 0.52 }), 1.7, 0.74);
const t2b = place(makeText("MUSD.", { size: 1.2, maxWidth: 3.5, color: C.musd4 }), 1.7, -0.5);
const t3a = place(makeText("No wallet.", { size: 0.84, maxWidth: 3.9 }), -3.75, 0.3);
const t3b = place(makeText("No gas.", { size: 0.84, maxWidth: 3.9, color: C.signal4 }), -3.75, -0.62);
const t4a = place(makeText("Mezout", { size: 1.25, weight: 700 }), -1.3, -0.06);
const t4b = place(makeText("usemezout.vercel.app", { size: 0.44, weight: 600, color: C.white, depth: 0.08, layers: 6 }), -1.26, -0.8);

// ---------- timeline (seconds)

const FLIP = [3.4, 4.8]; // the coin turns over; the camera trucks past it
const SWAP = [8.0, 9.2]; // the coin leaves, the card arrives
const LOCK = [12.0, 13.0]; // the card spins into the logo tile

// Camera keys: [time, position, look-at, ease into this key].
const CAM = [
  [0, [-2.1, 0.4, 7.9], [-1.75, 0.05, 0], "lin"],
  [3.4, [-1.55, 0.28, 6.7], [-1.75, 0.05, 0], "lin"],
  [4.1, [0, 0.05, 5.2], [0, 0.05, 0], "in"],
  [4.8, [1.55, 0.28, 6.7], [1.75, 0.05, 0], "out"],
  [8.0, [2.1, 0.36, 7.4], [1.75, 0.05, 0], "lin"],
  [9.2, [-0.5, 0.7, 8.1], [0, 0, 0], "io"],
  [12.0, [0.5, 0.35, 7.3], [0, 0, 0], "lin"],
  [13.0, [0, 0.3, 7.9], [0, -0.05, 0], "io"],
  [15, [0, 0.22, 7.3], [0, -0.05, 0], "lin"],
];
const EASE = { lin: (x) => x, io: E.io3, in: (x) => x * x, out: (x) => 1 - (1 - x) ** 2 };
const v3 = (a, b, u) => new THREE.Vector3(lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u));

function pose(t) {
  NOW = t;
  // Camera.
  let i = 0;
  while (i + 2 < CAM.length && t >= CAM[i + 1][0]) i++;
  const [ta, pa, la] = CAM[i];
  const [tb, pb, lb, ease] = CAM[i + 1];
  const u = EASE[ease](seg(t, ta, tb));
  camera.position.copy(v3(pa, pb, u));
  camera.position.y += Math.sin(t * 0.9) * 0.04;
  camera.lookAt(v3(la, lb, u));
  camera.rotation.z += Math.sin(seg(t, FLIP[0], FLIP[1]) * Math.PI) * 0.07 - Math.sin(seg(t, SWAP[0], SWAP[1]) * Math.PI) * 0.05;

  const flip = seg(t, FLIP[0] + 0.1, FLIP[1] + 0.5);
  const swap = seg(t, SWAP[0], SWAP[1]);
  const lockP = seg(t, LOCK[0], LOCK[1]);
  const green = seg(t, FLIP[0] + 0.45, FLIP[0] + 0.85);

  // Coin: idles with a slow sway, turns one and a half times to its MUSD face, then recedes as the card arrives.
  const away = E.io3(seg(t, SWAP[0], SWAP[0] + 0.8));
  coin3.visible = away < 1;
  coin3.position.set(lerp(0, 2.2, away), 0.12 + Math.sin(t * 1.4) * 0.06, lerp(0, -1.2, away));
  coin3.rotation.set(Math.sin(t * 0.9) * 0.08, Math.sin(t * 0.8) * 0.3 + Math.PI * 3 * E.spring(flip) + away * Math.PI * 2, 0);
  coin3.scale.setScalar(Math.max(1e-4, E.spring(seg(t, -0.2, 0.9)) * (1 - away)));
  edgeMat.color.copy(cA).lerp(cB, green);

  for (let k = 0; k < SWARM; k++) {
    const a = rnd(k) * Math.PI * 2 + t * (0.18 + rnd(k + 50) * 0.3);
    const rad = 2.6 + rnd(k + 100) * 4.2;
    const x = Math.cos(a) * rad;
    const show = E.spring(seg(t, 0.3 + k * 0.012, 1.3 + k * 0.012)) * (1 - E.io3(seg(t, SWAP[0] - 0.2 + rnd(k) * 0.5, SWAP[0] + 0.6 + rnd(k) * 0.5)));
    dummy.position.set(x, -1.2 + rnd(k + 200) * 4.2 + Math.sin(t + k) * 0.12, -3 - rnd(k + 300) * 6 + Math.sin(a) * 0.8);
    dummy.rotation.set(t * (0.6 + rnd(k + 400)) + k, t * (0.5 + rnd(k + 450)) + k * 2, 0);
    dummy.scale.setScalar(Math.max(1e-4, show * (0.7 + rnd(k + 600) * 1.3)));
    dummy.updateMatrix();
    swarm.setMatrixAt(k, dummy.matrix);
    // The colour change sweeps across from left to right.
    swarm.setColorAt(k, cTmp.copy(cA).lerp(cB, seg(t, FLIP[0] + 0.3 + (x + 7) * 0.05, FLIP[0] + 0.7 + (x + 7) * 0.05)));
  }
  swarm.instanceMatrix.needsUpdate = true;
  swarm.instanceColor.needsUpdate = true;
  swarm.visible = t < SWAP[0] + 1.2;

  // Card: spins up out of the coin's place, floats, then spins down into the tile.
  const cardIn = E.spring(seg(t, SWAP[0] + 0.25, SWAP[0] + 1.35));
  const cardOut = E.io3(seg(t, LOCK[0], LOCK[0] + 0.6));
  card.visible = cardIn > 0 && cardOut < 1;
  card.position.set(lerp(2.25, -2.2, cardOut), 0.08 + Math.sin(t * 1.3) * 0.06 + (1 - Math.min(1, cardIn)) * -1.2, 0);
  card.rotation.set(0.06 + Math.sin(t * 0.8) * 0.03, -0.42 + Math.sin(t * 0.7) * 0.08 + (1 - cardIn) * -Math.PI * 1.5 + cardOut * Math.PI * 2, -0.04);
  card.scale.setScalar(Math.max(1e-4, Math.min(1, cardIn * 1.2) * (1 - cardOut)));

  const tileIn = E.spring(seg(t, LOCK[0] + 0.35, LOCK[0] + 1.4));
  tile.visible = tileIn > 0;
  tile.position.set(-2.2, 0.36 + Math.sin(t * 1.3) * 0.03, 0);
  tile.rotation.set(0.05, (1 - tileIn) * -Math.PI * 2 + 0.22 + Math.sin(t * 0.8) * 0.06, 0);
  tile.scale.setScalar(Math.max(1e-4, Math.min(1, tileIn * 1.2)));

  // Type.
  poseText(t1a, t, 0.15, FLIP[0] - 0.15);
  poseText(t1b, t, 0.5, FLIP[0] - 0.05, 0.05);
  poseText(t2a, t, FLIP[1] - 0.45, SWAP[0] - 0.1);
  poseText(t2b, t, FLIP[1] - 0.2, SWAP[0], 0.06);
  poseText(t3a, t, SWAP[1] - 0.35, LOCK[0] - 0.15);
  poseText(t3b, t, SWAP[1] + 0.35, LOCK[0] - 0.05);
  poseText(t4a, t, LOCK[1] - 0.35, 99, 0.06);
  poseText(t4b, t, LOCK[1] + 0.25, 99, 0.02);

  // Light and colour follow the story: orange, then green, violet for the card, orange for the lockup.
  const cx = camera.position.x;
  const wWarm = (1 - green) + lockP;
  const wCool = green * (1 - swap);
  const wViolet = swap * (1 - lockP);
  warm.intensity = 60 * (1 - green) + 24 * lockP;
  cool.intensity = 60 * wCool + 14 * swap;
  violet.intensity = 40 * wViolet;
  warm.position.set(cx - 3, 1.2, 3.5);
  cool.position.set(cx + 3, 1.2, 3.5);
  violet.position.set(cx - 2, 2.5, 2.5);
  key.position.set(cx + 3, 7, 6);
  key.target.position.set(cx, 0, 0);
  const breathe = 0.9 + 0.1 * Math.sin(t * 1.7);
  glowWarm.material.opacity = 0.26 * wWarm * breathe;
  glowCool.material.opacity = 0.26 * wCool * breathe;
  glowViolet.material.opacity = 0.3 * wViolet * breathe;
  glowWarm.position.set(cx + lerp(2.5, 0, lockP), 1.2, -9);
  glowCool.position.set(cx - 2.5, 1.2, -9);
  glowViolet.position.set(cx + 2.5, 1.5, -9);
  dust.position.set(Math.sin(t * 0.1) * 0.6, t * 0.05, 0);
}

/** Renders output frame at time t: SUB sub-frames across half the frame time, averaged, then a vignette. */
export function frame(t, fps = 30, SUB = 8) {
  for (let k = 0; k < SUB; k++) {
    pose(t + ((k / SUB) * 0.5) / fps);
    composer.render();
    octx.globalAlpha = 1 / (k + 1);
    octx.drawImage(renderer.domElement, 0, 0, OUT_W, OUT_H);
  }
  octx.globalAlpha = 1;
  const v = octx.createRadialGradient(OUT_W / 2, OUT_H / 2, OUT_H * 0.45, OUT_W / 2, OUT_H / 2, OUT_W * 0.72);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,0,0,0.5)");
  octx.fillStyle = v;
  octx.fillRect(0, 0, OUT_W, OUT_H);
}

window.frame = frame;
window.DURATION = DURATION;
window.ready = true;

if (!new URLSearchParams(location.search).has("render")) {
  const t0 = performance.now();
  (function loop() {
    frame(((performance.now() - t0) / 1000) % DURATION, 30, 1);
    requestAnimationFrame(loop);
  })();
}
