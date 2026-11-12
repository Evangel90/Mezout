// Drawing engine for the vertical ads (1080×1920). Classic script: everything here is a global used by ads.js.
// Every drawing is a pure function of time, so a frame renders the same in the live preview and in the renderer.

// Frame size and beat length. These are the defaults (vertical, 150 BPM: one beat = 0.4 s = 12 frames at 30 fps);
// drawAd sets them from the ad being drawn (ad.w, ad.h, ad.bpm).
let W = 1080;
let H = 1920;
let B = 0.4;
let PULSE = 1; // how strongly backgrounds swell on the beat (ad.pulse)

const C = {
  ink: "#0c0a09",
  ink2: "#1c1917",
  stone8: "#292524",
  stone7: "#44403c",
  stone5: "#78716c",
  stone4: "#a8a29e",
  stone3: "#d6d3d1",
  stone2: "#e7e5e4",
  stone1: "#fafaf9",
  canvas: "#f3f2ef",
  white: "#ffffff",
  signal: "#ff6b14",
  signal4: "#ff8a3d",
  signal3: "#ffaa70",
  agent: "#7f5cff",
  agent3: "#bcaeff",
  musd: "#14ab64",
  musd4: "#35c77f",
  musd3: "#6fdfa6",
  musd6: "#0a8a50",
  musd9: "#0b482f",
  btc: "#f7931a",
  mezo: "#ff004d", // Mezo's own red
  amber: "#d97706",
  red: "#ef4444",
  redSoft: "#fecaca",
};

// ---------- maths

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
/** Progress 0..1 of an animation that starts at t0 and lasts d seconds. */
const pr = (t, t0, d) => clamp((t - t0) / d);
const E = {
  out3: (x) => 1 - (1 - x) ** 3,
  outExpo: (x) => (x >= 1 ? 1 : 1 - 2 ** (-10 * x)),
  in3: (x) => x ** 3,
  io3: (x) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2),
  spring: (x) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.exp(-7 * x) * Math.cos(11 * x)),
};
/** Repeatable pseudo-random number in 0..1 for an index. */
const rnd = (i) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgba = (h, a) => {
  const [r, g, b] = hex(h);
  return `rgba(${r},${g},${b},${a})`;
};
const mix = (a, b, t) => {
  const A = hex(a);
  const Bc = hex(b);
  return `rgb(${A.map((v, i) => Math.round(lerp(v, Bc[i], t))).join(",")})`;
};

/** The ad's clock, set by drawAd for every sub-frame; beatEnv() is 1 on each beat and decays after it. */
let NOW = 0;
const beatEnv = (rate = 6) => PULSE * Math.exp(-(((NOW % B) + B) % B) * rate);

// ---------- text

function setFont(ctx, size, weight = 650, mono = false) {
  ctx.font = `${weight} ${size}px ${mono ? '"Geist Mono", ui-monospace, monospace' : "Geist, system-ui, sans-serif"}`;
  ctx.letterSpacing = `${(mono ? 0 : -0.04) * size}px`;
}
function txt(ctx, s, x, y, o = {}) {
  const { size = 60, weight = 650, fill = C.white, align = "left", mono = false, alpha = 1 } = o;
  ctx.save();
  setFont(ctx, size, weight, mono);
  if (o.ls !== undefined) ctx.letterSpacing = `${o.ls * size}px`; // tracking in em
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = fill;
  ctx.globalAlpha *= alpha;
  ctx.fillText(s, x, y);
  ctx.restore();
}
function measure(ctx, s, size, weight = 650, mono = false) {
  ctx.save();
  setFont(ctx, size, weight, mono);
  const w = ctx.measureText(s).width;
  ctx.restore();
  return w;
}
/** Largest size up to maxSize at which every string fits in maxW. */
function fitSize(ctx, strings, maxW, maxSize, weight = 650) {
  const widest = Math.max(...strings.map((s) => measure(ctx, s, 100, weight)));
  return Math.min(maxSize, Math.floor((maxW / widest) * 100));
}
/**
 * Kinetic headline: each line {s, fill, at} slams in at its time (scale down, rise, fade). `out` is when the block
 * leaves. Lines are left-aligned at x; y is the first baseline.
 */
function headline(ctx, t, lines, o = {}) {
  const { x = 80, y = 700, maxSize = 160, maxW = 920, lh = 0.98, weight = 650, out = Infinity, align = "left" } = o;
  const size = o.size ?? fitSize(ctx, lines.map((l) => l.s), maxW, maxSize, weight);
  lines.forEach((l, i) => {
    const p = pr(t, l.at - 0.03, 0.24);
    if (p <= 0) return;
    const e = E.outExpo(p);
    const po = pr(t, out, 0.14);
    if (po >= 1) return;
    const by = y + i * size * lh;
    ctx.save();
    ctx.globalAlpha *= Math.min(1, p * 3) * (1 - po);
    ctx.translate(x, by - size * 0.35 + lerp(46, 0, e) - po * po * 140);
    const sc = lerp(1.28, 1, e);
    ctx.scale(sc, sc);
    txt(ctx, l.s, 0, size * 0.35, { size, weight, fill: l.fill || C.white, align });
    ctx.restore();
  });
  return size;
}
/** A line that fades and rises in at `at`. */
function riseIn(ctx, t, at, s, x, y, o = {}) {
  const p = pr(t, at, 0.3);
  if (p <= 0) return;
  const e = E.outExpo(p);
  txt(ctx, s, x, y + lerp(34, 0, e), { ...o, alpha: (o.alpha ?? 1) * Math.min(1, p * 2.5) });
}

/** A line whose words fade and rise in one after another from `at`. Left-aligned at x, or centred on it. */
function words(ctx, t, at, s, x, y, o = {}) {
  const { size = 60, weight = 500, stagger = 0.09, dur = 0.8, align = "left" } = o;
  let cx = align === "center" ? x - measure(ctx, s, size, weight) / 2 : x;
  s.split(" ").forEach((w, i) => {
    const p = pr(t, at + i * stagger, dur);
    if (p > 0) {
      const e = E.outExpo(p);
      txt(ctx, w, cx, y + lerp(size * 0.4, 0, e), { ...o, size, weight, align: "left", alpha: e });
    }
    cx += measure(ctx, w + " ", size, weight);
  });
}

// ---------- shapes

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
/** Background colour plus soft drifting glows [{x, y, r, c, a}] that swell on the beat. */
function bg(ctx, t, color, glows = []) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, W, H);
  const k = beatEnv();
  glows.forEach((g, i) => {
    const x = g.x + Math.sin(t * 0.9 + i * 2) * 70;
    const y = g.y + Math.cos(t * 0.7 + i) * 90;
    const r = g.r * (1 + 0.08 * k);
    const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, rgba(g.c, (g.a ?? 0.35) * (1 + 0.25 * k)));
    gr.addColorStop(1, rgba(g.c, 0));
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, W, H);
  });
}
/** Faint dot grid that drifts upward, for texture on flat backgrounds. */
function dots(ctx, t, color, a = 0.07) {
  ctx.save();
  ctx.fillStyle = rgba(color, a);
  const off = (t * 40) % 72;
  for (let y = -72; y < H + 72; y += 72) for (let x = 36; x < W; x += 72) ctx.fillRect(x - 2, y - off - 2, 4, 4);
  ctx.restore();
}
/** Check mark centred on (cx, cy), `s` wide; `draw` 0..1 strokes it on. */
function check(ctx, cx, cy, s, color, lw, draw = 1) {
  if (draw <= 0) return;
  const k = s / 12;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  ctx.moveTo(-6 * k, 0.5 * k);
  ctx.lineTo(-2 * k, 4.5 * k);
  ctx.lineTo(6 * k, -4.5 * k);
  const len = 18 * k;
  ctx.setLineDash([len, len]);
  ctx.lineDashOffset = len * (1 - draw);
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.restore();
}
function cross(ctx, cx, cy, s, color, lw) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  ctx.moveTo(-s / 2, -s / 2);
  ctx.lineTo(s / 2, s / 2);
  ctx.moveTo(s / 2, -s / 2);
  ctx.lineTo(-s / 2, s / 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.restore();
}
/** The Mezout mark: rounded square with a check, `s` wide, centred on (cx, cy). */
function mark(ctx, cx, cy, s, o = {}) {
  const { fill = C.white, stroke = C.ink, draw = 1 } = o;
  ctx.save();
  rr(ctx, cx - s / 2, cy - s / 2, s, s, s / 4);
  ctx.fillStyle = fill;
  ctx.fill();
  check(ctx, cx, cy + s * 0.01, s * 0.375, stroke, s * 0.094, draw);
  ctx.restore();
}
function lock(ctx, cx, cy, s, color) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s / 20, s / 20);
  rr(ctx, -7, -2, 14, 11, 2.5);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-4.2, -2);
  ctx.lineTo(-4.2, -5.2);
  ctx.arc(0, -5.2, 4.2, Math.PI, 0);
  ctx.lineTo(4.2, -2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.2;
  ctx.stroke();
  ctx.restore();
}
/** Mezo's wave mark in white, r*1.24 wide, centred on the origin. */
function mezoWave(ctx, r) {
  const h = (r * 1.24 * 88) / 320;
  ctx.save();
  ctx.translate(-r * 0.62, -h / 2);
  ctx.scale(h / 88, h / 88);
  ctx.translate(0, -116);
  ctx.fillStyle = C.white;
  ctx.fill(new Path2D(LOGOS.mezoMark.paths[0][0]));
  ctx.restore();
}
/** Token coin centred on (x, y). `flip` scales it horizontally (−1..1) for a coin-flip. */
function coin(ctx, x, y, r, kind, o = {}) {
  const { flip = 1, alpha = 1, rot = 0, shadow = true } = o;
  if (alpha <= 0 || r <= 0) return;
  const fill = { BTC: C.btc, MUSD: C.musd, MEZO: C.mezo, BORROW: C.amber }[kind];
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(Math.max(0.02, Math.abs(flip)), 1);
  ctx.globalAlpha *= alpha;
  if (shadow) {
    ctx.shadowColor = "rgba(0,0,0,0.28)";
    ctx.shadowBlur = r * 0.5;
    ctx.shadowOffsetY = r * 0.16;
  }
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth = r * 0.06;
  ctx.stroke();
  if (kind === "BTC") txt(ctx, "₿", 0, r * 0.4, { size: r * 1.15, weight: 700, align: "center" });
  if (kind === "MUSD") txt(ctx, "M", r * 0.02, r * 0.36, { size: r * 1.0, weight: 700, align: "center" });
  if (kind === "MEZO") mezoWave(ctx, r); // Mezo's wave, in white

  if (kind === "BORROW") lock(ctx, 0, 0, r * 1.0, C.white);
  ctx.restore();
}
/** Width of a brand mark from logos.js when drawn h tall. */
const logoW = (name, h) => (LOGOS[name].vb[2] / LOGOS[name].vb[3]) * h;
/** Draws a brand mark from logos.js h tall, left edge at x, centred on y. `ink` colours the parts with no fixed colour. */
function logo(ctx, name, x, y, h, ink = C.ink) {
  const [vx, vy, , vh] = LOGOS[name].vb;
  ctx.save();
  ctx.translate(x, y - h / 2);
  ctx.scale(h / vh, h / vh);
  ctx.translate(-vx, -vy);
  for (const [d, fill] of LOGOS[name].paths) {
    ctx.fillStyle = fill ?? ink;
    ctx.fill(new Path2D(d));
  }
  ctx.restore();
  return logoW(name, h);
}
/** Rounded pill with a label. Centred on (cx, cy), or left edge at cx with align "left". Returns its width. */
function pill(ctx, cx, cy, s, o = {}) {
  const { bg: fillBg = C.white, fg = C.ink, size = 56, weight = 600, mono = false, dot, align = "center", stroke } = o;
  const h = o.h ?? size * 1.9;
  const padX = o.padX ?? size * 0.75;
  // A brand mark (o.logo, from logos.js) sits before the label; wide lockups are drawn shorter.
  const markH = o.logo ? (logoW(o.logo, 1) > 2 ? size * 0.56 : size * 0.95) : 0;
  const dotW = o.logo ? logoW(o.logo, markH) + size * 0.32 : dot ? size * 0.75 : 0;
  const tw = measure(ctx, s, size, weight, mono);
  const w = tw + padX * 2 + dotW;
  const x = align === "left" ? cx : cx - w / 2;
  ctx.save();
  rr(ctx, x, cy - h / 2, w, h, h / 2);
  ctx.fillStyle = fillBg;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  if (o.logo) logo(ctx, o.logo, x + padX, cy, markH, fg);
  else if (dot) {
    ctx.beginPath();
    ctx.arc(x + padX + size * 0.2, cy, size * 0.24, 0, Math.PI * 2);
    ctx.fillStyle = dot;
    ctx.fill();
  }
  txt(ctx, s, x + padX + dotW, cy + size * 0.35, { size, weight, fill: fg, mono });
  ctx.restore();
  return w;
}
/** Runs fn scaled around (cx, cy) with a springy pop that starts at `at`. */
function pop(ctx, t, at, cx, cy, fn, o = {}) {
  const p = pr(t, at, o.dur ?? 0.5);
  if (p <= 0) return;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(o.rot ?? 0);
  const s = E.spring(p);
  ctx.scale(s, s);
  ctx.globalAlpha *= Math.min(1, p * 5);
  fn();
  ctx.restore();
}
/** Ring that expands and fades from (cx, cy), starting at `at`. */
function ring(ctx, t, at, cx, cy, r0, r1, color, lw = 8, dur = 0.5) {
  const p = pr(t, at, dur);
  if (p <= 0 || p >= 1) return;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, lerp(r0, r1, E.out3(p)), 0, Math.PI * 2);
  ctx.strokeStyle = rgba(color, (1 - p) * 0.8);
  ctx.lineWidth = lw * (1 - p * 0.6);
  ctx.stroke();
  ctx.restore();
}
/** Four-point sparkle centred on (cx, cy). */
function sparkle(ctx, cx, cy, s, color, rot = 0) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s);
    ctx.lineTo(Math.cos(a + Math.PI / 4) * s * 0.22, Math.sin(a + Math.PI / 4) * s * 0.22);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

// ---------- timeline

/**
 * Draws ad time t. An ad is {beats, scenes: [{at, draw(ctx, lt), enter}]}; `at` is in beats and lt is seconds since
 * the scene began (negative while it slides in). enter: "up" | "left" pushes the previous scene out across the beat,
 * "cut" adds a short flash, "fade" dissolves from the previous scene, "none" lets the scene draw its own way in.
 */
function drawAd(ctx, ad, t) {
  NOW = t;
  W = ad.w ?? 1080;
  H = ad.h ?? 1920;
  B = 60 / (ad.bpm ?? 150);
  PULSE = ad.pulse ?? 1;
  const sc = ad.scenes;
  const start = (i) => sc[i].at * B;
  let i = 0;
  while (i + 1 < sc.length && t >= start(i + 1)) i++;
  const punch = 1 + (ad.punch ?? 0.012) * beatEnv(9);
  const drawScene = (k, dx, dy) => {
    ctx.save();
    ctx.translate(dx, dy);
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.clip();
    ctx.translate(W / 2, H / 2);
    ctx.scale(punch, punch);
    ctx.translate(-W / 2, -H / 2);
    sc[k].draw(ctx, t - start(k));
    ctx.restore();
  };
  const PRE = 0.1;
  const LEN = 0.26;
  const push = (k) => sc[k] && (sc[k].enter === "up" || sc[k].enter === "left");
  // Which boundary, if any, is mid-push: the one ahead (we are in its lead-in) or the one just passed.
  let k = -1;
  if (push(i + 1) && t >= start(i + 1) - PRE) k = i + 1;
  else if (push(i) && t < start(i) - PRE + LEN) k = i;
  if (k > 0) {
    const e = E.io3(pr(t, start(k) - PRE, LEN));
    const [vx, vy] = sc[k].enter === "up" ? [0, H] : [W, 0];
    drawScene(k - 1, -vx * e, -vy * e);
    drawScene(k, vx * (1 - e), vy * (1 - e));
  } else if (sc[i].enter === "fade" && i > 0 && t < start(i) + 0.5) {
    drawScene(i - 1, 0, 0);
    ctx.save();
    ctx.globalAlpha = E.io3(pr(t, start(i), 0.5));
    drawScene(i, 0, 0);
    ctx.restore();
  } else {
    drawScene(i, 0, 0);
    if (sc[i].enter === "cut") {
      const a = 0.22 * Math.exp(-(t - start(i)) * 16);
      if (a > 0.004) {
        ctx.fillStyle = `rgba(255,255,255,${a})`;
        ctx.fillRect(0, 0, W, H);
      }
    }
  }
}

/** Renders one video frame with motion blur: SUB sub-frames across half the frame time, averaged. */
function renderFrame(canvas, scratch, ad, t, fps = 30, SUB = 10) {
  for (const c of [canvas, scratch]) {
    if (c.width !== (ad.w ?? 1080)) c.width = ad.w ?? 1080;
    if (c.height !== (ad.h ?? 1920)) c.height = ad.h ?? 1920;
  }
  const ctx = canvas.getContext("2d");
  const sctx = scratch.getContext("2d");
  for (let k = 0; k < SUB; k++) {
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.globalAlpha = 1;
    drawAd(sctx, ad, t + ((k / SUB) * 0.5) / fps);
    ctx.globalAlpha = 1 / (k + 1);
    ctx.drawImage(scratch, 0, 0);
  }
  ctx.globalAlpha = 1;
}
