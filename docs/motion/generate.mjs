// Generates the Mezout motion graphics as self-contained, looping SVGs (SMIL animation, Geist embedded).
// Run from the repo root: node docs/motion/generate.mjs
// Writes docs/motion/svg/<scene>.svg (with captions) and <scene>-clean.svg (no captions), and the landing page's
// cropped, transparent versions to apps/web/public/motion/<scene>.svg.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
// Geist subset to the characters the scenes use (Latin, arrows, ₿, ≈, ✓), so each SVG stays small.
const geist = fs.readFileSync(path.join(here, "fonts/GeistVF-subset.woff2")).toString("base64");
const geistMono = fs.readFileSync(path.join(here, "fonts/GeistMonoVF-subset.woff2")).toString("base64");

const W = 1200;
const H = 675;
const C = {
  bg: "#fafaf9",
  card: "#ffffff",
  line: "#e7e5e4",
  wash: "#f5f5f4",
  ink: "#1c1917",
  ink2: "#44403c",
  muted: "#78716c",
  faint: "#a8a29e",
  green: "#16a34a",
  greenSoft: "#dcfce7",
  greenInk: "#166534",
  btc: "#f7931a",
  mezo: "#e11d48",
  amber: "#d97706",
  amberSoft: "#fef3c7",
  amberInk: "#92400e",
  red: "#dc2626",
  redSoft: "#fee2e2",
};
const EASE = "0.4 0 0.2 1";

// ---------- animation helpers (every animation in a scene shares one duration, so loops stay in sync)

function pad(fr, dur) {
  let out = fr.map(([t, v]) => [Math.min(dur, Math.max(0, t)), v]);
  if (out[0][0] > 0) out = [[0, out[0][1]], ...out];
  if (out.at(-1)[0] < dur) out = [...out, [dur, out.at(-1)[1]]];
  for (let i = 1; i < out.length; i++) {
    if (out[i][0] <= out[i - 1][0]) throw new Error(`keyTimes not increasing at ${out[i][0]}: ${JSON.stringify(fr)}`);
  }
  return out;
}
const keyTimes = (fr, dur) => fr.map(([t]) => (t / dur).toFixed(5)).join(";");
const splines = (n) => Array(n - 1).fill(EASE).join(";");
const timing = (fr, dur) =>
  `dur="${dur}s" repeatCount="indefinite" calcMode="spline" keyTimes="${keyTimes(fr, dur)}" keySplines="${splines(fr.length)}"`;

/** Animates one attribute through [time, value] frames. */
function anim(attr, frames, dur) {
  const fr = pad(frames, dur);
  return `<animate attributeName="${attr}" ${timing(fr, dur)} values="${fr.map((f) => f[1]).join(";")}"/>`;
}
/** Animates a transform; values are strings like "10 0" (translate) or "1.1" (scale). */
function xform(type, frames, dur) {
  const fr = pad(frames, dur);
  return `<animateTransform attributeName="transform" type="${type}" ${timing(fr, dur)} values="${fr.map((f) => f[1]).join(";")}"/>`;
}
/** Moves an element (drawn around the origin) along a path; frames are [time, progress 0..1]. */
function motion(d, frames, dur) {
  const fr = pad(frames, dur);
  return `<animateMotion path="${d}" ${timing(fr, dur)} keyPoints="${fr.map((f) => f[1]).join(";")}"/>`;
}
/** Opacity that fades in at a and out at b for each [a, b]; a <= 0 starts visible, b >= dur stays visible. */
function vis(windows, dur, f = 0.25) {
  const fr = [];
  for (const [a, b] of windows) {
    if (a <= 0) fr.push([0, 1]);
    else fr.push([a, 0], [a + f, 1]);
    if (b < dur) fr.push([b, 1], [b + f, 0]);
  }
  if (fr[0][0] > 0) fr.unshift([0, 0]);
  return anim("opacity", fr, dur);
}
/** Scale pop around (cx, cy); the content is drawn centred on the origin. */
function pop(cx, cy, content, frames, dur) {
  return `<g transform="translate(${cx} ${cy})"><g>${xform("scale", frames, dur)}${content}</g></g>`;
}
/** Standard pop-in at t that stays until `until`, then fades. */
function popIn(cx, cy, content, t, until, dur) {
  const scale = [[t, "0.6"], [t + 0.22, "1.06"], [t + 0.36, "1"]];
  return `<g>${vis([[t, until]], dur, 0.18)}${pop(cx, cy, content, scale, dur)}</g>`;
}
/** Slide-and-fade in by (dx, dy) at t, out at `until`. */
function slideIn(content, t, until, dur, dx = 0, dy = 14) {
  return `<g>${vis([[t, until]], dur, 0.3)}<g>${xform("translate", [[t, `${dx} ${dy}`], [t + 0.4, "0 0"]], dur)}${content}</g></g>`;
}
/** Draws a stroked path in (pathLength 1). */
function drawOn(t0, t1, dur) {
  return anim("stroke-dashoffset", [[t0, 1], [t1, 0]], dur);
}

// ---------- drawing helpers

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function text(x, y, str, o = {}) {
  const {
    size = 16,
    weight = 400,
    fill = C.ink,
    anchor = "start",
    family = "Geist, system-ui, sans-serif",
    ls = 0,
  } = o;
  return `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" letter-spacing="${ls}">${str}</text>`;
}
const mono = "'Geist Mono', ui-monospace, monospace";
const rect = (x, y, w, h, r, fill, stroke = "none", sw = 1, extra = "") =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${extra}/>`;
const card = (x, y, w, h, r = 18) =>
  `${rect(x, y + 3, w, h, r, "#1c1917", "none", 0, 'opacity="0.05"')}${rect(x, y, w, h, r, C.card, C.line, 1.5)}`;

/** The Mezout mark: rounded square with a check, `s` px wide, top-left at (x, y). */
function mark(x, y, s, fill = C.ink) {
  const k = s / 32;
  return `<g transform="translate(${x} ${y}) scale(${k})"><rect width="32" height="32" rx="8" fill="${fill}"/><path d="M10 16.5l4 4 8-9" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></g>`;
}
const check = (s = 1, color = "#fff", sw = 2.6) =>
  `<path d="M${-5 * s} ${0.5 * s}l${3.4 * s} ${3.4 * s} ${6.6 * s} ${-7.4 * s}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`;
const cross = (s = 1, color = "#fff", sw = 2.6) =>
  `<path d="M${-4 * s} ${-4 * s}L${4 * s} ${4 * s}M${4 * s} ${-4 * s}L${-4 * s} ${4 * s}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round"/>`;
/** Padlock glyph centred on the origin. */
const lock = (color = "#fff", s = 1) =>
  `<g transform="scale(${s})"><rect x="-7" y="-2" width="14" height="11" rx="2.5" fill="${color}"/><path d="M-4.2 -2v-3.2a4.2 4.2 0 0 1 8.4 0V-2" fill="none" stroke="${color}" stroke-width="2.2"/></g>`;

/** A token coin centred on the origin. */
function coin(kind, r = 18) {
  const fills = { MUSD: C.green, BTC: C.btc, MEZO: C.mezo, BORROW: C.amber };
  let glyph;
  if (kind === "MUSD") glyph = text(0, r * 0.36, "M", { size: r * 1.0, weight: 700, fill: "#fff", anchor: "middle" });
  if (kind === "BTC") glyph = text(0, r * 0.38, "₿", { size: r * 1.15, weight: 700, fill: "#fff", anchor: "middle", family: "system-ui, sans-serif" });
  if (kind === "MEZO") glyph = text(0, r * 0.3, "MZ", { size: r * 0.78, weight: 700, fill: "#fff", anchor: "middle", ls: -0.5 });
  if (kind === "BORROW") glyph = lock("#fff", r / 18);
  return `<circle r="${r}" fill="${fills[kind]}"/>${glyph}`;
}
function pill(cx, cy, label, { fill, color, w, icon = "" }) {
  const h = 30;
  return `${rect(cx - w / 2, cy - h / 2, w, h, h / 2, fill)}${icon}${text(cx + (icon ? 9 : 0), cy + 5, label, { size: 14, weight: 600, fill: color, anchor: "middle" })}`;
}

// ---------- page frame

/**
 * variant "captioned": title and subtitle; "clean": no captions; "embed": cropped to `box`, transparent, no watermark.
 * Portrait scenes set `size` and have no captions.
 */
function frame({ title, subtitle, body, dur, usesMono = false, variant, box, size = [W, H] }) {
  const fonts = `@font-face{font-family:'Geist';src:url(data:font/woff2;base64,${geist}) format('woff2');font-weight:100 900;}${
    usesMono ? `@font-face{font-family:'Geist Mono';src:url(data:font/woff2;base64,${geistMono}) format('woff2');font-weight:100 900;}` : ""
  }`;
  const [w, h] = size;
  const embed = variant === "embed";
  const captions = variant === "captioned";
  const head = captions
    ? `${text(64, 86, esc(title), { size: 36, weight: 650, ls: -0.6 })}${text(64, 120, esc(subtitle), { size: 18, fill: C.muted })}`
    : "";
  const shift = variant === "clean" && size[0] === W && size[1] === H ? -40 : 0;
  const [vx, vy, vw, vh] = embed && box ? box : [0, 0, w, h];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} ${vy} ${vw} ${vh}" width="${vw}" height="${vh}" data-duration="${dur}">
<title>${esc(title)}</title>
<style>${fonts}</style>
${embed ? "" : `<rect width="${w}" height="${h}" fill="${C.bg}"/>`}
${head}
<g transform="translate(0 ${shift})">${body}</g>
${embed || w !== W ? "" : `${mark(w - 134, h - 57, 22)}${text(w - 104, h - 40, "Mezout", { size: 17, weight: 600 })}`}
</svg>
`;
}

// ---------- scene 1: pay any way, merchant gets exact MUSD

function payAnyWay() {
  const dur = 8;
  const methods = [
    { kind: "MUSD", label: "MUSD", sub: "From balance", color: C.green, via: "Paid with MUSD" },
    { kind: "BTC", label: "BTC", sub: "Swapped on Tigris", color: C.btc, via: "Paid with BTC" },
    { kind: "MEZO", label: "MEZO", sub: "Swapped on Tigris", color: C.mezo, via: "Paid with MEZO" },
    { kind: "BORROW", label: "Borrow against BTC", sub: "Keep your Bitcoin", color: C.amber, via: "Borrowed against BTC" },
  ];
  const cx = 600;
  const cy = 359;
  let body = "";
  // Static paths
  methods.forEach((m, i) => {
    const y = 230 + i * 86;
    body += `<path d="M396 ${y} C 462 ${y}, 462 ${cy}, 530 ${cy}" fill="none" stroke="${C.line}" stroke-width="2"/>`;
  });
  body += `<path d="M670 ${cy} L820 ${cy}" fill="none" stroke="${C.line}" stroke-width="2"/>`;

  // Chips
  methods.forEach((m, i) => {
    const y = 196 + i * 86;
    const s = i * 2;
    const chip = `${card(96, y, 300, 68, 16)}<g transform="translate(134 ${y + 34})">${coin(m.kind, 19)}</g>${text(166, y + 30, m.label, { size: 18, weight: 600 })}${text(166, y + 51, m.sub, { size: 14, fill: C.muted })}`;
    const ring = `<g>${vis([[s, s + 1.7]], dur, 0.2)}${rect(96, y, 300, 68, 16, "none", m.color, 2.5)}</g>`;
    body += `<g>${xform("translate", [[s, "0 0"], [s + 0.25, "8 0"], [s + 1.7, "8 0"], [s + 1.95, "0 0"]], dur)}${chip}${ring}</g>`;
  });

  // Router
  body += `<g>${pop(cx, cy, `${rect(-70, -70, 140, 140, 32, C.ink)}`, [0, 1, 2, 3].flatMap((i) => [[i * 2 + 0.85, "1"], [i * 2 + 1.0, "1.06"], [i * 2 + 1.25, "1"]]), dur)}</g>`;
  body += `<g transform="translate(${cx - 70} ${cy - 70}) scale(4.375)"><path d="M10 16.5l4 4 8-9" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  body += text(cx, cy + 100, "Mezout router", { size: 16, weight: 600, anchor: "middle" });
  body += text(cx, cy + 121, "Settles on-chain", { size: 14, fill: C.muted, anchor: "middle" });
  // Router pulse rings
  methods.forEach((m, i) => {
    const s = i * 2 + 0.9;
    const ring = `${rect(-70, -70, 140, 140, 32, "none", m.color, 3)}`;
    body += `<g>${anim("opacity", [[s, 0], [s + 0.05, 0.7], [s + 0.6, 0]], dur)}${pop(cx, cy, ring, [[s, "1"], [s + 0.6, "1.35"]], dur)}</g>`;
  });

  // Tokens in flight
  methods.forEach((m, i) => {
    const y = 230 + i * 86;
    const s = i * 2;
    body += `<g>${vis([[s + 0.2, s + 0.8]], dur, 0.08)}<g>${motion(`M396 ${y} C 462 ${y}, 462 ${cy}, 530 ${cy}`, [[s + 0.2, 0], [s + 0.9, 1]], dur)}${coin(m.kind, 12)}</g></g>`;
    body += `<g>${vis([[s + 1.0, s + 1.45]], dur, 0.08)}<g>${motion(`M670 ${cy} L820 ${cy}`, [[s + 1.0, 0], [s + 1.55, 1]], dur)}${coin("MUSD", 12)}</g></g>`;
  });

  // Merchant card
  const mx = 820;
  const my = 249;
  body += card(mx, my, 284, 220, 20);
  body += text(mx + 28, my + 46, "Satoshi’s Coffee", { size: 20, weight: 600 });
  body += text(mx + 28, my + 70, "Order 1001", { size: 15, fill: C.muted });
  body += `<line x1="${mx + 28}" y1="${my + 92}" x2="${mx + 256}" y2="${my + 92}" stroke="${C.line}" stroke-width="1.5"/>`;
  body += text(mx + 28, my + 124, "Received", { size: 14, fill: C.muted });
  const amount = `${text(0, 0, `25.00<tspan font-size="20" font-weight="500" fill="${C.muted}" dx="8">MUSD</tspan>`, { size: 46, weight: 650, ls: -1 })}`;
  body += pop(mx + 28, my + 172, amount, [0, 1, 2, 3].flatMap((i) => [[i * 2 + 1.5, "1"], [i * 2 + 1.65, "1.05"], [i * 2 + 1.9, "1"]]), dur);
  methods.forEach((m, i) => {
    const s = i * 2 + 1.55;
    const windows = i === 3 ? [[-1, 1.55], [s, dur + 1]] : [[s, s + 2]];
    body += `<g>${vis(windows, dur, 0.2)}<circle cx="${mx + 34}" cy="${my + 199}" r="5" fill="${m.color}"/>${text(mx + 46, my + 204, m.via, { size: 14, fill: C.ink2 })}</g>`;
  });
  // Green flash and check badge on each arrival
  [0, 1, 2, 3].forEach((i) => {
    const s = i * 2 + 1.5;
    body += `<g>${anim("opacity", [[s, 0], [s + 0.1, 1], [s + 0.7, 0]], dur)}${rect(mx, my, 284, 220, 20, "none", C.green, 3)}</g>`;
  });
  body += pop(mx + 284, my, `<circle r="17" fill="${C.green}"/>${check(1.1)}`, [0, 1, 2, 3].flatMap((i) => [[i * 2 + 1.5, "1"], [i * 2 + 1.65, "1.2"], [i * 2 + 1.9, "1"]]), dur);

  return {
    name: "01-pay-any-way",
    dur,
    box: [72, 176, 1064, 366],
    title: "Pay any way. The merchant gets exact MUSD.",
    subtitle: "MUSD, BTC, MEZO or a loan against BTC: every payment lands as the invoiced amount in MUSD.",
    body,
  };
}

// ---------- scene 2: borrow against BTC without selling, with the 160% floor

function borrowDontSell() {
  const dur = 10;
  const x = (r) => 480 + ((r - 100) / 150) * 624;
  let body = "";

  // Vault card
  body += card(96, 190, 320, 350, 22);
  body += text(128, 232, "Customer’s Bitcoin", { size: 15, fill: C.muted });
  body += `<g transform="translate(256 318)">${coin("BTC", 56)}</g>`;
  body += `<g transform="translate(300 274)"><circle r="18" fill="${C.ink}" stroke="#fff" stroke-width="3"/>${lock("#fff", 0.85)}</g>`;
  body += text(256, 412, "0.05 BTC", { size: 28, weight: 650, anchor: "middle", ls: -0.5 });
  body += text(256, 436, "locked as collateral", { size: 15, fill: C.muted, anchor: "middle" });
  body += `<line x1="128" y1="468" x2="384" y2="468" stroke="${C.line}" stroke-width="1.5"/>`;
  body += `<g transform="translate(140 500)"><circle r="10" fill="${C.greenSoft}"/>${check(0.75, C.green, 2.2)}</g>`;
  body += text(158, 505, "Not sold. Still theirs.", { size: 15, weight: 500, fill: C.ink2 });

  // Gauge
  body += text(480, 206, "Collateral ratio", { size: 15, fill: C.muted });
  body += `<clipPath id="bar"><rect x="480" y="250" width="624" height="18" rx="9"/></clipPath>`;
  body += `<g clip-path="url(#bar)"><rect x="480" y="250" width="${x(160) - 480}" height="18" fill="${C.redSoft}"/><rect x="${x(160)}" y="250" width="${1104 - x(160)}" height="18" fill="${C.greenSoft}"/></g>`;
  body += `<line x1="${x(160)}" y1="240" x2="${x(160)}" y2="278" stroke="${C.red}" stroke-width="2" stroke-dasharray="4 4"><animate attributeName="stroke-width" dur="${dur}s" repeatCount="indefinite" calcMode="spline" keyTimes="0;0.56;0.58;0.64;1" keySplines="${splines(5)}" values="2;2;5;2;2"/></line>`;
  body += text(x(160), 298, "160% floor", { size: 13, weight: 600, fill: C.red, anchor: "middle" });
  body += text(480, 298, "100%", { size: 13, fill: C.faint });
  body += text(1104, 298, "250%", { size: 13, fill: C.faint, anchor: "end" });

  // Real marker: 198% -> 184%, shake at the refusal, reset for the loop
  const d184 = (x(184) - x(198)).toFixed(1);
  const markerMoves = [
    [1.4, "0 0"],
    [2.4, `${d184} 0`],
    [6.0, `${d184} 0`],
    [6.08, `${+d184 - 5} 0`],
    [6.16, `${+d184 + 5} 0`],
    [6.24, `${+d184 - 3} 0`],
    [6.34, `${d184} 0`],
    [9.0, `${d184} 0`],
    [9.7, "0 0"],
  ];
  const markerPill = (fill, labelGroups) =>
    `<line x1="0" y1="242" x2="0" y2="276" stroke="${fill}" stroke-width="3" stroke-linecap="round"/>${rect(-34, 212, 68, 26, 13, fill)}${labelGroups}`;
  const label = (s) => text(0, 230, s, { size: 14, weight: 600, fill: "#fff", anchor: "middle" });
  const realLabels = `<g>${vis([[-1, 1.8], [9.2, dur + 1]], dur, 0.2)}${label("198%")}</g><g>${vis([[1.8, 9.2]], dur, 0.2)}${label("184%")}</g>`;
  body += `<g transform="translate(${x(198)} 0)"><g>${xform("translate", markerMoves, dur)}${markerPill(C.ink, realLabels)}</g></g>`;

  // Ghost marker for the refused borrow: projects to 143% then vanishes
  const dGhost = (x(143) - x(184)).toFixed(1);
  body += `<g>${vis([[4.8, 6.0]], dur, 0.2)}<g transform="translate(${x(184)} 0)"><g>${xform("translate", [[4.9, "0 0"], [5.8, `${dGhost} 0`]], dur)}<g opacity="0.85">${markerPill(C.red, label("143%"))}</g></g></g></g>`;

  // Checkout rows
  const row = (y, title, sub) =>
    `${card(480, y, 624, 70, 16)}<g transform="translate(518 ${y + 35})">${coin("BORROW", 17)}</g>${text(548, y + 31, title, { size: 18, weight: 600 })}${text(548, y + 53, sub, { size: 14, fill: C.muted })}`;
  const progress = (y, t0, t1, color, endX = 1104) =>
    `<clipPath id="p${y}"><rect x="480" y="${y}" width="624" height="70" rx="16"/></clipPath><g clip-path="url(#p${y})"><g transform="translate(480 ${y + 67})"><rect width="${endX - 480}" height="3" fill="${color}">${xform("scale", [[t0, "0.0001 1"], [t1, "1 1"]], dur)}</rect></g></g>`;

  body += slideIn(
    `${row(330, "Borrow 150 MUSD", "Pay Satoshi’s Coffee")}${progress(330, 1.0, 2.2, C.green)}` +
      popIn(1040, 365, pill(0, 0, "Paid", { fill: C.greenSoft, color: C.greenInk, w: 88, icon: `<g transform="translate(-24 0)">${check(0.7, C.green, 2.2)}</g>` }), 2.3, 8.6, dur),
    0.5,
    8.6,
    dur,
  );
  body += slideIn(
    `${row(416, "Borrow 600 MUSD", "Pay Satoshi’s Coffee")}${progress(416, 4.9, 5.8, C.red)}` +
      popIn(1000, 451, pill(0, 0, "Refused: below 160%", { fill: C.redSoft, color: C.red, w: 172, icon: `<g transform="translate(-72 0)">${cross(0.7, C.red, 2.2)}</g>` }), 6.1, 8.6, dur),
    4.3,
    8.6,
    dur,
  );
  body += `<g>${vis([[6.4, 8.6]], dur, 0.3)}${text(480, 530, "Mezout checks the loan after every borrow and reverts anything under the floor.", { size: 15, fill: C.muted })}</g>`;

  return {
    name: "02-borrow-dont-sell",
    dur,
    box: [72, 170, 1056, 392],
    title: "Spend Bitcoin without selling it.",
    subtitle: "Customers borrow MUSD against their BTC inside the payment, never below 160% collateral.",
    body,
  };
}

// ---------- scene 3: walletless merchant sign-up with a passkey

function passkey() {
  const dur = 9;
  let body = "";

  // Device
  body += card(96, 180, 440, 380, 22);
  body += `<path d="M96 202a22 22 0 0 1 22-22h396a22 22 0 0 1 22 22v18H96z" fill="${C.wash}"/>`;
  body += [0, 1, 2].map((i) => `<circle cx="${122 + i * 16}" cy="200" r="5" fill="${C.line}"/>`).join("");
  body += text(316, 205, "usemezout.vercel.app/dashboard", { size: 12, fill: C.faint, anchor: "middle" });
  body += text(128, 262, "Business name", { size: 13, fill: C.muted });
  body += rect(128, 272, 376, 48, 10, C.card, C.line, 1.5);
  body += `<clipPath id="type"><rect x="140" y="276" height="40" width="0">${anim("width", [[0.3, 0], [1.2, 200], [8.5, 200], [8.85, 0]], dur)}</rect></clipPath>`;
  body += `<g clip-path="url(#type)">${text(146, 302, "Satoshi’s Coffee", { size: 17 })}</g>`;
  body += rect(128, 340, 376, 54, 12, C.ink);
  body += `<g transform="translate(176 367)">${lock("#fff", 0.75)}</g>`;
  body += text(326, 373, "Create account with passkey", { size: 16, weight: 600, fill: "#fff", anchor: "middle" });
  body += `<g>${anim("opacity", [[1.4, 0], [1.5, 0.25], [1.75, 0]], dur)}${rect(128, 340, 376, 54, 12, "#fff")}</g>`;
  body += text(316, 430, "No wallet or seed phrase needed", { size: 13, fill: C.faint, anchor: "middle" });

  // Passkey sheet
  const arcs = [
    "M0 4v22",
    "M-9 22V4a9 9 0 0 1 18 0v12",
    "M-18 18V4a18 18 0 0 1 36 0v18",
    "M-27 10V4a27 27 0 0 1 54 0v8",
    "M-28 -16a34 34 0 0 1 56 0",
  ];
  const finger = arcs
    .map((d, i) => `<path d="${d}" fill="none" stroke="${C.ink}" stroke-width="3.2" stroke-linecap="round" pathLength="1" stroke-dasharray="1 2">${drawOn(1.95 + i * 0.15, 2.6 + i * 0.15, dur)}</path>`)
    .join("");
  let sheet = `<path d="M97 221h438v318a20 20 0 0 1 -20 20h-398a20 20 0 0 1 -20 -20z" fill="#fff" opacity="0.96"/>`;
  sheet += `<g transform="translate(316 360)"><circle r="56" fill="${C.wash}"/><g transform="translate(0 -4)">${finger}</g></g>`;
  sheet += `<g>${vis([[3.05, dur]], dur, 0.15)}${pop(316, 360, `<circle r="56" fill="${C.green}"/>${check(3, "#fff", 5)}`, [[3.05, "0.7"], [3.3, "1.06"], [3.45, "1"]], dur)}</g>`;
  sheet += `<g>${vis([[1.85, 3.05]], dur, 0.15)}${text(316, 456, "Confirm with Touch ID", { size: 16, weight: 600, anchor: "middle" })}</g>`;
  sheet += `<g>${vis([[3.05, dur]], dur, 0.15)}${text(316, 456, "Passkey created", { size: 16, weight: 600, anchor: "middle" })}</g>`;
  sheet += text(316, 480, "The key never leaves this device", { size: 13, fill: C.muted, anchor: "middle" });
  body += `<g>${vis([[1.8, 8.4]], dur, 0.25)}${sheet}</g>`;

  // Account card
  let acct = card(640, 196, 464, 196, 22);
  acct += text(672, 238, "Your Mezout account", { size: 14, fill: C.muted });
  acct += pill(1004, 233, "ERC-4337 smart account", { fill: C.wash, color: C.ink2, w: 176 });
  acct += text(672, 272, "0x7a3F…c21D", { size: 18, family: mono, fill: C.ink2 });
  acct += `<line x1="672" y1="296" x2="1072" y2="296" stroke="${C.line}" stroke-width="1.5"/>`;
  acct += text(672, 326, "Payout balance", { size: 14, fill: C.muted });
  const bal = (s) => text(672, 368, `${s}<tspan font-size="18" font-weight="500" fill="${C.muted}" dx="8">MUSD</tspan>`, { size: 38, weight: 650, ls: -1 });
  acct += `<g>${vis([[-1, 5.45]], dur, 0.15)}${bal("0.00")}</g>`;
  acct += `<g>${vis([[5.45, 6.65]], dur, 0.15)}${bal("25.00")}</g>`;
  acct += `<g>${vis([[6.65, dur + 1]], dur, 0.15)}${bal("37.50")}</g>`;
  acct += `<g>${vis([[5.3, 6.3]], dur, 0.15)}<g>${xform("translate", [[5.3, "0 10"], [5.6, "0 0"], [6.1, "0 -6"]], dur)}${text(1072, 366, "+25.00", { size: 18, weight: 650, fill: C.green, anchor: "end" })}</g></g>`;
  acct += `<g>${vis([[6.5, 7.5]], dur, 0.15)}<g>${xform("translate", [[6.5, "0 10"], [6.8, "0 0"], [7.3, "0 -6"]], dur)}${text(1072, 366, "+12.50", { size: 18, weight: 650, fill: C.green, anchor: "end" })}</g></g>`;
  body += slideIn(acct, 3.5, 8.4, dur, -24, 0);

  // Pills
  const no = [
    ["No wallet app", 150],
    ["No seed phrase", 160],
    ["No gas tokens", 150],
  ];
  let px = 640;
  no.forEach(([label, w], i) => {
    const content = `${rect(-w / 2, -21, w, 42, 21, C.card, C.line, 1.5)}<g transform="translate(${-w / 2 + 22} 0)"><circle r="9" fill="${C.greenSoft}"/>${check(0.65, C.green, 2.2)}</g>${text(10, 5, label, { size: 15, weight: 600, anchor: "middle" })}`;
    body += popIn(px + w / 2, 448, content, 4.1 + i * 0.35, 8.4, dur);
    px += w + 14;
  });
  body += `<g>${vis([[5.2, 8.4]], dur, 0.3)}${text(640, 510, "Mezout never holds the key and cannot move the funds.", { size: 15, fill: C.muted })}</g>`;

  return {
    name: "03-passkey-merchant",
    dur,
    box: [72, 160, 1056, 420],
    title: "No wallet. No seed phrase. No gas.",
    subtitle: "Merchants sign up with a passkey and get their own smart account on Mezo.",
    body,
    usesMono: true,
  };
}

// ---------- scene 4: gasless payments through the relayer

function gasless() {
  const dur = 8;
  const y = 372;
  const nodes = [
    { x: 180, label: "Customer", sub: "Signs one message" },
    { x: 460, label: "Mezout relayer", sub: "Pays the gas" },
    { x: 740, label: "Mezo", sub: "Router settles" },
    { x: 1020, label: "Satoshi’s Coffee", sub: "Gets 25.00 MUSD" },
  ];
  let body = "";
  for (let i = 0; i < 3; i++) {
    body += `<line x1="${nodes[i].x + 62}" y1="${y}" x2="${nodes[i + 1].x - 62}" y2="${y}" stroke="${C.line}" stroke-width="2" stroke-dasharray="6 7"/>`;
  }
  const icons = [
    `<circle cy="-12" r="12" fill="${C.ink}"/><path d="M-21 22a21 17 0 0 1 42 0z" fill="${C.ink}"/>`,
    "",
    `${rect(-20, 2, 40, 16, 4, C.ink)}${rect(-20, -16, 40, 16, 4, C.ink2)}`,
    `<path d="M-22 -8h44l-4 -12h-36z" fill="${C.ink}"/><rect x="-19" y="-8" width="38" height="26" rx="2" fill="none" stroke="${C.ink}" stroke-width="3.5"/><rect x="-6" y="4" width="12" height="14" fill="${C.ink}"/>`,
  ];
  nodes.forEach((n, i) => {
    body += `<circle cx="${n.x}" cy="${y}" r="58" fill="${C.card}" stroke="${C.line}" stroke-width="1.5"/>`;
    body += i === 1 ? mark(n.x - 26, y - 26, 52) : `<g transform="translate(${n.x} ${y})">${icons[i]}</g>`;
    body += text(n.x, y + 92, n.label, { size: 17, weight: 600, anchor: "middle" });
    body += text(n.x, y + 115, n.sub, { size: 14, fill: C.muted, anchor: "middle" });
  });
  // New block landing on Mezo's stack
  body += `<g>${vis([[4.35, 7.5]], dur, 0.12)}<g>${xform("translate", [[4.3, "0 -18"], [4.6, "0 0"]], dur)}${rect(720, y - 34, 40, 16, 4, C.green)}</g></g>`;
  // Node highlight rings
  const ring = (n, t, color) =>
    `<g>${anim("opacity", [[t, 0], [t + 0.08, 0.9], [t + 0.7, 0]], dur)}${pop(n.x, y, `<circle r="58" fill="none" stroke="${color}" stroke-width="3"/>`, [[t, "1"], [t + 0.7, "1.3"]], dur)}</g>`;
  body += ring(nodes[0], 0.3, C.ink) + ring(nodes[1], 2.9, C.amber) + ring(nodes[2], 4.3, C.ink) + ring(nodes[3], 5.5, C.green);

  // Signature card
  let sig = card(70, 168, 220, 112, 16);
  sig += text(90, 196, "Sign: Payment", { size: 15, weight: 650 });
  const rowT = (yy, k, v, color = C.ink2) => `${text(90, yy, k, { size: 13, fill: C.muted })}${text(270, yy, v, { size: 13, weight: 600, fill: color, anchor: "end" })}`;
  sig += rowT(222, "Invoice", "Order 1001") + rowT(244, "Amount", "25.00 MUSD") + rowT(266, "Network fee", "0", C.green);
  body += slideIn(sig, 0.5, 2.0, dur, 0, 10);

  // Envelope, transaction and coin in flight
  const envelope = `${rect(-16, -11, 32, 22, 4, C.card, C.ink, 2)}<path d="M-14 -8l14 10 14 -10" fill="none" stroke="${C.ink}" stroke-width="2"/>`;
  body += `<g>${vis([[1.9, 2.85]], dur, 0.1)}<g>${motion(`M242 ${y} L398 ${y}`, [[1.95, 0], [2.9, 1]], dur)}${envelope}</g></g>`;
  body += `<g>${vis([[3.3, 4.25]], dur, 0.1)}<g>${motion(`M522 ${y} L678 ${y}`, [[3.35, 0], [4.3, 1]], dur)}${rect(-12, -12, 24, 24, 5, C.green)}</g></g>`;
  body += `<g>${vis([[4.6, 5.45]], dur, 0.1)}<g>${motion(`M802 ${y} L958 ${y}`, [[4.65, 0], [5.5, 1]], dur)}${coin("MUSD", 13)}</g></g>`;

  // Badges
  body += popIn(460, 276, pill(0, 0, "Gas paid by Mezout", { fill: C.amberSoft, color: C.amberInk, w: 168 }), 3.0, 7.4, dur);
  body += popIn(1020, 276, pill(0, 0, "+25.00 MUSD", { fill: C.greenSoft, color: C.greenInk, w: 128 }), 5.55, 7.4, dur);
  body += `<g>${vis([[6.0, 7.4]], dur, 0.3)}${text(600, 562, "Customer gas: 0  ·  Merchant gas: 0", { size: 17, weight: 600, fill: C.ink2, anchor: "middle" })}</g>`;

  return {
    name: "04-gasless",
    dur,
    box: [40, 150, 1120, 440],
    title: "Customers sign. Mezout pays the gas.",
    subtitle: "Mezout’s relayer submits the payment on Mezo and covers the network fee.",
    body,
  };
}

// ---------- scene 5: integrations, API and webhooks

function plugIn() {
  const dur = 9;
  let body = "";
  const chips = [
    { label: "Payment link", icon: `<path d="M-6 3l9 -9M-9 -1l-3 3a5 5 0 0 0 7 7l3 -3M9 1l3 -3a5 5 0 0 0 -7 -7l-3 3" fill="none" stroke="${C.ink}" stroke-width="2.4" stroke-linecap="round"/>` },
    {
      label: "QR code",
      icon: `${[[-11, -11], [3, -11], [-11, 3]].map(([a, b]) => `<rect x="${a}" y="${b}" width="8" height="8" rx="1.5" fill="none" stroke="${C.ink}" stroke-width="2.2"/>`).join("")}<rect x="4" y="4" width="3" height="3" fill="${C.ink}"/><rect x="9" y="9" width="3" height="3" fill="${C.ink}"/><rect x="9" y="3" width="3" height="3" fill="${C.ink}"/>`,
    },
    { label: "REST API", icon: text(0, 5, "{ }", { size: 15, weight: 700, family: mono, anchor: "middle" }) },
    { label: "WooCommerce", icon: `<path d="M-12 -8h3l3 12h13l3 -9h-17" fill="none" stroke="${C.ink}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="-4" cy="9" r="2" fill="${C.ink}"/><circle cx="6" cy="9" r="2" fill="${C.ink}"/>` },
    { label: "Embedded checkout", soon: true, icon: `<rect x="-11" y="-9" width="22" height="18" rx="3" fill="none" stroke="${C.faint}" stroke-width="2.2"/><rect x="-5" y="-3" width="10" height="7" rx="1.5" fill="${C.faint}"/>` },
  ];
  chips.forEach((c, i) => {
    const y = 188 + i * 72;
    const cyy = y + 28;
    body += `<path d="M360 ${cyy} C 382 ${cyy}, 382 355, 400 355" fill="none" stroke="${c.soon ? C.line : C.faint}" stroke-width="1.6" pathLength="1" stroke-dasharray="1 2">${drawOn(1.1 + i * 0.06, 1.6 + i * 0.06, dur)}${vis([[1.1, 8.4]], dur, 0.2)}</path>`;
    const chip = c.soon
      ? `${rect(80, y, 280, 56, 14, C.bg, C.faint, 1.5, 'stroke-dasharray="5 5"')}<g transform="translate(110 ${cyy})">${c.icon}</g>${text(134, cyy + 5, c.label, { size: 16, weight: 600, fill: C.muted })}${pill(322, cyy, "Soon", { fill: C.wash, color: C.muted, w: 52 })}`
      : `${card(80, y, 280, 56, 14)}<g transform="translate(110 ${cyy})">${c.icon}</g>${text(134, cyy + 5, c.label, { size: 16, weight: 600 })}`;
    body += slideIn(chip, 0.2 + i * 0.15, 8.4, dur, -16, 0);
  });

  // Code card
  const cx0 = 400;
  body += slideIn(
    `${rect(cx0, 190 + 3, 410, 340, 18, "#000", "none", 0, 'opacity="0.08"')}${rect(cx0, 190, 410, 340, 18, C.ink)}${[0, 1, 2].map((i) => `<circle cx="${cx0 + 24 + i * 15}" cy="214" r="4.5" fill="#44403c"/>`).join("")}`,
    0.4,
    8.4,
    dur,
  );
  const sty = { size: 14.5, family: mono };
  const lines = [
    { y: 256, t: 1.6, s: `<tspan fill="#fbbf24" font-weight="600">POST</tspan><tspan fill="#e7e5e4"> /v1/invoices</tspan>` },
    { y: 282, t: 1.95, s: `<tspan fill="#a8a29e">{ "amount": </tspan><tspan fill="#86efac">"25.00"</tspan><tspan fill="#a8a29e">,</tspan>` },
    { y: 308, t: 2.3, s: `<tspan fill="#a8a29e">\u00a0\u00a0"reference": </tspan><tspan fill="#86efac">"Order 1001"</tspan><tspan fill="#a8a29e"> }</tspan>` },
    { y: 346, t: 2.9, s: `<tspan fill="#4ade80" font-weight="600">201 Created</tspan>` },
    { y: 372, t: 3.15, s: `<tspan fill="#a8a29e">"checkout_url": </tspan><tspan fill="#86efac">"…/pay/eyJtIjoi…"</tspan>` },
    { y: 440, t: 5.0, s: `<tspan fill="#4ade80" font-weight="600">→ invoice.paid</tspan><tspan fill="#a8a29e">  webhook</tspan>` },
    { y: 466, t: 5.3, s: `<tspan fill="#78716c">Mezout-Signature: t=…,v1=…</tspan>` },
  ];
  lines.forEach((l, i) => {
    body += `<clipPath id="ln${i}"><rect x="${cx0 + 20}" y="${l.y - 18}" height="26" width="0">${anim("width", [[l.t, 0], [l.t + 0.4, 380], [8.4, 380], [8.45, 0]], dur)}</rect></clipPath>`;
    body += `<g clip-path="url(#ln${i})">${text(cx0 + 24, l.y, l.s, sty)}</g>`;
  });
  body += `<g>${vis([[3.6, 5.0]], dur, 0.2)}${text(cx0 + 24, 410, `<tspan fill="#78716c">Customer is paying</tspan>`, sty)}<g>${[0, 1, 2]
    .map((i) => `<circle cx="${cx0 + 196 + i * 10}" cy="406" r="2.5" fill="#78716c">${anim("opacity", [[3.6 + i * 0.15, 0.2], [3.9 + i * 0.15, 1], [4.2 + i * 0.15, 0.2], [4.5 + i * 0.15, 1], [4.8 + i * 0.15, 0.2]], dur)}</circle>`)
    .join("")}</g></g>`;

  // Webhook pulse to the store
  body += `<path d="M810 440 C 846 440, 846 380, 880 380" fill="none" stroke="${C.line}" stroke-width="2"/>`;
  body += `<g>${vis([[5.2, 5.6]], dur, 0.08)}<g>${motion("M810 440 C 846 440, 846 380, 880 380", [[5.2, 0], [5.65, 1]], dur)}<circle r="8" fill="${C.green}"/></g></g>`;

  // Order card
  let order = card(880, 260, 240, 220, 20);
  order += text(908, 296, "Your store", { size: 14, fill: C.muted });
  order += text(908, 328, "Order 1001", { size: 24, weight: 650, ls: -0.5 });
  order += text(908, 354, "25.00 MUSD", { size: 16, fill: C.ink2 });
  order += `<g>${vis([[-1, 5.45]], dur, 0.15)}${pill(978, 394, "Awaiting payment", { fill: C.amberSoft, color: C.amberInk, w: 144 })}</g>`;
  order += `<g>${vis([[5.65, dur + 1]], dur, 0.15)}${pop(950, 394, pill(0, 0, "Paid", { fill: C.greenSoft, color: C.greenInk, w: 84, icon: `<g transform="translate(-22 0)">${check(0.7, C.green, 2.2)}</g>` }), [[5.65, "0.7"], [5.9, "1.08"], [6.05, "1"]], dur)}</g>`;
  order += `<g>${vis([[6.1, dur + 1]], dur, 0.25)}${text(908, 446, "Signature verified", { size: 14, weight: 500, fill: C.green })}</g>`;
  body += slideIn(order, 0.6, 8.4, dur, 16, 0);
  body += `<g>${anim("opacity", [[5.65, 0], [5.75, 1], [6.4, 0]], dur)}${rect(880, 260, 240, 220, 20, "none", C.green, 3)}</g>`;

  return {
    name: "05-plug-in",
    dur,
    box: [56, 168, 1088, 384],
    title: "Plugs into how merchants already sell.",
    subtitle: "Links, QR codes, a REST API and WooCommerce. A signed webhook tells the store it’s paid.",
    body,
    usesMono: true,
  };
}

// ---------- scene 6 (portrait): a receipt prints, the stamp lands, the payment method changes, the payout never does

function receipt() {
  const dur = 13;
  const [w, h] = [560, 600];
  const L = 92;
  const R = 468;
  const top = 47;
  const bottom = 506;
  const m = (x, y, str, o = {}) => text(x, y, str, { family: mono, size: 14, fill: C.ink2, ...o });
  const dashed = (y) => `<line x1="${L}" y1="${y}" x2="${R}" y2="${y}" stroke="${C.faint}" stroke-width="1.2" stroke-dasharray="5 5"/>`;
  // Mono at 14 px is about 8.4 px per character, enough to place dotted leaders between label and price.
  const item = (y, label, price) =>
    `${m(L, y, label)}${m(R, y, price, { anchor: "end" })}<line x1="${L + label.length * 8.4 + 8}" y1="${y - 4}" x2="${R - price.length * 8.4 - 8}" y2="${y - 4}" stroke="${C.line}" stroke-width="1.6" stroke-dasharray="1.5 4" stroke-linecap="round"/>`;

  let teeth = `M60 ${top} H500 V${bottom}`;
  for (let x = 500; x > 60; x -= 20) teeth += ` L${x - 10} ${bottom + 10} L${x - 20} ${bottom}`;
  teeth += " Z";

  let paper = `<path d="${teeth}" fill="#000" opacity="0.10" filter="url(#soft)" transform="translate(0 8)"/><path d="${teeth}" fill="#fffdf9" stroke="${C.line}" stroke-width="1"/>`;
  paper += mark(L, 78, 24);
  paper += m(L + 34, 95, "MEZOUT", { weight: 650, fill: C.ink, ls: 2.5 });
  paper += m(R, 95, "26 Oct · 14:22", { size: 12, fill: C.muted, anchor: "end" });
  paper += text(L, 136, "Satoshi’s Coffee", { size: 21, weight: 650, ls: -0.3 });
  paper += m(L, 158, "Order 1001", { size: 12.5, fill: C.muted });
  paper += dashed(178);
  paper += item(208, "2 × Flat white", "11.00") + item(236, "1 × Croissant", "4.50") + item(264, "Beans, 250 g", "9.50");
  paper += dashed(286);
  paper += m(L, 322, "TOTAL", { size: 13, weight: 650, fill: C.ink, ls: 1.5 });
  paper += text(R, 326, `25.00<tspan font-size="15" font-weight="500" fill="${C.muted}" dx="6">MUSD</tspan>`, { size: 28, weight: 700, anchor: "end", ls: -0.5 });
  paper += dashed(348);
  paper += m(L, 380, "Paid with", { size: 13, fill: C.muted });
  paper += m(L, 408, "Merchant received", { size: 13, fill: C.muted });
  paper += m(L, 436, "Network fee", { size: 13, fill: C.muted });
  paper += m(R, 436, "0.00", { size: 13, anchor: "end" });
  paper += `<g transform="translate(${R - 6} 403)"><circle r="8" fill="${C.greenSoft}"/>${check(0.55, C.green, 2)}</g>`;
  paper += text(R - 22, 409, "25.00 MUSD", { size: 15, weight: 650, fill: C.greenInk, anchor: "end" });
  paper += text(280, 478, "Settled on Mezo in one transaction", { size: 12, fill: C.faint, anchor: "middle" });

  const methods = [
    ["BTC", "BTC", C.btc],
    ["MEZO", "MEZO", C.mezo],
    ["MUSD", "MUSD", C.green],
    ["BORROW", "Borrowed against BTC", C.amber],
  ];
  const cycle = (k) => 2.3 + k * 2.5;
  methods.forEach(([kind, label, color], k) => {
    const s = cycle(k);
    const windows = k === 0 ? [[-1, s + 2.35]] : [[s - 0.15, s + 2.35]];
    const width = label.length * 8.2;
    paper += `<g>${vis(windows, dur, 0.15)}<g transform="translate(${R - width - 16} 375)">${coin(kind, 8)}</g>${text(R, 381, label, { size: 15, weight: 600, fill: C.ink, anchor: "end" })}</g>`;
  });
  // The stamp lands at the start of every cycle
  const stamp = `<g transform="rotate(-11)">${rect(-92, -38, 184, 76, 12, "none", C.green, 3.5)}${rect(-84, -30, 168, 60, 8, "none", C.green, 1.2)}${text(0, 9, "PAID", { size: 36, weight: 800, fill: C.green, anchor: "middle", ls: 6 })}${text(0, 25, "EXACT MUSD", { size: 9, weight: 600, fill: C.green, anchor: "middle", ls: 2.5, family: mono })}</g>`;
  const stampScale = [];
  const stampOpacity = [];
  methods.forEach((_, k) => {
    const s = cycle(k) + 0.15;
    stampScale.push([s, "1.6"], [s + 0.2, "0.94"], [s + 0.32, "1"]);
    stampOpacity.push([s, 0], [s + 0.12, 0.88], [s + 2.0, 0.88], [s + 2.2, 0]);
  });
  paper += `<g>${anim("opacity", stampOpacity, dur)}${pop(316, 234, stamp, stampScale, dur)}</g>`;

  const printing = xform("translate", [[0.2, "0 -470"], [2.0, "0 0"]], dur);
  const fade = anim("opacity", [[12.3, 1], [12.7, 0]], dur);
  let body = `<defs><filter id="soft" x="-10%" y="-10%" width="120%" height="130%"><feGaussianBlur stdDeviation="9"/></filter><clipPath id="slot"><rect x="0" y="${top}" width="${w}" height="${h - top}"/></clipPath></defs>`;
  body += `<g clip-path="url(#slot)"><g>${fade}<g>${printing}${paper}</g></g></g>`;
  body += `${rect(40, 34, 480, 16, 8, C.ink)}${rect(56, 44, 448, 3, 1.5, "#44403c")}`;
  return { name: "06-receipt", dur, size: [w, h], title: "Mezout receipt", body, usesMono: true, portrait: true };
}

// ---------- scene 7 (portrait): the hosted checkout, paying with BTC

function checkoutDemo() {
  const dur = 11;
  const [w, h] = [520, 640];
  const x0 = 30;
  const cw = 460;
  const L = 58;
  const R = 462;
  let body = `<defs><filter id="lift" x="-20%" y="-20%" width="140%" height="150%"><feGaussianBlur stdDeviation="14"/></filter></defs>`;
  body += `${rect(x0, 40, cw, 580, 22, "#000", "none", 0, 'opacity="0.08" filter="url(#lift)"')}${rect(x0, 30, cw, 580, 22, C.card, C.line, 1.5)}`;
  body += text(L, 72, "Pay", { size: 14, fill: C.muted });
  body += text(R, 72, "Link expires in 23 hours", { size: 12, fill: C.muted, anchor: "end" });
  body += text(L, 100, "Satoshi’s Coffee", { size: 22, weight: 650, ls: -0.3 });
  body += text(L, 120, "0x36A9…F9E4", { size: 12, fill: C.muted, family: mono });
  body += text(L, 172, `25.00<tspan font-size="22" font-weight="500" fill="${C.muted}" dx="8">MUSD</tspan>`, { size: 42, weight: 650, ls: -1 });
  body += text(L, 198, "Order 1001", { size: 14, fill: C.ink2 });
  body += `<line x1="${L}" y1="222" x2="${R}" y2="222" stroke="${C.line}" stroke-width="1.5"/>`;
  body += `<circle cx="${L + 4}" cy="247" r="4" fill="${C.green}"/>${text(L + 16, 251, "Connected 0x51b2…a9c0", { size: 12.5, fill: C.ink2, family: mono })}`;
  body += text(R, 251, "Choose how to pay", { size: 12.5, fill: C.muted, anchor: "end" });

  const opt = (y, title, sub, style) => {
    const styles = {
      dark: [C.ink, "none", "#fff", "#d6d3d1"],
      plain: [C.card, "#d6d3d1", C.ink, C.muted],
      orange: ["#ea580c", "none", "#fff", "#ffedd5"],
    };
    const [fill, stroke, tc, sc] = styles[style];
    return `${rect(L, y, R - L, 62, 12, fill, stroke, 1.5)}${text(L + 18, y + 27, title, { size: 15.5, weight: 600, fill: tc })}${text(L + 18, y + 47, sub, { size: 12.5, fill: sc })}`;
  };
  body += opt(270, "Pay with MUSD", "From your balance · no network fee", "dark");
  body += opt(342, "Pay with BTC", "≈ 0.000318 BTC · no network fee", "plain");
  body += opt(414, "Pay with MEZO", "Live Tigris quote · no network fee", "plain");
  body += opt(486, "Borrow against my BTC", "Keep your Bitcoin · loan stays above 160%", "orange");
  body += text(260, 584, "Mezout never holds your funds", { size: 12, fill: C.faint, anchor: "middle" });
  // Hover and press on "Pay with BTC"
  body += `<g>${vis([[1.55, 2.3]], dur, 0.15)}${rect(L, 342, R - L, 62, 12, C.wash, C.ink, 2)}${text(L + 18, 369, "Pay with BTC", { size: 15.5, weight: 600 })}${text(L + 18, 389, "≈ 0.000318 BTC · no network fee", { size: 12.5, fill: C.muted })}</g>`;

  // Wallet signature sheet
  let sheet = `${rect(x0, 30, cw, 580, 22, C.ink, "none", 0, 'opacity="0.28"')}`;
  let panel = `${rect(50, 300, 420, 290, 20, C.card, C.line, 1)}`;
  panel += text(76, 336, "Signature request", { size: 17, weight: 650 });
  panel += text(76, 356, "usemezout.vercel.app", { size: 12, fill: C.muted });
  const row = (y, k, v, color = C.ink2) => `${text(76, y, k, { size: 13, fill: C.muted })}${text(444, y, v, { size: 13, weight: 600, fill: color, anchor: "end" })}`;
  panel += `<line x1="76" y1="372" x2="444" y2="372" stroke="${C.line}"/>`;
  panel += row(398, "Message", "SwapPayment") + row(424, "Pay up to", "0.000321 BTC") + row(450, "Valid for", "5 minutes") + row(476, "Network fee", "0", C.green);
  panel += `${rect(76, 512, 176, 46, 12, C.card, "#d6d3d1", 1.5)}${text(164, 541, "Cancel", { size: 15, weight: 600, anchor: "middle" })}`;
  panel += `${rect(268, 512, 176, 46, 12, C.ink)}${text(356, 541, "Sign", { size: 15, weight: 600, fill: "#fff", anchor: "middle" })}`;
  panel += `<g>${anim("opacity", [[3.75, 0], [3.8, 0.3], [4.0, 0]], dur)}${rect(268, 512, 176, 46, 12, "#fff")}</g>`;
  sheet += `<g>${xform("translate", [[2.35, "0 330"], [2.75, "0 0"], [4.05, "0 0"], [4.4, "0 340"]], dur)}${panel}</g>`;
  body += `<g>${vis([[2.3, 4.1]], dur, 0.25)}${sheet}</g>`;

  // Submitting
  let busy = `${rect(L - 6, 262, R - L + 12, 300, 12, C.card)}`;
  busy += `<g transform="translate(260 380)"><circle r="22" fill="none" stroke="${C.line}" stroke-width="4"/><circle r="22" fill="none" stroke="${C.ink}" stroke-width="4" stroke-linecap="round" stroke-dasharray="34 200"><animateTransform attributeName="transform" type="rotate" values="0;360" dur="0.9s" repeatCount="indefinite"/></circle></g>`;
  busy += text(260, 438, "Submitting payment", { size: 16, weight: 600, anchor: "middle" });
  busy += text(260, 460, "Mezout’s relayer pays the gas", { size: 13, fill: C.muted, anchor: "middle" });
  body += `<g>${vis([[4.35, 5.6]], dur, 0.2)}${busy}</g>`;

  // Paid
  let done = `${rect(L - 6, 262, R - L + 12, 300, 14, "#f0fdf4", "#bbf7d0", 1.5)}`;
  done += `<g>${pop(260, 330, `<circle r="28" fill="${C.green}"/>${check(1.7, "#fff", 4)}`, [[5.6, "0.6"], [5.85, "1.08"], [6.0, "1"]], dur)}</g>`;
  done += text(260, 394, "Payment complete", { size: 20, weight: 650, fill: "#14532d", anchor: "middle" });
  done += text(260, 418, "Satoshi’s Coffee received 25.00 MUSD.", { size: 14, fill: C.greenInk, anchor: "middle" });
  done += `${rect(140, 446, 240, 44, 12, C.greenInk)}${text(260, 474, "Return to Satoshi’s Coffee", { size: 14, weight: 600, fill: "#fff", anchor: "middle" })}`;
  done += text(260, 520, "View transaction", { size: 13, fill: C.greenInk, anchor: "middle" });
  done += `<line x1="211" y1="524" x2="309" y2="524" stroke="${C.greenInk}" stroke-width="1"/>`;
  body += `<g>${vis([[5.55, 10.2]], dur, 0.3)}${done}</g>`;

  // Cursor
  const cursor = `<path d="M0 0L0 19L5 14.5L8.6 22.4L11.8 21L8.3 13.3L14.6 13.3Z" fill="${C.ink}" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>`;
  const path = [
    [0.4, "430 600"],
    [1.5, "300 372"],
    [2.3, "300 372"],
    [2.9, "330 560"],
    [3.5, "360 536"],
    [3.9, "360 536"],
  ];
  const press = [[1.95, "1"], [2.02, "0.85"], [2.12, "1"], [3.72, "1"], [3.79, "0.85"], [3.89, "1"]];
  body += `<g>${vis([[0.35, 4.0]], dur, 0.2)}<g>${xform("translate", path, dur)}<g>${xform("scale", press, dur)}${cursor}</g></g></g>`;

  return { name: "07-checkout", dur, size: [w, h], title: "Mezout checkout", body, usesMono: true, portrait: true };
}

// ---------- write

const out = path.join(here, "svg");
const site = path.resolve(here, "../../apps/web/public/motion");
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(site, { recursive: true });
const write = (file, svg) => {
  fs.writeFileSync(file, svg);
  console.log(path.relative(process.cwd(), file));
};
for (const scene of [payAnyWay(), borrowDontSell(), passkey(), gasless(), plugIn(), receipt(), checkoutDemo()]) {
  if (scene.portrait) {
    write(path.join(out, `${scene.name}.svg`), frame({ ...scene, variant: "clean" }));
  } else {
    write(path.join(out, `${scene.name}.svg`), frame({ ...scene, variant: "captioned" }));
    write(path.join(out, `${scene.name}-clean.svg`), frame({ ...scene, variant: "clean" }));
  }
  write(path.join(site, `${scene.name}.svg`), frame({ ...scene, variant: "embed" }));
}
