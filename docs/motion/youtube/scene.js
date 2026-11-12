// The YouTube film: 30 s, 1920×1080, for merchants. Five 3D stages laid out along the x axis and filmed by one camera
// that whips between them; the lens has real depth of field (every frame averages many views through a wide aperture)
// and the floor is a mirror. Everything is a pure function of time.
// 2D helpers come from ../ads/lib.js, logos from ../ads/logos.js, and the phone's screen replays the checkout scenes
// from ../ads/ads.js.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { Reflector } from "three/addons/objects/Reflector.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { canvasOf, texOf, seg, makeText as kitText, poseText, coinFace } from "../three-kit.js";

export const DURATION = 30;
const OUT_W = 1920;
const OUT_H = 1080;
const SS = 2;
const APERTURE = 0.055; // lens radius in world units: larger blurs the out-of-focus parts more
const FLOOR = -1.75;
const GAP = 70; // distance between stages

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
scene.fog = new THREE.Fog(C.ink, 12, 36);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.75;
const camera = new THREE.PerspectiveCamera(32, OUT_W / OUT_H, 0.1, 120);

const composer = new EffectComposer(renderer);
composer.setPixelRatio(SS);
composer.setSize(OUT_W, OUT_H);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(OUT_W, OUT_H), 0.2, 0.6, 1.05));
composer.addPass(new OutputPass());

const S = (k, x = 0, y = 0, z = 0) => [k * GAP + x, y, z]; // a point on stage k
const makeText = (str, o) => kitText(scene, str, o);
/** Puts a text block's left end (or its centre) at a point. */
const place = (T, [x, y, z], centre = false) => (T.group.position.set(centre ? x - T.width / 2 : x, y, z), T);
const io = E.io3;

// ---------- set: mirror floor, lights, washes, dust

const mirror = new Reflector(new THREE.PlaneGeometry(GAP * 6, 160), { textureWidth: 1920, textureHeight: 1080, clipBias: 0.003 });
mirror.rotation.x = -Math.PI / 2;
mirror.position.set(GAP * 2, FLOOR, -20);
// A dark, slightly see-through sheet over the mirror: reflections stay, but dimmed, and it catches shadows.
const sheet = new THREE.Mesh(
  new THREE.PlaneGeometry(GAP * 6, 160),
  new THREE.MeshStandardMaterial({ color: "#0e0c0b", roughness: 0.9, metalness: 0, envMapIntensity: 0.04, transparent: true, opacity: 0.8 }),
);
sheet.rotation.x = -Math.PI / 2;
sheet.position.set(GAP * 2, FLOOR + 0.004, -20);
sheet.receiveShadow = true;
scene.add(mirror, sheet);

const key = new THREE.DirectionalLight("#ffffff", 2.4);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -11, right: 11, top: 8, bottom: -8, near: 1, far: 40 });
key.shadow.radius = 8;
key.shadow.bias = -0.0004;
scene.add(key, key.target);
const warm = new THREE.PointLight(C.signal, 0, 34, 1.6);
const cool = new THREE.PointLight(C.musd4, 0, 34, 1.6);
const violet = new THREE.PointLight(C.agent, 0, 34, 1.6);
scene.add(warm, cool, violet);

const [glowC, glowG] = canvasOf(256, 256);
const gr = glowG.createRadialGradient(128, 128, 0, 128, 128, 128);
gr.addColorStop(0, "rgba(255,255,255,1)");
gr.addColorStop(1, "rgba(255,255,255,0)");
glowG.fillStyle = gr;
glowG.fillRect(0, 0, 256, 256);
const glowTex = texOf(glowC);
const wash = (color) => {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(26, 26),
    new THREE.MeshBasicMaterial({ map: glowTex, color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
  );
  scene.add(mesh);
  return mesh;
};
const washWarm = wash(C.signal);
const washCool = wash(C.musd);
const washViolet = wash(C.agent);

const DUST = 1500;
const dustPos = new Float32Array(DUST * 3);
for (let i = 0; i < DUST; i++) dustPos.set([-14 + rnd(i) * (GAP * 4 + 28), FLOOR + rnd(i + 500) * 8, 9 - rnd(i + 900) * 40], i * 3);
const dustGeo = new THREE.BufferGeometry();
dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ map: glowTex, size: 0.07, color: "#ffffff", transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
scene.add(dust);

// ---------- coins

const TURN = Math.PI / 2;
const faces = {
  btc: coinFace(C.btc, "₿", 620, 215, TURN),
  musd: coinFace(C.musd, "M", 560, 195, TURN),
  mezo: coinFace(C.mezo, "", 10, 0, TURN, (ctx, ink) => {
    ctx.save();
    ctx.translate(512 - 310, 512 - 85);
    ctx.scale(620 / 320, 620 / 320);
    ctx.translate(0, -116);
    ctx.fillStyle = ink;
    ctx.fill(new Path2D(LOGOS.mezoMark.paths[0][0]));
    ctx.restore();
  }),
  borrow: coinFace(C.amber, "", 10, 0, TURN, (ctx, ink) => lock(ctx, 512, 520, 430, ink)),
};
const edge = (color) => new THREE.MeshStandardMaterial({ color, metalness: 0.95, roughness: 0.22 });
const edges = { btc: edge(C.btc), musd: edge(C.musd), mezo: edge(C.mezo), borrow: edge(C.amber) };
/** A large coin with a raised rim and the same face on both sides. */
function heroCoin(kind, R) {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(R, R, R * 0.16, 96), [edges[kind], faces[kind], faces[kind]]);
  disc.rotation.x = Math.PI / 2;
  disc.castShadow = true;
  g.add(disc);
  for (const z of [R * 0.08, -R * 0.08]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R * 0.965, R * 0.042, 16, 96), edges[kind]);
    rim.position.z = z;
    g.add(rim);
  }
  scene.add(g);
  return g;
}

// ---------- stage 0: a river of Bitcoin flows through the ring and comes out as MUSD

const RIVER = 240;
const RIVER_Y = -0.55;
const smallCoin = new THREE.CylinderGeometry(0.2, 0.2, 0.042, 48);
const riverBtc = new THREE.InstancedMesh(smallCoin, [edges.btc, faces.btc, faces.btc], RIVER);
const riverMusd = new THREE.InstancedMesh(smallCoin, [edges.musd, faces.musd, faces.musd], RIVER);
riverBtc.castShadow = riverMusd.castShadow = true;
riverBtc.frustumCulled = riverMusd.frustumCulled = false;
scene.add(riverBtc, riverMusd);
const dummy = new THREE.Object3D();

const ring = new THREE.Group();
ring.add(new THREE.Mesh(new THREE.TorusGeometry(1.62, 0.13, 24, 128), new THREE.MeshStandardMaterial({ color: "#2a2523", metalness: 1, roughness: 0.28 })));
const ringLight = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.04, 16, 128), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.1, 1.8) }));
const portal = new THREE.Mesh(
  new THREE.CircleGeometry(1.42, 64),
  new THREE.MeshBasicMaterial({ map: glowTex, color: C.musd4, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
);
ring.add(ringLight, portal);
ring.rotation.y = Math.PI / 2;
ring.traverse((m) => (m.castShadow = m.isMesh && m !== portal && m !== ringLight));
scene.add(ring);

const tA1 = place(makeText("Your customers", { size: 0.62 }), S(0, -10.9, 2.1, 1.2));
const tA2 = place(makeText("hold Bitcoin.", { size: 1.12, maxWidth: 6.0, color: C.signal4 }), S(0, -10.9, 1.0, 1.2));
const tB1 = place(makeText("You get paid", { size: 0.62 }), S(0, 1.5, 2.1, 1.2));
const tB2 = place(makeText("in MUSD.", { size: 1.12, maxWidth: 5.6, color: C.musd4 }), S(0, 1.5, 1.0, 1.2));
const tB3 = place(makeText("The Bitcoin-backed dollar.", { size: 0.3, weight: 500, color: C.stone3, depth: 0.08, layers: 5 }), S(0, 1.54, 0.52, 1.2));

// ---------- stage 1: the checkout, live on a phone, with the four ways to pay in orbit

const phone = new THREE.Group();
const PW = 2.06;
const PH = 3.62;
const body = new THREE.Mesh(new RoundedBoxGeometry(PW, PH, 0.2, 8, 0.24), new THREE.MeshStandardMaterial({ color: "#1b1918", metalness: 0.9, roughness: 0.32 }));
body.castShadow = true;
const [screenC, sctx] = canvasOf(1080, 1920);
const screenTex = texOf(screenC);
const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.9 * (1920 / 1080)), new THREE.MeshBasicMaterial({ map: screenTex, alphaTest: 0.5, color: "#f0f0f0" }));
screen.position.z = 0.102;
phone.add(body, screen);
scene.add(phone);
/** Paints the phone's screen: the checkout from the vertical ad (3.2 s), then the paid screen. */
function drawScreen(u) {
  NOW = Math.max(0, u);
  sctx.setTransform(1, 0, 0, 1, 0, 0);
  sctx.globalAlpha = 1;
  sctx.globalCompositeOperation = "source-over";
  sctx.clearRect(0, 0, 1080, 1920);
  if (u < 3.2) sceneCheckout(sctx, u);
  else sceneDrop(sctx, u - 3.2);
  sctx.globalCompositeOperation = "destination-in";
  rr(sctx, 0, 0, 1080, 1920, 96);
  sctx.fillStyle = "#000";
  sctx.fill();
  screenTex.needsUpdate = true;
}
const PAY = 8.5; // the phone's screen starts here; it shows "paid" 3.2 s later
const PAID = PAY + 3.2;
const orbit = ["musd", "btc", "mezo", "borrow"].map((k) => heroCoin(k, 0.44));

const tC1 = place(makeText("They pay", { size: 0.62 }), S(1, -3.95, 1.5, 0.4));
const tC2 = place(makeText("any way.", { size: 1.2, maxWidth: 4.1, color: C.signal4 }), S(1, -3.95, 0.4, 0.4));
const tC3 = place(makeText("MUSD · Bitcoin · MEZO · or a loan against BTC", { size: 0.215, weight: 500, color: C.stone3, depth: 0.08, layers: 5, maxWidth: 4.1 }), S(1, -3.91, -0.05, 0.4));
const tD1 = place(makeText("You get the", { size: 0.62 }), S(1, -3.95, 1.5, 0.4));
const tD2 = place(makeText("exact amount.", { size: 1.2, maxWidth: 4.2, color: C.musd4 }), S(1, -3.95, 0.52, 0.4));
const tD3 = place(makeText("In MUSD. The contract makes sure.", { size: 0.27, weight: 500, color: C.stone3, depth: 0.08, layers: 5, maxWidth: 4.1 }), S(1, -3.91, 0.06, 0.4));

// ---------- stage 2: four lines stacked in depth; the camera dives from one to the next

const LINES = [
  ["No wallet.", "Sign up with a passkey.", C.white],
  ["No gas fees.", "We cover the network fee.", C.signal4],
  ["No seed phrase.", "Nothing to write down.", C.agent3],
  ["No price swings.", "You're paid in stable MUSD.", C.musd4],
];
const L0 = 14.3; // the camera reaches line 0
const LSTEP = 1.4;
const lineX = (k) => (k % 2 ? 2.4 : -2.4);
const lines = LINES.map(([big, small, color], k) => [
  place(makeText(big, { size: 1.15, maxWidth: 6.6, weight: 700, color }), S(2, lineX(k), 0.2, -10 * k), true),
  place(makeText(small, { size: 0.36, weight: 500, color: C.stone3, depth: 0.08, layers: 5 }), S(2, lineX(k), -0.5, -10 * k), true),
]);
// Light bars along the corridor: they streak past as the camera dives.
const BARS = 110;
const barGeo = new THREE.BoxGeometry(0.035, 0.035, 2.6);
const bars = [new THREE.Color(2.6, 1.1, 0.3), new THREE.Color(1.3, 0.9, 2.8)].map((color, c) => {
  const mesh = new THREE.InstancedMesh(barGeo, new THREE.MeshBasicMaterial({ color }), BARS / 2);
  for (let i = 0; i < BARS / 2; i++) {
    const j = i * 2 + c;
    dummy.position.set(2 * GAP + (rnd(j) < 0.5 ? -1 : 1) * (4.6 + rnd(j + 30) * 6), FLOOR + 0.3 + rnd(j + 60) * 5.5, 9 - rnd(j + 90) * 48);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  scene.add(mesh);
  return mesh;
});

// ---------- stage 3: where it plugs in, around the Mezout mark

const CARDS = [
  ["Shopify", "shopify", 10],
  ["WooCommerce", "woocommerce", -38],
  ["Payment links", C.signal, 62],
  ["QR codes", C.white, 150],
  ["REST API", C.musd4, 200],
  ["AI agents · x402", C.agent3, 254],
];
const cards = CARDS.map(([label, markOrDot]) => {
  const [c, g] = canvasOf(960, 380);
  rr(g, 4, 4, 952, 372, 96);
  g.fillStyle = "#1c1917";
  g.fill();
  g.strokeStyle = "rgba(255,255,255,0.22)";
  g.lineWidth = 6;
  g.stroke();
  const size = 96;
  const isLogo = !!LOGOS[markOrDot];
  const mh = isLogo ? (markOrDot === "woocommerce" ? 62 : 120) : 44;
  const mw = isLogo ? logoW(markOrDot, mh) : 44;
  const size2 = Math.min(size, ((960 - 150 - mw - 36) / measure(g, label, size, 600)) * size);
  const tw = measure(g, label, size2, 600);
  let x = (960 - (mw + 36 + tw)) / 2;
  if (isLogo) logo(g, markOrDot, x, 190, mh, C.white);
  else {
    g.beginPath();
    g.arc(x + 22, 190, 22, 0, Math.PI * 2);
    g.fillStyle = markOrDot;
    g.fill();
  }
  txt(g, label, x + mw + 36, 190 + size2 * 0.35, { size: size2, weight: 600 });
  const group = new THREE.Group();
  const slab = new THREE.Mesh(new RoundedBoxGeometry(2.7, 1.07, 0.1, 5, 0.26), new THREE.MeshStandardMaterial({ color: "#2a2523", metalness: 0.7, roughness: 0.35 }));
  slab.castShadow = true;
  const front = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 1.07), new THREE.MeshBasicMaterial({ map: texOf(c), alphaTest: 0.5 }));
  front.position.z = 0.052;
  group.add(slab, front);
  scene.add(group);
  return group;
});

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

const tE1 = place(makeText("Plugs into your store.", { size: 0.86, maxWidth: 9 }), S(3, 0, 2.55, 0), true);
const tE2 = place(makeText("AI agents can pay you too.", { size: 0.86, maxWidth: 9, color: C.agent3 }), S(3, 0, 2.55, 0), true);

// ---------- stage 4: the lockup

const tF1 = place(makeText("Mezout", { size: 1.25, weight: 700 }), S(4, -1.55, 0.62, 0));
const tF2 = place(makeText("Start getting paid.", { size: 0.74, color: C.signal4 }), S(4, 0, -0.42, 0), true);
const tF3 = place(makeText("usemezout.vercel.app", { size: 0.44, weight: 600, depth: 0.08, layers: 6 }), S(4, 0, -1.02, 0), true);
const [footC, fg] = canvasOf(1600, 120);
builtOnMezo(fg, 800, 78, 56, 1, "· sign up with a passkey · live on testnet");
const foot = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 0.39), new THREE.MeshBasicMaterial({ map: texOf(footC), transparent: true, opacity: 0, depthWrite: false }));
foot.position.set(...S(4, 0, -1.42, 0.05));
scene.add(foot);

// ---------- camera: [time, position, look-at (also the focus point), ease into this key]

const CAM = [
  [0, S(0, -7.9, 1.0, 8.8), S(0, -7.9, 0.85, 1.2), "lin"],
  [3.5, S(0, -7.4, 0.95, 8.0), S(0, -7.7, 0.85, 1.2), "lin"],
  [4.6, S(0, 3.6, 1.0, 9.2), S(0, 3.9, 0.85, 1.2), "io"],
  [7.5, S(0, 4.3, 0.95, 8.5), S(0, 4.1, 0.85, 1.2), "lin"],
  [8.3, S(1, -0.6, 0.7, 8.8), S(1, 0, 0.35, 0.4), "io"],
  [13.5, S(1, 0.9, 0.6, 8.2), S(1, 0.1, 0.35, 0.4), "lin"],
];
LINES.forEach((_, k) => {
  const x = lineX(k);
  CAM.push([L0 + k * LSTEP, S(2, x * 0.6, 0.5, -10 * k + 8.6), S(2, x * 0.8, 0.05, -10 * k), "io"]);
  CAM.push([L0 + k * LSTEP + 0.95, S(2, x * 0.66, 0.45, -10 * k + 7.9), S(2, x * 0.8, 0.05, -10 * k), "lin"]);
});
CAM.push(
  [20.3, S(3, 0, 1.6, 10.8), S(3, 0, 0.75, 0), "io"],
  [24.6, S(3, 0.6, 1.4, 9.8), S(3, 0, 0.75, 0), "lin"],
  [25.4, S(4, -0.4, 0.25, 9.9), S(4, 0, -0.15, 0), "io"],
  [30, S(4, 0, 0.15, 9.0), S(4, 0, -0.15, 0), "lin"],
);
const EASE = { lin: (x) => x, io };
const v3 = (a, b, u) => new THREE.Vector3(lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u));
const target = new THREE.Vector3();
const basePos = new THREE.Vector3();
let roll = 0;
const cA = new THREE.Color();

function pose(t) {
  NOW = t;
  let i = 0;
  while (i + 2 < CAM.length && t >= CAM[i + 1][0]) i++;
  const [ta, pa, la] = CAM[i];
  const [tb, pb, lb, ease] = CAM[i + 1];
  const u = EASE[ease](seg(t, ta, tb));
  basePos.copy(v3(pa, pb, u));
  basePos.y += Math.sin(t * 0.9) * 0.03;
  target.copy(v3(la, lb, u));
  // A little bank on every whip.
  roll = 0;
  for (const [a, b, amt] of [[3.5, 4.6, 0.05], [7.5, 8.3, -0.06], [13.5, 14.3, 0.06], [19.6, 20.3, -0.06], [24.6, 25.4, 0.05]]) roll += Math.sin(seg(t, a, b) * Math.PI) * amt;

  // Stage 0.
  const on0 = t < 8.4;
  riverBtc.visible = riverMusd.visible = ring.visible = on0;
  if (on0) {
    for (let k = 0; k < RIVER; k++) {
      const s = (k / RIVER + t * 0.05 + rnd(k) * 0.004) % 1;
      const x = lerp(-17, 17, s);
      const spread = 0.22 + 0.78 * io(clamp(Math.abs(x) / 6.5));
      const a = rnd(k + 10) * Math.PI * 2;
      const r = Math.sqrt(rnd(k + 20)) * 0.75 * spread;
      dummy.position.set(x, RIVER_Y + 0.26 * Math.sin(x * 0.45) + Math.cos(a) * r, Math.sin(a) * r * 1.5);
      dummy.rotation.set(t * (0.8 + rnd(k + 30) * 1.4) + k, t * (0.6 + rnd(k + 40) * 1.2) + k * 2, 0);
      const sc = Math.min(1, s * 14, (1 - s) * 14) * (0.75 + rnd(k + 50) * 0.7) * E.spring(seg(t, -0.4 + rnd(k) * 0.5, 0.6 + rnd(k) * 0.5));
      dummy.scale.setScalar(Math.max(1e-4, x < 0 ? sc : 0));
      dummy.updateMatrix();
      riverBtc.setMatrixAt(k, dummy.matrix);
      dummy.scale.setScalar(Math.max(1e-4, x >= 0 ? sc * (1 + 0.6 * Math.exp(-x * 2.2)) : 0));
      dummy.updateMatrix();
      riverMusd.setMatrixAt(k, dummy.matrix);
    }
    riverBtc.instanceMatrix.needsUpdate = riverMusd.instanceMatrix.needsUpdate = true;
    ring.position.set(0, RIVER_Y, 0);
    ring.scale.setScalar(0.82 * (1 + 0.015 * Math.sin(t * 6)));
    portal.material.opacity = 0.4 + 0.12 * Math.sin(t * 5);
    portal.rotation.z = t * 0.6;
  }
  poseText(tA1, t, 0.15, 3.3);
  poseText(tA2, t, 0.5, 3.4, 0.045);
  poseText(tB1, t, 4.35, 7.3);
  poseText(tB2, t, 4.6, 7.4, 0.05);
  poseText(tB3, t, 5.3, 7.35, 0.012);

  // Stage 1.
  const on1 = t > 7.6 && t < 14.4;
  phone.visible = on1;
  const pin = E.spring(seg(t, 8.0, 9.2));
  const paidPop = Math.exp(-Math.max(0, t - PAID) * 5) * (t >= PAID ? 1 : 0);
  phone.position.set(GAP + 2.7, 0.2 + Math.sin(t * 1.2) * 0.05 + (1 - Math.min(1, pin)) * -3, 0.4);
  phone.rotation.set(0.05 + Math.sin(t * 0.8) * 0.02, lerp(-0.62, -0.2, io(seg(t, 8.2, 13.5))) + (1 - pin) * -1.6, -0.03);
  phone.scale.setScalar(1 + 0.05 * paidPop);
  orbit.forEach((c, k) => {
    const show = E.spring(seg(t, 8.7 + k * 0.15, 9.6 + k * 0.15));
    const inward = io(seg(t, PAID - 0.5, PAID - 0.05));
    c.visible = on1 && show > 0 && inward < 1;
    const a = t * 1.15 + (k * Math.PI) / 2;
    const rad = (1 - inward) * (0.6 + 0.4 * Math.min(1, show));
    // The orbit stays behind the phone, so the coins never cover its screen.
    c.position.set(GAP + 2.7 + Math.cos(a) * 1.75 * rad, 0.2 + Math.sin(a * 2 + k) * 1.1 * rad, 0.4 - (0.5 + Math.abs(Math.sin(a)) * 1.3) * rad - inward * 0.2);
    c.rotation.set(Math.sin(t + k) * 0.25, -a * 0.9, 0);
    c.scale.setScalar(Math.max(1e-4, Math.min(1, show * 1.2) * (1 - inward)));
  });
  poseText(tC1, t, 8.5, PAID - 0.45);
  poseText(tC2, t, 8.75, PAID - 0.35, 0.05);
  poseText(tC3, t, 9.5, PAID - 0.4, 0.008);
  poseText(tD1, t, PAID - 0.05, 13.35);
  poseText(tD2, t, PAID + 0.15, 13.45, 0.04);
  poseText(tD3, t, PAID + 0.8, 13.4, 0.01);

  // Stage 2.
  bars.forEach((b) => (b.visible = t > 13.4 && t < 20.4));
  lines.forEach(([big, small], k) => {
    const leave = L0 + k * LSTEP + 0.9;
    poseText(big, t, k ? L0 + k * LSTEP - 0.4 : 13.9, leave, 0.035);
    poseText(small, t, L0 + k * LSTEP + 0.15, leave - 0.05, 0.012);
  });

  // Stage 3, and the tile that carries on into the lockup.
  const on3 = t > 19.7 && t < 25.5;
  const spin = -0.25 + (t - 20.3) * 0.42;
  const agents = io(seg(t, 22.7, 23.3));
  cards.forEach((c, k) => {
    const show = E.spring(seg(t, 20.2 + k * 0.09, 21.1 + k * 0.09)) * (1 - io(seg(t, 24.4, 24.8)));
    c.visible = on3 && show > 0;
    const a = (CARDS[k][2] * Math.PI) / 180 + spin;
    c.position.set(3 * GAP + Math.sin(a) * 4.4, -0.62 + Math.sin(t * 1.2 + k) * 0.1, Math.cos(a) * 2.6);
    c.rotation.set(0, Math.sin(a) * 0.5, Math.sin(t * 0.9 + k) * 0.02);
    c.scale.setScalar(Math.max(1e-4, Math.min(1, show * 1.15) * (k === 5 ? 1 + 0.22 * agents : 1)));
  });
  const tileIn = E.spring(seg(t, 20.1, 21.2));
  const toEnd = io(seg(t, 24.6, 25.4));
  tile.visible = tileIn > 0;
  tile.position.set(lerp(3 * GAP, 4 * GAP - 2.52, toEnd), lerp(0.85, 1.05, toEnd) + Math.sin(t * 1.3) * 0.04, 0);
  tile.rotation.set(0.05, (1 - tileIn) * -Math.PI * 2 + toEnd * Math.PI * 2 + 0.2 + Math.sin(t * 0.8) * 0.08, 0);
  tile.scale.setScalar(Math.max(1e-4, Math.min(1, tileIn * 1.2)));
  poseText(tE1, t, 20.45, 22.45, 0.03);
  poseText(tE2, t, 22.75, 24.5, 0.028);

  // Stage 4.
  poseText(tF1, t, 25.35, 99, 0.06);
  poseText(tF2, t, 25.9, 99, 0.03);
  poseText(tF3, t, 26.5, 99, 0.02);
  foot.material.opacity = E.out3(seg(t, 27.1, 27.7));

  // Colour follows the story: orange, green, orange → green on "paid", violet + orange, violet, orange.
  const w0 = 1 - io(seg(t, 3.7, 4.6));
  const stage1 = seg(t, 7.9, 8.5) * (1 - seg(t, 13.5, 14.1));
  const paid = seg(t, PAID - 0.1, PAID + 0.2);
  const stage2 = seg(t, 13.9, 14.4) * (1 - seg(t, 19.6, 20.2));
  const stage3 = seg(t, 20, 20.5) * (1 - seg(t, 24.6, 25.2));
  const stage4 = seg(t, 25, 25.6);
  const wWarm = w0 + stage1 * (1 - paid) + stage2 * 0.6 + stage4 + stage3 * 0.25 * (1 - agents);
  const wCool = (1 - w0) * (1 - seg(t, 7.5, 8.1)) + stage1 * paid;
  const wViolet = stage2 * 0.7 + stage3 * (0.6 + 0.4 * agents);
  warm.intensity = 34 * wWarm;
  cool.intensity = 34 * wCool + 50 * paidPop;
  violet.intensity = 36 * wViolet;
  warm.position.copy(target).add(new THREE.Vector3(-3, 1.2, 3.6));
  cool.position.copy(target).add(new THREE.Vector3(3, 1.2, 3.6));
  violet.position.copy(target).add(new THREE.Vector3(-1.5, 2.6, 2.6));
  key.position.copy(target).add(new THREE.Vector3(3, 7.5, 6));
  key.target.position.copy(target);
  const breathe = 0.9 + 0.1 * Math.sin(t * 1.7);
  washWarm.material.opacity = 0.24 * Math.min(1, wWarm) * breathe;
  washCool.material.opacity = 0.24 * Math.min(1, wCool) * breathe;
  washViolet.material.opacity = 0.28 * Math.min(1, wViolet) * breathe;
  washWarm.position.copy(target).add(new THREE.Vector3(-2.5, 1.4, -11));
  washCool.position.copy(target).add(new THREE.Vector3(2.5, 1.4, -11));
  washViolet.position.copy(target).add(new THREE.Vector3(2, 1.8, -11.5));
  ringLight.material.color.copy(cA.setRGB(2.4, 2.1, 1.8)).multiplyScalar(1 + 0.25 * Math.sin(t * 6));
}

/** Points the camera for lens sample k of n: a point on the aperture disc, aimed at the focus point. */
function aim(k, n) {
  camera.position.copy(basePos);
  camera.lookAt(target);
  if (n > 1) {
    const r = APERTURE * Math.sqrt((k + 0.5) / n);
    const a = k * 2.399963;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    camera.position.addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r);
    camera.lookAt(target);
  }
  camera.rotateZ(roll);
}

/** Renders output frame at time t: SUB views spread over half the frame time and across the lens, averaged. */
export function frame(t, fps = 30, SUB = 20) {
  if (t > 7.6 && t < 14.4) drawScreen(t - PAY);
  for (let k = 0; k < SUB; k++) {
    pose(t + ((k / SUB) * 0.5) / fps);
    aim(k, SUB);
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
