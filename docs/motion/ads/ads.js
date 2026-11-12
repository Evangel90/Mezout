// The ads: scenes (drawn with lib.js) and sound cues (read by audio.mjs). Times are in beats; one beat is 0.4 s.
// Loaded as a classic script by ad.html and imported for its cues by audio.mjs, so nothing here runs at load time
// except building the ADS table.

const URL_TEXT = "usemezout.vercel.app";

// ---------- shared scenes

/** "Built on [Mezo logo] tail", centred on x, fading in with alpha a. */
function builtOnMezo(ctx, x, y, size, a, tail = "") {
  if (a <= 0) return;
  const o = { size, weight: 500, fill: C.stone4 };
  const lh = size * 0.62;
  const gap = size * 0.34;
  const w1 = measure(ctx, "Built on", size, 500);
  const w3 = tail ? measure(ctx, tail, size, 500) + gap : 0;
  let cx = x - (w1 + gap + logoW("mezo", lh) + w3) / 2;
  ctx.save();
  ctx.globalAlpha *= a;
  txt(ctx, "Built on", cx, y, o);
  cx += w1 + gap;
  cx += logo(ctx, "mezo", cx, y - size * 0.3, lh, C.white) + gap;
  if (tail) txt(ctx, tail, cx, y, o);
  ctx.restore();
}

/** End card: mark, wordmark, two tagline lines, the link. */
function endCard(l1, l2, accent) {
  return (ctx, t) => {
    bg(ctx, t, C.ink, [
      { x: 540, y: 1500, r: 900, c: accent, a: 0.4 },
      { x: 200, y: 300, r: 600, c: C.signal, a: 0.14 },
    ]);
    dots(ctx, t, C.white, 0.05);
    ring(ctx, t, 0.05, 540, 600, 120, 420, accent, 10, 0.7);
    ring(ctx, t, 0.45, 540, 600, 120, 360, C.white, 6, 0.6);
    pop(ctx, t, 0, 540, 600, () => mark(ctx, 0, 0, 230, { draw: pr(t, 0.16, 0.28) }), { dur: 0.6 });
    headline(ctx, t, [{ s: "Mezout", at: 0.2 }], { x: 540, y: 905, size: 180, align: "center" });
    riseIn(ctx, t, B, l1, 540, 1040, { size: 64, align: "center", weight: 600 });
    riseIn(ctx, t, B * 1.5, l2, 540, 1122, { size: 64, align: "center", weight: 600, fill: accent });
    pop(ctx, t, B * 2.5, 540, 1300, () => pill(ctx, 0, 0, URL_TEXT, { bg: C.white, fg: C.ink, size: 52, weight: 650 }));
    builtOnMezo(ctx, 540, 1424, 36, pr(t, B * 3.25, 0.3), "· live on testnet");
  };
}

// ---------- 1 · pay any way

const COINS = Array.from({ length: 16 }, (_, i) => {
  const top = i % 2 === 0;
  return {
    x: 110 + rnd(i) * 860,
    y: top ? 250 + rnd(i + 40) * 250 : 1130 + rnd(i + 40) * 400,
    r: 46 + rnd(i + 80) * 62,
    ph: rnd(i + 120) * 6.28,
  };
});

function sceneHook(ctx, t) {
  const m = E.io3(pr(t, 4 * B - 0.08, 0.3)); // orange → green
  bg(ctx, t, C.ink, [
    { x: 820, y: 420, r: 820, c: m < 0.5 ? C.signal : C.musd, a: 0.42 },
    { x: 180, y: 1500, r: 700, c: m < 0.5 ? C.btc : C.musd4, a: 0.22 },
  ]);
  dots(ctx, t, C.white, 0.05);
  COINS.forEach((c, i) => {
    const p = pr(t, B - 0.02 + i * 0.022, 0.55);
    if (p <= 0) return;
    const e = E.spring(p);
    const f = pr(t, 4 * B - 0.04 + i * 0.018, 0.3); // the flip into MUSD
    const x = lerp(540, c.x, e) + Math.sin(t * 1.6 + c.ph) * 16;
    const y = lerp(960, c.y, e) + Math.cos(t * 1.3 + c.ph) * 22;
    coin(ctx, x, y, c.r * e * (1 + 0.07 * beatEnv()), f < 0.5 ? "BTC" : "MUSD", {
      flip: Math.cos(f * Math.PI),
      rot: Math.sin(t * 0.9 + c.ph) * 0.22,
    });
  });
  const size = 158;
  headline(ctx, t, [{ s: "They pay", at: 0 }, { s: "in Bitcoin.", at: B, fill: C.signal4 }], { y: 800, size, out: 4 * B - 0.1 });
  headline(ctx, t, [{ s: "You get paid", at: 4 * B }, { s: "in MUSD.", at: 5 * B, fill: C.musd4 }], { y: 800, size });
  riseIn(ctx, t, 6 * B, "The Bitcoin-backed dollar.", 84, 1040, { size: 56, weight: 550, fill: C.stone3 });
}

const METHODS = [
  ["MUSD", "MUSD"],
  ["BTC", "Bitcoin"],
  ["MEZO", "MEZO"],
  ["BORROW", "Borrow against BTC"],
];

function sceneCheckout(ctx, t) {
  bg(ctx, t, C.canvas, [{ x: 900, y: 260, r: 760, c: C.signal, a: 0.2 }]);
  dots(ctx, t, C.ink, 0.05);
  headline(ctx, t, [{ s: "Any way", at: -1, fill: C.ink }, { s: "they pay.", at: -1, fill: C.ink }], { y: 330, size: 136 });

  const X = 110;
  const Wc = 860;
  const Hc = 1000;
  const Y = 540 + lerp(240, 0, E.spring(pr(t, -0.1, 0.7)));
  ctx.save();
  ctx.shadowColor = "rgba(12,10,9,0.16)";
  ctx.shadowBlur = 70;
  ctx.shadowOffsetY = 28;
  rr(ctx, X, Y, Wc, Hc, 56);
  ctx.fillStyle = C.white;
  ctx.fill();
  ctx.restore();

  mark(ctx, X + 88, Y + 88, 64, { fill: C.ink, stroke: C.white });
  txt(ctx, "Merchant's Store", X + 140, Y + 103, { size: 44, weight: 600, fill: C.ink });
  txt(ctx, "25.00", X + 52, Y + 282, { size: 150, weight: 650, fill: C.ink });
  txt(ctx, "MUSD", X + 62 + measure(ctx, "25.00", 150), Y + 282, { size: 54, weight: 600, fill: C.stone5 });

  // Rows; a highlight steps down one row per beat, then lands on Bitcoin.
  const rowY = (i) => Y + 340 + i * 120;
  const steps = [[1, 0], [2, 1], [3, 2], [4, 3], [5, 1]]; // [beat, row]
  let hy = null;
  let from = 0;
  for (const [b, row] of steps) {
    if (t >= b * B) {
      hy = lerp(rowY(from), rowY(row), E.spring(pr(t, b * B, 0.3)));
      from = row;
    }
  }
  const chosen = t >= 5 * B;
  METHODS.forEach(([kind, label], i) => {
    const y = rowY(i);
    const p = E.out3(pr(t, 0.02 + i * 0.06, 0.3));
    ctx.save();
    ctx.globalAlpha *= p;
    ctx.translate((1 - p) * 60, 0);
    rr(ctx, X + 40, y, Wc - 80, 108, 30);
    ctx.fillStyle = C.stone1;
    ctx.fill();
    ctx.strokeStyle = C.stone2;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    coin(ctx, X + 108, y + 54, 34, kind, { shadow: false });
    txt(ctx, label, X + 166, y + 69, { size: 44, weight: 550, fill: C.ink });
    ctx.beginPath();
    ctx.arc(X + Wc - 96, y + 54, 20, 0, Math.PI * 2);
    ctx.strokeStyle = C.stone3;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();
  });
  if (hy !== null) {
    ctx.save();
    rr(ctx, X + 40, hy, Wc - 80, 108, 30);
    ctx.fillStyle = rgba(C.signal, 0.1);
    ctx.fill();
    ctx.strokeStyle = C.signal;
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.restore();
  }
  if (chosen) {
    pop(ctx, t, 5 * B, X + Wc - 96, rowY(1) + 54, () => {
      ctx.beginPath();
      ctx.arc(0, 0, 26, 0, Math.PI * 2);
      ctx.fillStyle = C.signal;
      ctx.fill();
      check(ctx, 0, 0, 22, C.white, 6);
    });
  }

  // Button: tapped on beat 6, then confirming.
  const bx = X + 40;
  const by = Y + 840;
  const bw = Wc - 80;
  const bh = 116;
  const press = t >= 6 * B ? 1 - 0.05 * Math.exp(-(t - 6 * B) * 10) : 1;
  ctx.save();
  ctx.translate(bx + bw / 2, by + bh / 2);
  ctx.scale(press, press);
  rr(ctx, -bw / 2, -bh / 2, bw, bh, 34);
  ctx.fillStyle = C.ink;
  ctx.fill();
  const waiting = t >= 6 * B + 0.16;
  const label = waiting ? "Confirming" : chosen ? "Pay with Bitcoin" : "Pay 25.00 MUSD";
  txt(ctx, label, waiting ? -26 : 0, 17, { size: 48, weight: 600, align: "center" });
  if (waiting) {
    const lw = measure(ctx, label, 48, 600);
    ctx.beginPath();
    ctx.arc(lw / 2 + 22, 0, 18, t * 12, t * 12 + 4.4);
    ctx.strokeStyle = C.white;
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.stroke();
  }
  ctx.restore();
  ring(ctx, t, 6 * B, bx + bw / 2, by + bh / 2, 30, 260, C.signal, 12, 0.45);
  // The tap: a soft dot that slides in and presses.
  const tp = pr(t, 5 * B + 0.14, 0.26);
  if (tp > 0 && t < 6 * B + 0.3) {
    const e = E.out3(tp);
    ctx.save();
    ctx.globalAlpha = 0.9 * (1 - pr(t, 6 * B + 0.1, 0.2));
    ctx.beginPath();
    ctx.arc(lerp(900, bx + bw / 2 + 40, e), lerp(1700, by + bh / 2 + 10, e), 44 - 8 * pr(t, 6 * B - 0.04, 0.08), 0, Math.PI * 2);
    ctx.fillStyle = rgba(C.ink, 0.28);
    ctx.fill();
    ctx.strokeStyle = rgba(C.white, 0.9);
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.restore();
  }
  pop(ctx, t, 7 * B, 770, Y - 6, () => pill(ctx, 0, 0, "No network fee", { bg: C.musd, fg: C.white, size: 46 }), { rot: 0.07 });
}

const CONFETTI = Array.from({ length: 44 }, (_, i) => ({
  a: rnd(i + 7) * Math.PI * 2,
  v: 500 + rnd(i + 70) * 1300,
  s: 12 + rnd(i + 170) * 22,
  c: [C.white, C.ink, C.signal4, "#a9efc8"][i % 4],
  round: i % 3 !== 0,
}));

function sceneDrop(ctx, t) {
  const cover = pr(t, 0, 0.42);
  if (cover < 1) sceneCheckout(ctx, 8 * B - 0.001);
  ctx.save();
  ctx.beginPath();
  ctx.arc(540, 1438, lerp(40, 2400, E.outExpo(cover)), 0, Math.PI * 2);
  ctx.clip();
  bg(ctx, t, C.musd, [
    { x: 540, y: 500, r: 900, c: C.musd3, a: 0.5 },
    { x: 900, y: 1700, r: 700, c: C.musd9, a: 0.35 },
  ]);
  ctx.restore();

  const cx = 540;
  const cy = 660;
  CONFETTI.forEach((p) => {
    const d = (p.v * (1 - Math.exp(-2.6 * t))) / 2.6;
    const x = cx + Math.cos(p.a) * d;
    const y = cy + Math.sin(p.a) * d + 420 * t * t;
    const a = Math.min(1, t * 12) * (1 - pr(t, 1.0, 0.6));
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(x, y);
    ctx.rotate(p.a + t * 5);
    ctx.fillStyle = p.c;
    if (p.round) {
      ctx.beginPath();
      ctx.arc(0, 0, p.s / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      rr(ctx, -p.s / 2, -p.s / 3, p.s, p.s / 1.5, 4);
      ctx.fill();
    }
    ctx.restore();
  });
  ring(ctx, t, 0.04, cx, cy, 150, 640, C.white, 16, 0.6);
  pop(ctx, t, 0.03, cx, cy, () => {
    ctx.beginPath();
    ctx.arc(0, 0, 160, 0, Math.PI * 2);
    ctx.fillStyle = C.white;
    ctx.fill();
    check(ctx, 0, 6, 130, C.musd6, 30, pr(t, 0.14, 0.24));
  }, { dur: 0.6 });
  const n = (25 * E.out3(pr(t, 0.06, 0.4))).toFixed(2);
  headline(ctx, t, [{ s: n, at: 0.06 }], { x: 540, y: 1050, size: 210, align: "center", weight: 700 });
  riseIn(ctx, t, 0.16, "MUSD received", 540, 1140, { size: 60, align: "center", weight: 600, fill: C.musd9 });
  riseIn(ctx, t, B, "You get the exact amount.", 540, 1320, { size: 66, align: "center" });
  riseIn(ctx, t, 2 * B, "The contract makes sure.", 540, 1404, { size: 66, align: "center", fill: C.musd9 });
}

/** "No ___." card: a huge No, the thing in the accent colour, then a one-line reason on the second beat. */
function sceneNo(word, sub, th) {
  return (ctx, t) => {
    bg(ctx, t, th.bg, th.glow ? [{ x: 860, y: 1500, r: 800, c: th.glow, a: 0.4 }] : []);
    dots(ctx, t, th.fg, 0.06);
    txt(ctx, "No", 70, 800, { size: 380, weight: 700, fill: th.fg });
    headline(ctx, t, [{ s: word, at: 0.05, fill: th.accent }], { y: 970, size: 148, weight: 700 });
    const p = pr(t, B, 0.3);
    if (p > 0) {
      const e = E.outExpo(p);
      ctx.save();
      ctx.globalAlpha = Math.min(1, p * 3);
      ctx.fillStyle = th.accent;
      ctx.fillRect(84, 1090, 110 * e, 10);
      ctx.restore();
    }
    riseIn(ctx, t, B, sub, 84, 1190, { size: 58, weight: 550, fill: th.fg });
  };
}

const PLUGS = [
  ["Shopify", "shopify", 0],
  ["WooCommerce", "woocommerce", 150],
  ["Payment links", C.signal, 40],
  ["QR codes", C.ink, 260],
  ["REST API", C.musd, 0],
  ["AI agents", null, 180],
];

function scenePlug(ctx, t) {
  bg(ctx, t, C.ink, [
    { x: 900, y: 500, r: 760, c: C.signal, a: 0.3 },
    { x: 140, y: 1500, r: 760, c: C.agent, a: 0.34 },
  ]);
  dots(ctx, t, C.white, 0.05);
  headline(ctx, t, [{ s: "Sell", at: -1 }, { s: "anywhere.", at: 0.04, fill: C.signal4 }], { y: 380, size: 160 });
  PLUGS.forEach(([label, dot, dx], i) => {
    const at = i * (B / 2);
    const y = 690 + i * 148;
    const p = pr(t, at, 0.5);
    if (p <= 0) return;
    ctx.save();
    ctx.translate(80 + dx + lerp(-240, 0, E.outExpo(p)), y);
    ctx.rotate((i % 2 ? 1 : -1) * 0.025 * (1 + (1 - E.spring(p)) * 6));
    ctx.globalAlpha = Math.min(1, p * 5);
    const s = lerp(0.7, 1, E.spring(p));
    ctx.scale(s, s);
    if (LOGOS[dot]) pill(ctx, 0, 0, label, { size: 62, h: 120, logo: dot, align: "left" });
    else if (dot) pill(ctx, 0, 0, label, { size: 62, h: 120, dot, align: "left" });
    else pill(ctx, 0, 0, label, { size: 62, h: 120, bg: C.agent, fg: C.white, align: "left" });
    ctx.restore();
  });
}

// ---------- 2 · borrow, don't sell

function sceneDontSell(ctx, t) {
  bg(ctx, t, C.ink, [
    { x: 760, y: 1300, r: 860, c: C.signal, a: 0.42 },
    { x: 160, y: 300, r: 600, c: C.btc, a: 0.16 },
  ]);
  dots(ctx, t, C.white, 0.05);
  headline(ctx, t, [{ s: "Don't sell", at: 0 }, { s: "your Bitcoin.", at: B, fill: C.signal4 }], { y: 520, size: 148 });
  const p = pr(t, B, 0.7);
  if (p > 0) {
    const e = E.spring(p);
    const cx = 700;
    const cy = 1230 + Math.sin(t * 2.2) * 18;
    ring(ctx, t, 2 * B, cx, cy, 240, 520, C.signal4, 12, 0.55);
    ring(ctx, t, 3 * B, cx, cy, 240, 520, C.signal4, 12, 0.55);
    coin(ctx, cx, cy, 250 * e * (1 + 0.05 * beatEnv()), "BTC", { rot: lerp(-0.9, -0.12, e) });
  }
}

function sceneBorrow(ctx, t) {
  bg(ctx, t, C.ink, [
    { x: 800, y: 760, r: 820, c: C.musd, a: 0.4 },
    { x: 200, y: 1400, r: 640, c: C.btc, a: 0.22 },
  ]);
  dots(ctx, t, C.white, 0.05);
  headline(ctx, t, [{ s: "Borrow", at: -1, fill: C.musd4 }, { s: "against it.", at: 0.04 }], { y: 420, size: 160 });
  const sx = 290;
  const sy = 1290;
  const tx = 690;
  const ty = 860;
  // MUSD coins arc from the locked BTC to the amount pill.
  const N = 9;
  let arrived = 0;
  for (let i = 0; i < N; i++) {
    const p = pr(t, B + i * 0.13, 0.5);
    if (p >= 1) arrived++;
    if (p <= 0 || p >= 1) continue;
    const e = E.io3(p);
    const x = (1 - e) ** 2 * sx + 2 * (1 - e) * e * 380 + e * e * tx;
    const y = (1 - e) ** 2 * sy + 2 * (1 - e) * e * 620 + e * e * ty;
    coin(ctx, x, y, 54 * Math.min(1, p * 4) * (1 - 0.4 * pr(p, 0.8, 0.2)), "MUSD", { rot: e * 3 });
  }
  const lastArrival = arrived ? B + (arrived - 1) * 0.13 + 0.5 : -9;
  const bump = 1 + 0.12 * Math.exp(-(t - lastArrival) * 14);
  pop(ctx, t, B - 0.1, tx, ty, () => {
    ctx.scale(bump, bump);
    pill(ctx, 0, 0, `${Math.round((150 * arrived) / N)} MUSD`, { size: 74, h: 150, bg: C.white, fg: C.ink, weight: 700, dot: C.musd });
  });
  coin(ctx, sx, sy + Math.sin(t * 2.2) * 12, 190 * (1 + 0.04 * beatEnv()), "BTC", { rot: -0.12 });
  pop(ctx, t, B * 0.5, sx + 140, sy + 130, () => {
    ctx.beginPath();
    ctx.arc(0, 0, 74, 0, Math.PI * 2);
    ctx.fillStyle = C.white;
    ctx.fill();
    lock(ctx, 0, 0, 62, C.ink);
  });
  riseIn(ctx, t, 3 * B, "Your BTC stays yours.", 540, 1560, { size: 60, weight: 600, align: "center" });
}

function sceneGauge(ctx, t) {
  bg(ctx, t, C.canvas, [{ x: 900, y: 240, r: 760, c: C.musd, a: 0.2 }]);
  dots(ctx, t, C.ink, 0.05);
  headline(ctx, t, [{ s: "With a built-in", at: -1, fill: C.ink }, { s: "safety floor.", at: 0.04, fill: C.musd6 }], { y: 330, size: 124 });

  // Collateral ratio: 198% → 184% for a 150 MUSD borrow; a 600 MUSD borrow would hit 143% and is refused.
  let v = 198;
  v = lerp(v, 184, E.io3(pr(t, 2 * B, 0.34)));
  v = lerp(v, 143, E.io3(pr(t, 5 * B, 0.3)));
  v = lerp(v, 184, E.spring(pr(t, 6 * B + 0.1, 0.5)));
  const bad = v < 160;
  const shake = t >= 6 * B ? Math.sin((t - 6 * B) * 70) * 16 * Math.exp(-(t - 6 * B) * 9) : 0;

  const cx = 540 + shake;
  const cy = 1090;
  const R = 340;
  const ang = (x) => Math.PI + (clamp(x, 100, 250) - 100) / 150 * Math.PI;
  const arc = (a, b, color, lw) => {
    ctx.beginPath();
    ctx.arc(cx, cy, R, ang(a), ang(b));
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.stroke();
  };
  ctx.save();
  ctx.lineCap = "round";
  arc(100, 250, C.stone2, 60);
  ctx.lineCap = "butt";
  arc(102, 160, C.redSoft, 60);
  ctx.lineCap = "round";
  arc(100, v, bad ? C.red : C.musd, 60);
  // The floor tick.
  const fa = ang(160);
  ctx.beginPath();
  ctx.moveTo(cx + Math.cos(fa) * (R - 52), cy + Math.sin(fa) * (R - 52));
  ctx.lineTo(cx + Math.cos(fa) * (R + 62), cy + Math.sin(fa) * (R + 62));
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 9;
  ctx.stroke();
  ctx.restore();
  txt(ctx, "160% floor", cx + Math.cos(fa) * (R + 84) + 40, cy + Math.sin(fa) * (R + 84) - 4, { size: 40, weight: 650, fill: C.ink, align: "center" });
  const va = ang(v);
  ctx.beginPath();
  ctx.arc(cx + Math.cos(va) * R, cy + Math.sin(va) * R, 44, 0, Math.PI * 2);
  ctx.fillStyle = C.white;
  ctx.fill();
  ctx.strokeStyle = bad ? C.red : C.musd;
  ctx.lineWidth = 12;
  ctx.stroke();
  txt(ctx, `${Math.round(v)}%`, cx, cy - 10, { size: 190, weight: 700, fill: bad ? C.red : C.ink, align: "center" });
  txt(ctx, "collateral ratio", 540, cy + 56, { size: 42, weight: 550, fill: C.stone5, align: "center" });

  // Two requests: one paid, one refused.
  const paid = t >= 3 * B;
  pop(ctx, t, B, 540, 1300, () => {
    pill(ctx, 0, 0, paid ? "150 MUSD · Paid" : "Borrow 150 MUSD", { size: 58, h: 122, bg: paid ? C.musd : C.white, fg: paid ? C.white : C.ink, weight: 650, stroke: paid ? null : C.stone2 });
  });
  if (paid) ring(ctx, t, 3 * B, 540, 1300, 60, 420, C.musd, 10, 0.45);
  const refused = t >= 6 * B;
  pop(ctx, t, 4 * B, 540 + shake, 1450, () => {
    pill(ctx, 0, 0, refused ? "600 MUSD · Refused" : "Borrow 600 MUSD", { size: 58, h: 122, bg: refused ? C.red : C.white, fg: refused ? C.white : C.ink, weight: 650, stroke: refused ? null : C.stone2 });
  });
}

function sceneKeep(ctx, t) {
  bg(ctx, t, C.ink, [
    { x: 840, y: 1300, r: 860, c: C.musd, a: 0.36 },
    { x: 160, y: 360, r: 640, c: C.signal, a: 0.3 },
  ]);
  dots(ctx, t, C.white, 0.05);
  headline(ctx, t, [{ s: "Keep your", at: -1 }, { s: "Bitcoin.", at: 0.04, fill: C.signal4 }, { s: "Pay today.", at: B, fill: C.musd4 }], { y: 640, size: 168 });
  riseIn(ctx, t, 2 * B, "Borrow MUSD right at checkout.", 84, 1130, { size: 56, weight: 550, fill: C.stone3 });
  const p = pr(t, B, 0.6);
  if (p > 0) {
    coin(ctx, 330, 1400 + Math.sin(t * 2) * 14, 130 * E.spring(p), "BTC", { rot: -0.15 });
    coin(ctx, 560, 1400 + Math.cos(t * 2) * 14, 130 * E.spring(pr(t, B + 0.12, 0.6)), "MUSD", { rot: 0.12 });
  }
}

// ---------- 3 · AI agents

function sceneAgentHook(ctx, t) {
  bg(ctx, t, C.ink, [
    { x: 800, y: 1300, r: 900, c: C.agent, a: 0.5 },
    { x: 140, y: 300, r: 600, c: C.signal, a: 0.16 },
  ]);
  dots(ctx, t, C.white, 0.05);
  headline(ctx, t, [{ s: "Your next", at: 0 }, { s: "customer is", at: B }, { s: "an AI agent.", at: 2 * B, fill: C.agent3 }], { y: 560, size: 158 });
  const p = pr(t, 2 * B, 0.6);
  if (p > 0) {
    const e = E.spring(p);
    const k = 1 + 0.1 * beatEnv();
    sparkle(ctx, 720, 1280, 230 * e * k, C.agent3, t * 0.6);
    sparkle(ctx, 420, 1440, 90 * E.spring(pr(t, 2 * B + 0.12, 0.6)) * k, C.white, -t * 0.9);
    sparkle(ctx, 900, 1040, 64 * E.spring(pr(t, 2 * B + 0.2, 0.6)) * k, C.signal4, t * 1.2);
    ring(ctx, t, 3 * B, 720, 1280, 120, 520, C.agent3, 10, 0.55);
  }
}

const TERM = [
  ["$ GET /api/report", C.stone3, 500],
  ["← 402 Payment Required · 0.05 MUSD", C.signal3, 500],
  ["✓ under cap 1.00 MUSD / payment", C.musd3, 500],
  ["$ GET /api/report  PAYMENT-SIGNATURE", C.stone3, 500],
  ["← 200 OK", C.musd4, 700],
];

function sceneTerminal(ctx, t) {
  bg(ctx, t, C.ink, [
    { x: 880, y: 300, r: 760, c: C.agent, a: 0.42 },
    { x: 160, y: 1560, r: 700, c: C.musd, a: t >= 4 * B ? 0.34 : 0.12 },
  ]);
  dots(ctx, t, C.white, 0.05);
  headline(ctx, t, [{ s: "Agents pay", at: -1 }, { s: "per request.", at: 0.04, fill: C.agent3 }], { y: 350, size: 140 });

  const X = 60;
  const Y = 580 + lerp(200, 0, E.spring(pr(t, -0.1, 0.7)));
  const Wc = 960;
  const Hc = 600;
  const ok = t >= 4 * B;
  ctx.save();
  ctx.shadowColor = rgba(ok ? C.musd4 : C.agent, 0.5);
  ctx.shadowBlur = 90 * (1 + 0.3 * beatEnv());
  rr(ctx, X, Y, Wc, Hc, 40);
  ctx.fillStyle = C.ink2;
  ctx.fill();
  ctx.restore();
  rr(ctx, X, Y, Wc, Hc, 40);
  ctx.strokeStyle = ok ? rgba(C.musd4, 0.9) : "rgba(255,255,255,0.14)";
  ctx.lineWidth = ok ? 5 : 3;
  ctx.stroke();
  [C.red, "#f59e0b", C.musd4].forEach((c, i) => {
    ctx.beginPath();
    ctx.arc(X + 56 + i * 40, Y + 54, 12, 0, Math.PI * 2);
    ctx.fillStyle = c;
    ctx.fill();
  });
  TERM.forEach(([s, fill, weight], i) => {
    const at = i * B;
    if (t < at) return;
    const n = Math.ceil(s.length * pr(t, at, 0.22));
    const y = Y + 170 + i * 88;
    txt(ctx, s.slice(0, n), X + 48, y, { size: 39, weight, fill, mono: true });
    const last = i === TERM.length - 1 || t < (i + 1) * B;
    if (last && Math.floor(t / 0.2) % 2 === 0) {
      ctx.fillStyle = fill;
      ctx.fillRect(X + 52 + measure(ctx, s.slice(0, n), 39, weight, true), y - 34, 20, 42);
    }
  });
  ring(ctx, t, 4 * B, 540, Y + Hc / 2, 200, 760, C.musd4, 14, 0.5);
  pop(ctx, t, 4 * B + 0.04, 800, Y + 520, () => pill(ctx, 0, 0, "PAID", { size: 64, h: 124, bg: C.musd, fg: C.white, weight: 750 }), { rot: -0.1 });

  pop(ctx, t, 5 * B, 220, 1330, () => pill(ctx, 0, 0, "x402", { size: 62, h: 122, bg: C.agent, fg: C.white, mono: true, weight: 650 }), { rot: -0.03 });
  pop(ctx, t, 6 * B, 660, 1330, () => pill(ctx, 0, 0, "No gas. No pop-ups.", { size: 52, h: 122 }), { rot: 0.02 });
  pop(ctx, t, 7 * B, 540, 1480, () => pill(ctx, 0, 0, "You get MUSD.", { size: 62, h: 122, bg: C.musd, fg: C.white, weight: 650 }), { rot: -0.015 });
}

const RUNS_IN = ["Claude", "Cursor", "Codex", "Hermes Agent"];
const RUNS_IN_LOGO = ["claude", "cursor"]; // Codex and Hermes Agent have no openly licensed mark

function sceneRunsIn(ctx, t) {
  bg(ctx, t, C.canvas, [{ x: 880, y: 300, r: 800, c: C.agent, a: 0.26 }]);
  dots(ctx, t, C.ink, 0.05);
  headline(ctx, t, [{ s: "Runs in", at: -1, fill: C.ink }], { y: 400, size: 170 });
  RUNS_IN.forEach((s, i) => {
    const at = i * 0.3;
    const p = pr(t, at, 0.5);
    if (p <= 0) return;
    ctx.save();
    ctx.translate(80 + (i % 2) * 110 + lerp(300, 0, E.outExpo(p)), 640 + i * 190);
    ctx.globalAlpha = Math.min(1, p * 5);
    const sc = lerp(0.7, 1, E.spring(p));
    ctx.scale(sc, sc);
    pill(ctx, 0, 0, s, { size: 84, h: 158, bg: i === 3 ? C.agent : C.ink, fg: C.white, weight: 650, align: "left", logo: RUNS_IN_LOGO[i] });
    ctx.restore();
  });
}

function scenePrice(ctx, t) {
  bg(ctx, t, C.ink, [
    { x: 240, y: 1400, r: 860, c: C.agent, a: 0.46 },
    { x: 900, y: 300, r: 600, c: C.signal, a: 0.2 },
  ]);
  dots(ctx, t, C.white, 0.05);
  const p = pr(t, 0, 0.6);
  ctx.save();
  setFont(ctx, 560, 750);
  ctx.textAlign = "center";
  ctx.strokeStyle = rgba(C.agent3, 0.3 * p);
  ctx.lineWidth = 5;
  ctx.translate(540, 1520);
  ctx.scale(lerp(1.3, 1, E.outExpo(p)), lerp(1.3, 1, E.outExpo(p)));
  ctx.strokeText("402", 0, 0);
  ctx.restore();
  headline(ctx, t, [{ s: "Price any", at: -1 }, { s: "API route.", at: 0.04, fill: C.agent3 }], { y: 620, size: 176 });
  riseIn(ctx, t, B, "Unpaid calls get a 402", 84, 930, { size: 60, weight: 550, fill: C.stone3 });
  riseIn(ctx, t, B + 0.08, "with the price.", 84, 1004, { size: 60, weight: 550, fill: C.stone3 });
}

// ---------- 4 · for X: square, slower, quieter

const X_BEATS = 36;

/** Shared backdrop: ink, hairlines, the mark, a section label and a progress line. */
function xBack(ctx, t, label) {
  bg(ctx, t, C.ink, [
    { x: 920, y: 120, r: 760, c: C.signal, a: 0.17 },
    { x: 100, y: 1020, r: 700, c: C.agent, a: 0.13 },
  ]);
  ctx.fillStyle = "rgba(255,255,255,0.035)";
  for (let x = 72; x <= 1008; x += 156) ctx.fillRect(x, 0, 1, H);
  mark(ctx, 94, 92, 44);
  txt(ctx, "Mezout", 128, 104, { size: 34, weight: 600 });
  txt(ctx, label, 1008, 102, { size: 22, weight: 500, mono: true, fill: C.stone4, align: "right", ls: 0.08 });
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(72, 1012, 936, 2);
  ctx.fillStyle = C.signal4;
  ctx.fillRect(72, 1011, 936 * clamp(NOW / (X_BEATS * B)), 4);
}

function xHero(ctx, t) {
  xBack(ctx, t, "CHECKOUT ON MEZO");
  const size = fitSize(ctx, ["Accept Bitcoin.", "Settle in MUSD."], 936, 140, 500);
  words(ctx, t, -0.25, "Accept Bitcoin.", 72, 490, { size, stagger: 0.14 });
  words(ctx, t, 2 * B, "Settle in MUSD.", 72, 490 + size * 1.06, { size, fill: C.musd3, stagger: 0.14 });
  words(ctx, t, 4 * B, "Customers pay their way.", 72, 790, { size: 44, weight: 400, fill: C.stone4, stagger: 0.05 });
  words(ctx, t, 4 * B + 0.3, "Merchants get the exact amount.", 72, 848, { size: 44, weight: 400, fill: C.stone4, stagger: 0.05 });
}

const X_METHODS = [["MUSD", "MUSD", C.musd3], ["BTC", "Bitcoin", C.btc], ["MEZO", "MEZO", C.mezo], ["BORROW", "Borrow", C.amber]];
const cubic = (a, b, c, d, u) => (1 - u) ** 3 * a + 3 * (1 - u) ** 2 * u * b + 3 * (1 - u) * u * u * c + u ** 3 * d;

function xFlow(ctx, t) {
  xBack(ctx, t, "ONE PAYOUT");
  words(ctx, t, 0.1, "Any way they pay. One payout.", 72, 268, { size: 62 });
  const ys = [400, 520, 640, 760];
  const RX = 610;
  const RY = 580;
  // Payments arrive at the merchant on these beats: one per method, then all four together.
  const arrivals = [[4, 0], [5, 1], [6, 2], [7, 3], [9, 0], [9, 1], [9, 2], [9, 3]];
  const landed = arrivals.filter(([b]) => t >= b * B);
  const since = landed.length ? t - landed.at(-1)[0] * B : 9;
  const glow = Math.exp(-since * 4);

  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ys.forEach((y, i) => {
    const p = E.io3(pr(t, B + i * 0.1, 0.7));
    if (p <= 0) return;
    ctx.beginPath();
    ctx.moveTo(362, y);
    ctx.bezierCurveTo(470, y, 470, RY, 548, RY);
    ctx.setLineDash([420, 420]);
    ctx.lineDashOffset = 420 * (1 - p);
    ctx.stroke();
  });
  const lp = E.io3(pr(t, B + 0.6, 0.5));
  if (lp > 0) {
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(672, RY);
    ctx.lineTo(672 + 98 * lp, RY);
    ctx.stroke();
  }
  ctx.restore();

  // Pulses: the token's colour on the way in, MUSD green on the way out.
  for (const [b, i] of arrivals) {
    const launch = b * B - 0.75;
    for (let k = 5; k >= 0; k--) {
      const tt = t - k * 0.018;
      const p1 = pr(tt, launch, 0.5);
      const p2 = pr(tt, launch + 0.5, 0.25);
      if (p1 <= 0 || p2 >= 1) continue;
      const u = E.io3(p1);
      const x = p1 < 1 ? cubic(362, 470, 470, 548, u) : lerp(548, 770, p2);
      const y = p1 < 1 ? cubic(ys[i], ys[i], RY, RY, u) : RY;
      ctx.beginPath();
      ctx.arc(x, y, 9 - k, 0, Math.PI * 2);
      ctx.fillStyle = rgba(p1 < 1 ? X_METHODS[i][2] : C.musd3, 1 - k * 0.16);
      ctx.fill();
    }
  }

  X_METHODS.forEach(([kind, label], i) => {
    const p = E.outExpo(pr(t, 0.25 + i * 0.12, 0.8));
    if (p <= 0) return;
    ctx.save();
    ctx.globalAlpha *= p;
    ctx.translate(lerp(-30, 0, p), 0);
    rr(ctx, 72, ys[i] - 44, 290, 88, 44);
    ctx.fillStyle = "#1a1715";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 2;
    ctx.stroke();
    coin(ctx, 120, ys[i], 28, kind, { shadow: false });
    txt(ctx, label, 166, ys[i] + 13, { size: 36, weight: 500 });
    ctx.restore();
  });

  const rp = E.outExpo(pr(t, 0.5, 0.8));
  ctx.save();
  ctx.globalAlpha *= rp;
  ctx.beginPath();
  ctx.arc(RX, RY, 62, 0, Math.PI * 2);
  ctx.fillStyle = "#1a1715";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 2;
  ctx.stroke();
  mark(ctx, RX, RY, 60);
  txt(ctx, "ROUTER", RX, RY + 104, { size: 20, weight: 500, mono: true, fill: C.stone4, align: "center", ls: 0.08 });
  ctx.restore();

  const mp = E.outExpo(pr(t, 0.7, 0.8));
  ctx.save();
  ctx.globalAlpha *= mp;
  ctx.shadowColor = rgba(C.musd4, 0.55 * glow);
  ctx.shadowBlur = 60;
  rr(ctx, 770, 470, 238, 220, 28);
  ctx.fillStyle = "#1a1715";
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = mix("#3f3a37", C.musd3, glow);
  ctx.lineWidth = 2 + 2 * glow;
  ctx.stroke();
  txt(ctx, "MERCHANT", 796, 518, { size: 20, weight: 500, mono: true, fill: C.stone4, ls: 0.08 });
  txt(ctx, "25.00", 794, 606, { size: 72, weight: 600 });
  txt(ctx, "MUSD · exact", 796, 652, { size: 26, weight: 500, fill: C.musd3 });
  if (landed.length) txt(ctx, `invoice.paid ×${landed.length}`, 889, 740, { size: 22, weight: 500, mono: true, fill: mix(C.stone4, C.musd3, glow), align: "center" });
  ctx.restore();

  const line = "The contract makes sure the merchant gets the exact amount.";
  words(ctx, t, 2 * B, line, 72, 900, { size: fitSize(ctx, [line], 936, 36, 400), weight: 400, fill: C.stone4, stagger: 0.04 });
}

const X_SPECS = [
  ["Gasless", "The relayer pays", "the network fee."],
  ["Passkeys", "No wallet.", "No seed phrase."],
  ["x402", "AI agents pay", "per request."],
  ["160% floor", "Borrow against BTC,", "never past the floor."],
];

function xSpecs(ctx, t) {
  xBack(ctx, t, "BUILT IN");
  const d = E.io3(pr(t, 0, 0.9));
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  ctx.fillRect(540, 250, 2, 680 * d);
  ctx.fillRect(72, 590, 936 * d, 2);
  X_SPECS.forEach(([term, l1, l2], i) => {
    const at = i * 2 * B + 0.1;
    const x = i % 2 ? 588 : 72;
    const y = i < 2 ? 250 : 590;
    words(ctx, t, at, `0${i + 1}`, x, y + 76, { size: 22, mono: true, fill: C.signal4 });
    words(ctx, t, at + 0.05, term, x, y + 176, { size: 78, weight: 500, fill: i === 2 ? C.agent3 : C.white });
    words(ctx, t, at + 0.2, l1, x, y + 238, { size: 33, weight: 400, fill: C.stone4, stagger: 0.04 });
    words(ctx, t, at + 0.3, l2, x, y + 282, { size: 33, weight: 400, fill: C.stone4, stagger: 0.04 });
  });
}

const X_SHIPS = [["Shopify", "WooCommerce", "REST API"], ["Payment links", "QR codes", "AI agents"]];

function xShips(ctx, t) {
  xBack(ctx, t, "INTEGRATIONS");
  words(ctx, t, 0.05, "Ships where you sell.", 72, 420, { size: fitSize(ctx, ["Ships where you sell."], 936, 104, 500) });
  let n = 0;
  X_SHIPS.forEach((row, r) => {
    let x = 72;
    row.forEach((s) => {
      const p = E.outExpo(pr(t, 0.3 + n++ * 0.1, 0.7));
      const mk = { Shopify: "shopify", WooCommerce: "woocommerce" }[s];
      const w = measure(ctx, s, 38, 500) + 64 + (mk ? logoW(mk, mk === "shopify" ? 36.1 : 21.3) + 12.2 : 0);
      if (p > 0) {
        ctx.save();
        ctx.globalAlpha *= p;
        pill(ctx, x, 550 + r * 104 + lerp(20, 0, p), s, { size: 38, h: 84, padX: 32, weight: 500, bg: "#1a1715", fg: C.white, stroke: "rgba(255,255,255,0.2)", align: "left", logo: mk });
        ctx.restore();
      }
      x += w + 16;
    });
  });
  const p = E.outExpo(pr(t, 1.1, 0.7));
  if (p > 0) {
    ctx.save();
    ctx.globalAlpha *= p;
    txt(ctx, "$ npx -y @mezout/mcp init", 72, 840, { size: 34, weight: 500, mono: true, fill: C.agent3 });
    ctx.restore();
  }
}

function xEnd(ctx, t) {
  xBack(ctx, t, "TESTNET");
  const p = E.outExpo(pr(t, 0.15, 0.9));
  ctx.save();
  ctx.globalAlpha *= p;
  const s = lerp(0.9, 1, p);
  ctx.translate(540, 380);
  ctx.scale(s, s);
  mark(ctx, 0, 0, 150, { draw: pr(t, 0.4, 0.5) });
  ctx.restore();
  words(ctx, t, 0.5, "Mezout", 540, 590, { size: 120, weight: 600, align: "center" });
  words(ctx, t, 1.0, "Checkout for humans and AI agents.", 540, 670, { size: 44, weight: 400, fill: C.stone3, align: "center", stagger: 0.06 });
  const u = E.outExpo(pr(t, 1.7, 0.8));
  if (u > 0) {
    ctx.save();
    ctx.globalAlpha *= u;
    pill(ctx, 540, 800 + lerp(16, 0, u), URL_TEXT, { size: 38, h: 86, padX: 40, weight: 500, bg: C.white, fg: C.ink });
    builtOnMezo(ctx, 540, 924, 30, 1, "· open source");
    ctx.restore();
  }
}

// ---------- the table

const T_INK = { bg: C.ink, fg: C.white, accent: C.signal4, glow: C.signal };
const T_ORANGE = { bg: C.signal, fg: C.ink, accent: C.white };
const T_LIGHT = { bg: C.canvas, fg: C.ink, accent: C.agent, glow: C.agent3 };
const T_VIOLET = { bg: C.agent, fg: C.white, accent: C.ink };

/**
 * Sound cues, in beats. `drop` is where the full beat lands (a riser of `riser` beats leads into it), `end` is the
 * end card. sfx: [beat, kind, n] with kind whoosh | tick | pop | ping | thud | buzz; n raises the pitch of ticks and pops.
 */
globalThis.ADS = {
  "pay-any-way": {
    beats: 40,
    scenes: [
      { at: 0, draw: sceneHook },
      { at: 8, draw: sceneCheckout, enter: "up" },
      { at: 16, draw: sceneDrop, enter: "none" },
      { at: 20, draw: sceneNo("wallet.", "Sign up with a passkey.", T_INK), enter: "up" },
      { at: 22, draw: sceneNo("gas fees.", "We cover the network fee.", T_ORANGE), enter: "up" },
      { at: 24, draw: sceneNo("seed phrase.", "Nothing to write down.", T_LIGHT), enter: "up" },
      { at: 26, draw: sceneNo("price swings.", "You're paid in stable MUSD.", T_VIOLET), enter: "up" },
      { at: 28, draw: scenePlug, enter: "left" },
      { at: 34, draw: endCard("Any way they pay.", "One payout.", C.signal4), enter: "cut" },
    ],
    audio: {
      drop: 16,
      riser: 4,
      end: 34,
      sfx: [
        [4, "whoosh"], [8, "whoosh"], [9, "tick", 0], [10, "tick", 1], [11, "tick", 2], [12, "tick", 3], [13, "pop", 2],
        [14, "thud"], [15, "pop", 5], [16, "ping"], [20, "whoosh"], [22, "whoosh"], [24, "whoosh"], [26, "whoosh"], [28, "whoosh"],
        [28, "pop", 0], [28.5, "pop", 1], [29, "pop", 2], [29.5, "pop", 3], [30, "pop", 4], [30.5, "pop", 5], [36.5, "ping"],
      ],
    },
  },
  "borrow-dont-sell": {
    beats: 28,
    scenes: [
      { at: 0, draw: sceneDontSell },
      { at: 4, draw: sceneBorrow, enter: "up" },
      { at: 8, draw: sceneGauge, enter: "left" },
      { at: 16, draw: sceneKeep, enter: "up" },
      { at: 20, draw: endCard("Borrow. Don't sell.", "Pay in MUSD against your BTC.", C.musd4), enter: "cut" },
    ],
    audio: {
      drop: 8,
      riser: 4,
      end: 20,
      sfx: [
        [4, "whoosh"], [4.5, "thud"], [6.2, "tick", 0], [6.55, "tick", 1], [6.85, "tick", 2], [7.2, "tick", 3], [7.5, "tick", 4],
        [8, "whoosh"], [9, "pop", 0], [10, "tick", 2], [11, "ping"], [12, "pop", 1], [13, "tick", 0], [14, "buzz"], [16, "whoosh"], [17, "pop", 3],
        [22.5, "ping"],
      ],
    },
  },
  "ai-agents": {
    beats: 28,
    scenes: [
      { at: 0, draw: sceneAgentHook },
      { at: 4, draw: sceneTerminal, enter: "up" },
      { at: 12, draw: sceneRunsIn, enter: "left" },
      { at: 16, draw: scenePrice, enter: "up" },
      { at: 20, draw: endCard("Checkout for humans", "and AI agents.", C.agent3), enter: "cut" },
    ],
    audio: {
      drop: 4,
      riser: 2,
      end: 20,
      sfx: [
        [2, "pop", 4], [4, "whoosh"], [4, "tick", 0], [5, "thud"], [6, "tick", 2], [7, "tick", 0], [8, "ping"], [9, "pop", 0], [10, "pop", 2], [11, "pop", 4],
        [12, "whoosh"], [12, "pop", 0], [12.75, "pop", 2], [13.5, "pop", 4], [14.25, "pop", 6], [16, "whoosh"], [17, "thud"], [22.5, "ping"],
      ],
    },
  },
  // Square for the X feed, 100 BPM, dissolves instead of pushes, no camera punch.
  "x-settle-in-musd": {
    w: 1080,
    h: 1080,
    bpm: 100,
    punch: 0,
    pulse: 0.3,
    beats: X_BEATS,
    scenes: [
      { at: 0, draw: xHero },
      { at: 6, draw: xFlow, enter: "fade" },
      { at: 16, draw: xSpecs, enter: "fade" },
      { at: 24, draw: xShips, enter: "fade" },
      { at: 28, draw: xEnd, enter: "fade" },
    ],
    audio: {
      style: "smooth",
      sfx: [
        [6, "whoosh"], [10, "ping", 0], [11, "ping", 1], [12, "ping", 2], [13, "ping", 3], [15, "chime"],
        [16, "whoosh"], [16, "tick"], [18, "tick"], [20, "tick"], [22, "tick"], [24, "whoosh"], [28, "whoosh"],
      ],
    },
  },
};
