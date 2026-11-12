// Shared three.js helpers for the 3D spots (billboard, youtube): canvas textures, extruded type, coin faces.
// 2D helpers (setFont, clamp, E, C…) come from ads/lib.js, loaded as a classic script before the scene module.
import * as THREE from "three";

export const seg = (t, a, b) => clamp((t - a) / (b - a));
export const canvasOf = (w, h) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")];
};
export const texOf = (canvas, color = true) => {
  const t = new THREE.CanvasTexture(canvas);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
};
const shade = (hexColor, k) => new THREE.Color(hexColor).multiplyScalar(k);

/**
 * Extruded type. Each character is a stack of alpha-tested planes (a lit-looking face over darker sides) on its own
 * pivot, so characters can flip in and out one by one. Returns {group, chars, width}; x is the left edge, y the baseline.
 */
export function makeText(scene, str, o = {}) {
  const { size = 1, weight = 650, color = C.white, depth = 0.16, layers = 14, maxWidth } = o;
  const PX = 360;
  const PAD = 36;
  const [, m] = canvasOf(8, 8);
  setFont(m, PX, weight);
  const upTo = (i) => m.measureText(str.slice(0, i)).width;
  const s = Math.min(size, maxWidth ? maxWidth / (upTo(str.length) / PX) : size);
  const k = s / PX;
  const group = new THREE.Group();
  const chars = [];
  [...str].forEach((ch, i) => {
    if (ch === " ") return;
    const adv = upTo(i + 1) - upTo(i);
    m.letterSpacing = "0px";
    const gw = Math.ceil(m.measureText(ch).width) + PAD * 2;
    setFont(m, PX, weight);
    const gh = Math.ceil(PX * 1.5);
    const draw = (fill) => {
      const [c, g] = canvasOf(gw, gh);
      setFont(g, PX, weight);
      g.letterSpacing = "0px";
      g.fillStyle = fill(g);
      g.fillText(ch, PAD, PX * 1.1);
      return texOf(c);
    };
    const face = draw((g) => {
      const gr = g.createLinearGradient(0, PX * 0.3, 0, PX * 1.15);
      gr.addColorStop(0, "#" + new THREE.Color(color).lerp(new THREE.Color("#ffffff"), 0.35).getHexString());
      gr.addColorStop(1, color);
      return gr;
    });
    const side = draw(() => "#ffffff");
    const geo = new THREE.PlaneGeometry(gw * k, gh * k);
    const pivot = new THREE.Group();
    pivot.position.x = (upTo(i) + adv / 2) * k;
    for (let l = layers - 1; l >= 0; l--) {
      const mat =
        l === 0
          ? new THREE.MeshBasicMaterial({ map: face, alphaTest: 0.5, side: THREE.DoubleSide })
          : new THREE.MeshBasicMaterial({ map: side, alphaTest: 0.5, side: THREE.DoubleSide, color: shade(color, 0.5 - (0.32 * l) / layers) });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set((gw / 2 - PAD - adv / 2) * k, 0.35 * s, (-l * depth * s) / layers);
      if (l === 0) {
        mesh.castShadow = true;
        mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: face, alphaTest: 0.5 });
      }
      pivot.add(mesh);
    }
    group.add(pivot);
    chars.push(pivot);
  });
  scene.add(group);
  return { group, chars, size: s, width: upTo(str.length) * k };
}
/** Characters flip up into place one after another from `tin`, and tip away from `tout`. */
export function poseText(T, t, tin, tout, stagger = 0.04) {
  T.chars.forEach((p, i) => {
    const a = E.spring(seg(t, tin + i * stagger, tin + i * stagger + 0.8));
    const b = E.io3(seg(t, tout + i * 0.018, tout + i * 0.018 + 0.36));
    p.visible = a > 0 && b < 1;
    p.rotation.x = (1 - a) * (-Math.PI / 2) + b * (Math.PI / 2);
    p.rotation.y = (1 - a) * 0.7;
    p.position.y = (a - 1) * 0.5 * T.size + b * 0.5 * T.size;
    p.position.z = (1 - a) * 0.6;
    p.scale.setScalar(Math.max(1e-4, Math.min(1, a * 1.3) * (1 - b)));
  });
}

/** A coin face material: flat colour, a ring and a glyph, embossed with a bump map. `extra(ctx, ink)` draws more artwork. */
export function coinFace(fill, glyph, glyphSize, dy, turn, extra) {
  const [c, g] = canvasOf(1024, 1024);
  const [bc, b] = canvasOf(1024, 1024);
  g.fillStyle = fill;
  g.fillRect(0, 0, 1024, 1024);
  b.fillStyle = "#000";
  b.fillRect(0, 0, 1024, 1024);
  b.filter = "blur(5px)";
  for (const [ctx, ink, line] of [[g, "#ffffff", "rgba(255,255,255,0.4)"], [b, "#ffffff", "#9a9a9a"]]) {
    ctx.strokeStyle = line;
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.arc(512, 512, 410, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = `700 ${glyphSize}px Geist, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillStyle = ink;
    ctx.fillText(glyph, 512, 512 + dy);
    if (extra) extra(ctx, ink);
  }
  // The cylinder's caps come out a quarter turn round; turn the artwork back upright.
  const maps = [texOf(c), texOf(bc, false)];
  for (const m of maps) {
    m.center.set(0.5, 0.5);
    m.rotation = turn;
  }
  return new THREE.MeshStandardMaterial({ map: maps[0], bumpMap: maps[1], bumpScale: 5, metalness: 0.82, roughness: 0.3 });
}
