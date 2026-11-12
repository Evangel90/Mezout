// Synthesizes each ad's soundtrack: a 150 BPM beat (kick, clap, hats, rolling bass, arp, stabs) with a riser into
// the drop, plus sound effects on the cues listed in ads.js. No samples; everything is generated here.
// Run: node docs/motion/ads/audio.mjs [ad-id]   → docs/motion/ads/out/<ad-id>.wav
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
vm.runInThisContext(fs.readFileSync(path.join(here, "lib.js"), "utf8") + "\n" + fs.readFileSync(path.join(here, "ads.js"), "utf8"));
const ADS = globalThis.ADS;

const SR = 44100;
const BEAT = 0.4;
const TAU = Math.PI * 2;

function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** State-variable filter over a buffer; cutoff is a number or a per-sample function. mode: lp | bp | hp. */
function svf(buf, cutoff, q, mode) {
  const out = new Float32Array(buf.length);
  let ic1 = 0;
  let ic2 = 0;
  const k = 1 / q;
  const fn = typeof cutoff === "function" ? cutoff : () => cutoff;
  for (let i = 0; i < buf.length; i++) {
    const g = Math.tan((Math.PI * Math.min(fn(i), SR * 0.45)) / SR);
    const a1 = 1 / (1 + g * (g + k));
    const a2 = g * a1;
    const a3 = g * a2;
    const v3 = buf[i] - ic2;
    const v1 = a1 * ic1 + a2 * v3;
    const v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1;
    ic2 = 2 * v2 - ic2;
    out[i] = mode === "lp" ? v2 : mode === "bp" ? v1 : buf[i] - k * v1 - v2;
  }
  return out;
}

// F minor: i, i, VI, VII, one chord per bar.
const BARS = [
  { bass: 87.31, arp: [349.23, 415.3, 523.25, 698.46] }, // F
  { bass: 87.31, arp: [349.23, 415.3, 523.25, 698.46] },
  { bass: 69.3, arp: [277.18, 349.23, 415.3, 554.37] }, // Db
  { bass: 77.78, arp: [311.13, 392.0, 466.16, 622.25] }, // Eb
];
const ARP = [0, 2, 1, 3, 2, 1, 3, 2];

function synth(id) {
  const ad = ADS[id];
  const { drop, riser, end, sfx } = ad.audio;
  const total = ad.beats;
  const last = total - 2; // the final hit; it rings out to the end
  const N = Math.ceil(total * BEAT * SR);
  const rand = prng(id.length * 7919 + 13);
  const noise = () => rand() * 2 - 1;
  const L = new Float32Array(N);
  const R = new Float32Array(N);
  const track = () => new Float32Array(N);
  /** Writes a voice: fn(tt) for tt in 0..len seconds, starting at `at` seconds. */
  const voice = (buf, at, len, fn) => {
    const i0 = Math.round(at * SR);
    const n = Math.round(len * SR);
    for (let i = 0; i < n; i++) {
      const j = i0 + i;
      if (j < 0 || j >= N) continue;
      buf[j] += fn(i / SR);
    }
  };
  const mixIn = (buf, gain, pan = 0) => {
    const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4);
    const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4);
    for (let i = 0; i < N; i++) {
      L[i] += buf[i] * gl * 1.414;
      R[i] += buf[i] * gr * 1.414;
    }
  };
  const barOf = (b) => BARS[Math.floor(b / 4) % 4];

  // ----- drums
  const kickBeats = [];
  for (let b = 0; b < last; b++) if (b < drop - Math.min(2, riser) || b >= drop) kickBeats.push(b);
  const kick = track();
  const kickAt = (b, g = 1) =>
    voice(kick, b * BEAT, 0.36, (tt) => {
      const ph = TAU * (48 * tt + (140 / 38) * (1 - Math.exp(-tt * 38)));
      return g * Math.tanh((Math.sin(ph) * Math.exp(-tt * 7.5) + noise() * Math.exp(-tt * 420) * 0.35) * 1.9);
    });
  kickBeats.forEach((b) => kickAt(b));
  kickAt(last, 1.1);

  // Sidechain: the music ducks on every kick.
  const duck = new Float32Array(N).fill(1);
  [...kickBeats, last].forEach((b) => {
    const i0 = Math.round(b * BEAT * SR);
    for (let i = 0; i < 0.3 * SR && i0 + i < N; i++) duck[i0 + i] = Math.min(duck[i0 + i], 1 - 0.72 * Math.exp((-i / SR) * 11));
  });

  let clap = track();
  for (let b = 1; b < last; b += 2) {
    if (b >= drop - riser && b < drop) continue;
    const g = b < drop ? 0.55 : 1;
    voice(clap, b * BEAT, 0.3, (tt) => {
      const bursts = Math.exp(-tt * 110) + Math.exp(-Math.abs(tt - 0.011) * 110) * (tt > 0.011) + Math.exp(-Math.abs(tt - 0.022) * 110) * (tt > 0.022);
      return g * noise() * (bursts * 0.6 + Math.exp(-tt * 26) * 0.5);
    });
  }
  clap = svf(clap, 1700, 1.1, "bp");

  let hat = track();
  for (let b = 0; b < last; b += 0.25) {
    const off = Math.abs((b % 1) - 0.5) < 0.01;
    if (!off && b < drop) continue; // sixteenths only after the drop
    const g = off ? 1 : 0.42;
    voice(hat, b * BEAT, 0.12, (tt) => g * noise() * Math.exp(-tt * (off ? 55 : 130)));
  }
  hat = svf(hat, 7500, 0.8, "hp");

  // Snare roll into the drop: eighths, then sixteenths, then thirty-seconds.
  let roll = track();
  for (let b = drop - riser; b < drop; ) {
    const x = (b - (drop - riser)) / riser;
    voice(roll, b * BEAT, 0.09, (tt) => (0.25 + 0.75 * x) * noise() * Math.exp(-tt * 60));
    b += x < 0.5 ? 0.5 : x < 0.75 ? 0.25 : 0.125;
  }
  roll = svf(roll, 2400, 1.4, "bp");

  // ----- bass: three rolling sixteenths after each kick
  let bass = track();
  const bassEnv = track();
  for (let b = 0; b < last; b++) {
    if (b >= drop - Math.min(2, riser) && b < drop) continue;
    for (const o of [0.25, 0.5, 0.75]) {
      const f = barOf(b).bass;
      voice(bass, (b + o) * BEAT, 0.095, (tt) => (2 * ((tt * f) % 1) - 1) * Math.min(1, tt * 400) * Math.exp(-tt * 9) * (tt < 0.085 ? 1 : (0.095 - tt) / 0.01));
      voice(bassEnv, (b + o) * BEAT, 0.095, (tt) => Math.exp(-tt * 30));
    }
  }
  bass = svf(bass, (i) => 380 + 1500 * bassEnv[i], 2.2, "lp");

  // ----- arp: filtered down before the drop and opening up into it
  let arp = track();
  for (let b = 0; b < last; b += 0.25) {
    const f = barOf(b).arp[ARP[Math.round(b * 4) % 8]];
    voice(arp, b * BEAT, 0.16, (tt) => {
      const saw = 2 * ((tt * f * 1.004) % 1) - 1;
      const sq = (tt * f * 0.996) % 1 < 0.5 ? 1 : -1;
      return (saw * 0.6 + sq * 0.4) * Math.min(1, tt * 500) * Math.exp(-tt * 16);
    });
  }
  const dropI = drop * BEAT * SR;
  arp = svf(arp, (i) => (i < dropI ? 350 * 12 ** Math.max(0, i / dropI) ** 2 : 6500), 2.4, "lp");

  // ----- stabs after the drop: bar start and the "and" of two
  let stab = track();
  const chord = (at, len, decay, g) => {
    const notes = barOf(at).arp.slice(0, 3);
    for (const f of notes) for (const d of [0.993, 1, 1.007]) voice(stab, at * BEAT, len, (tt) => g * (2 * ((tt * f * d) % 1) - 1) * Math.min(1, tt * 300) * Math.exp(-tt * decay));
  };
  for (let b = drop; b < last; b += 4) {
    chord(b, 0.4, 9, 1);
    if (b + 1.5 < last) chord(b + 1.5, 0.3, 12, 0.8);
  }
  chord(last, 0.8, 2.4, 1.3);
  stab = svf(stab, 3600, 1, "lp");

  // ----- riser and impacts
  let rise = track();
  voice(rise, (drop - riser) * BEAT, riser * BEAT, (tt) => {
    const x = tt / (riser * BEAT);
    return noise() * x * x * 0.9 + Math.sin(TAU * (220 * tt + (1500 * tt * tt) / (2 * riser * BEAT))) * x * x * 0.22;
  });
  const riseI = (drop - riser) * BEAT * SR;
  const riseN = riser * BEAT * SR;
  rise = svf(rise, (i) => 500 * 18 ** clamp01((i - riseI) / riseN), 2.5, "bp");

  let crash = track();
  const sub = track();
  const impact = (b, g) => {
    voice(crash, b * BEAT, 1.6, (tt) => g * noise() * Math.exp(-tt * 3.2));
    voice(sub, b * BEAT, 1.0, (tt) => g * Math.sin(TAU * (42 * tt + (30 / 6) * (1 - Math.exp(-tt * 6)))) * Math.exp(-tt * 3.5));
  };
  impact(drop, 1);
  impact(end, 0.7);
  impact(last, 0.85);
  crash = svf(crash, 5200, 0.7, "hp");

  // ----- sound effects
  const fxL = track();
  const fxR = track();
  let whoosh = track();
  const whooshAt = [];
  for (const [b, kind, n = 0] of sfx) {
    const at = b * BEAT;
    const both = (len, fn, pan = 0) => {
      voice(fxL, at, len, (tt) => fn(tt) * (1 - pan * 0.4));
      voice(fxR, at, len, (tt) => fn(tt) * (1 + pan * 0.4));
    };
    if (kind === "whoosh") {
      whooshAt.push(at);
      voice(whoosh, at - 0.2, 0.42, (tt) => noise() * Math.exp(-(((tt - 0.2) / 0.085) ** 2)));
    }
    if (kind === "tick") {
      const f = 1500 * 2 ** ((n * 2) / 12);
      both(0.07, (tt) => 0.3 * Math.sin(TAU * f * tt) * Math.exp(-tt * 90) + 0.15 * noise() * Math.exp(-tt * 600), (n % 2) * 2 - 1);
    }
    if (kind === "pop") {
      const f = 520 * 2 ** ((n * 2) / 12);
      both(0.11, (tt) => 0.38 * Math.sin(TAU * (f * tt + ((f * 0.9) / 2) * (tt * tt) / 0.07)) * Math.min(1, tt * 800) * Math.exp(-tt * 34), (n % 2) * 2 - 1);
    }
    if (kind === "ping") {
      for (const [dt, m] of [[0, 1], [0.085, 1.335]]) {
        voice(fxL, at + dt, 0.9, (tt) => 0.24 * bell(tt, 1318.5 * m));
        voice(fxR, at + dt, 0.9, (tt) => 0.24 * bell(tt, 1318.5 * m * 1.002));
      }
    }
    if (kind === "thud") both(0.2, (tt) => 0.6 * Math.sin(TAU * (60 * tt + (70 / 24) * (1 - Math.exp(-tt * 24)))) * Math.exp(-tt * 20));
    if (kind === "buzz") {
      both(0.34, (tt) => {
        const env = Math.min(1, tt * 200) * (tt < 0.14 || (tt > 0.18 && tt < 0.32) ? 1 : 0);
        return 0.2 * env * (((tt * 104) % 1 < 0.5 ? 1 : -1) + ((tt * 110) % 1 < 0.5 ? 1 : -1));
      });
    }
  }
  function bell(tt, f) {
    return (Math.sin(TAU * f * tt) + 0.55 * Math.sin(TAU * f * 1.5 * tt) + 0.25 * Math.sin(TAU * f * 2.01 * tt)) * Math.min(1, tt * 900) * Math.exp(-tt * 6.5);
  }
  const sweepAt = (i) => {
    const t = i / SR;
    let near = 9;
    for (const w of whooshAt) if (Math.abs(t - w) < Math.abs(near)) near = t - w;
    return 900 + 5200 * Math.exp(-((near / 0.1) ** 2));
  };
  whoosh = svf(whoosh, sweepAt, 2.2, "bp");

  // ----- mix
  for (let i = 0; i < N; i++) {
    bass[i] *= duck[i];
    arp[i] *= duck[i];
    stab[i] *= duck[i];
  }
  mixIn(kick, 0.9);
  mixIn(sub, 0.55);
  mixIn(clap, 0.95);
  mixIn(hat, 0.3, 0.25);
  mixIn(roll, 0.95);
  mixIn(bass, 0.42);
  mixIn(stab, 0.085, -0.15);
  mixIn(rise, 1.1);
  mixIn(crash, 0.22);
  mixIn(whoosh, 0.75);
  // Arp with a ping-pong delay (dotted eighth).
  const dl = Math.round(0.3 * SR);
  const wetL = new Float32Array(N);
  const wetR = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const inL = arp[i] + (i >= dl ? wetR[i - dl] * 0.45 : 0);
    const inR = i >= dl ? wetL[i - dl] * 0.45 : 0;
    wetL[i] = inL;
    wetR[i] = inR + (i >= dl ? arp[i - dl] * 0.5 : 0);
    L[i] += (arp[i] * 0.7 + wetL[i] * 0.3) * 0.2;
    R[i] += (arp[i] * 0.7 + wetR[i] * 0.6) * 0.2;
  }
  for (let i = 0; i < N; i++) {
    L[i] += fxL[i];
    R[i] += fxR[i];
  }

  return master(L, R, N, 0.3, 1.25);
}

/** Soft clip, normalize, fade out over the last `fadeSec`, and pack as a 16-bit stereo WAV. */
function master(L, R, N, fadeSec, drive) {
  let peak = 0;
  for (let i = 0; i < N; i++) {
    L[i] = Math.tanh(L[i] * drive);
    R[i] = Math.tanh(R[i] * drive);
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  }
  const fade = fadeSec * SR;
  const pcm = Buffer.alloc(44 + N * 4);
  pcm.write("RIFF", 0);
  pcm.writeUInt32LE(36 + N * 4, 4);
  pcm.write("WAVEfmt ", 8);
  pcm.writeUInt32LE(16, 16);
  pcm.writeUInt16LE(1, 20);
  pcm.writeUInt16LE(2, 22);
  pcm.writeUInt32LE(SR, 24);
  pcm.writeUInt32LE(SR * 4, 28);
  pcm.writeUInt16LE(4, 32);
  pcm.writeUInt16LE(16, 34);
  pcm.write("data", 36);
  pcm.writeUInt32LE(N * 4, 40);
  for (let i = 0; i < N; i++) {
    const g = (0.7 / peak) * Math.min(1, (N - i) / fade);
    pcm.writeInt16LE(Math.round(L[i] * g * 32767), 44 + i * 4);
    pcm.writeInt16LE(Math.round(R[i] * g * 32767), 46 + i * 4);
  }
  return pcm;
}

/**
 * The calmer track (ad.audio.style "smooth"): electric-piano chords, a round bass, a soft kick with rim and shaker,
 * a sparse pluck and a reverb, at the ad's own tempo. sfx kinds: ping (n picks the note), chime, tick, whoosh, impact.
 * Takes an ad id from ads.js or an object {bpm, beats, audio: {sfx, kickFrom}}.
 */
export function synthSmooth(id) {
  const ad = typeof id === "string" ? ADS[id] : id;
  const beat = 60 / ad.bpm;
  const total = ad.beats;
  const endB = total - 4; // the last chord; it rings out
  const N = Math.ceil(total * beat * SR);
  const rand = prng(4242);
  const noise = () => rand() * 2 - 1;
  const L = new Float32Array(N);
  const R = new Float32Array(N);
  const send = new Float32Array(N);
  const track = () => new Float32Array(N);
  const voice = (buf, at, len, fn) => {
    const i0 = Math.round(at * SR);
    const n = Math.round(len * SR);
    for (let i = 0; i < n; i++) {
      const j = i0 + i;
      if (j >= 0 && j < N) buf[j] += fn(i / SR);
    }
  };
  const mixIn = (buf, gain, pan = 0, wet = 0) => {
    const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4) * 1.414;
    const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4) * 1.414;
    for (let i = 0; i < N; i++) {
      L[i] += buf[i] * gl;
      R[i] += buf[i] * gr;
      send[i] += buf[i] * gain * wet;
    }
  };
  // Fm9, Dbmaj7, Abmaj7, Eb add9: one chord per bar.
  const CH = [
    { bass: 87.31, notes: [174.61, 207.65, 261.63, 311.13, 392.0] },
    { bass: 69.3, notes: [138.59, 174.61, 207.65, 261.63, 349.23] },
    { bass: 103.83, notes: [207.65, 261.63, 311.13, 392.0] },
    { bass: 77.78, notes: [155.56, 196.0, 233.08, 349.23] },
  ];
  const chordAt = (b) => CH[Math.floor(b / 4) % 4];

  let keys = track();
  const hit = (b, g, decay = 1.8, len = 2.4) => {
    chordAt(b).notes.forEach((f, k) =>
      voice(keys, b * beat + k * 0.012, len, (tt) => g * Math.sin(TAU * f * tt + 1.3 * Math.exp(-tt * 9) * Math.sin(TAU * f * 2 * tt)) * Math.min(1, tt * 220) * Math.exp(-tt * decay)),
    );
  };
  for (let b = 0; b < endB; b += 4) {
    hit(b, 1);
    hit(b + 1.5, 0.55);
  }
  hit(endB, 1.15, 1.1, 3.4);
  keys = svf(keys, 3000, 0.8, "lp");

  const bass = track();
  const bassNote = (b, beats, g = 1) => {
    const f = chordAt(b).bass;
    const len = beats * beat;
    voice(bass, b * beat, len, (tt) => g * Math.tanh((Math.sin(TAU * f * tt) + 0.3 * Math.sin(TAU * 2 * f * tt)) * 1.4) * Math.min(1, tt * 120) * Math.min(1, (len - tt) * 25) * Math.exp(-tt * 0.9));
  };
  for (let b = 4; b < endB; b += 4) {
    bassNote(b, 1.4);
    bassNote(b + 2.5, 0.9, 0.85);
  }
  bassNote(endB, 4, 1);

  const kick = track();
  const kicks = [];
  const K = ad.audio.kickFrom ?? 6; // the beat where the drums come in
  for (let b = K; b <= endB; b++) kicks.push(b);
  kicks.forEach((b) =>
    voice(kick, b * beat, 0.4, (tt) => Math.tanh((Math.sin(TAU * (45 * tt + (90 / 30) * (1 - Math.exp(-tt * 30)))) * Math.exp(-tt * 8) + noise() * Math.exp(-tt * 500) * 0.1) * 1.5)),
  );
  const duck = new Float32Array(N).fill(1);
  kicks.forEach((b) => {
    const i0 = Math.round(b * beat * SR);
    for (let i = 0; i < 0.35 * SR && i0 + i < N; i++) duck[i0 + i] = Math.min(duck[i0 + i], 1 - 0.4 * Math.exp((-i / SR) * 10));
  });

  let rim = track();
  for (let b = K + 1; b < endB; b += 2) voice(rim, b * beat, 0.08, (tt) => (Math.sin(TAU * 1750 * tt) * 0.6 + noise() * 0.5) * Math.exp(-tt * 110));
  rim = svf(rim, 2200, 1.2, "bp");

  let hat = track();
  for (let b = 2; b < endB; b += 0.25) {
    const sixteenth = Math.round(b * 4) % 4;
    if (sixteenth !== 2 && b < K) continue; // shaker sixteenths join with the kick
    const late = sixteenth % 2 ? 0.022 : 0; // a little swing
    const g = sixteenth === 2 ? 1 : 0.38;
    voice(hat, b * beat + late, 0.1, (tt) => g * noise() * Math.exp(-tt * (sixteenth === 2 ? 70 : 140)));
  }
  hat = svf(hat, 8000, 0.8, "hp");

  const pluckL = track();
  const pluckR = track();
  let k = 0;
  for (let b = Math.ceil((K + 2) / 4) * 4; b < endB; b += 4) {
    for (const o of [0.5, 2, 3.5]) {
      const ns = chordAt(b).notes;
      const f = ns[(k * 2 + 1) % ns.length] * 2;
      voice(k % 2 ? pluckL : pluckR, (b + o) * beat, 0.9, (tt) => (Math.sin(TAU * f * tt) + 0.25 * Math.sin(TAU * 3 * f * tt) * Math.exp(-tt * 20)) * Math.min(1, tt * 400) * Math.exp(-tt * 6));
      k++;
    }
  }

  const fx = track();
  let whoosh = track();
  const whooshAt = [];
  const PING = [1046.5, 1244.5, 1568.0, 1864.7];
  const bell = (tt, f) => (Math.sin(TAU * f * tt) + 0.4 * Math.sin(TAU * f * 2 * tt) * Math.exp(-tt * 12)) * Math.min(1, tt * 900) * Math.exp(-tt * 5);
  for (const [b, kind, n = 0] of ad.audio.sfx) {
    const at = b * beat;
    if (kind === "ping") voice(fx, at, 1.2, (tt) => 0.16 * bell(tt, PING[n % 4]));
    if (kind === "chime") PING.forEach((f, i) => voice(fx, at + i * 0.045, 1.6, (tt) => 0.1 * bell(tt, f)));
    if (kind === "impact") voice(fx, at, 1.2, (tt) => 0.5 * Math.sin(TAU * (40 * tt + (40 / 7) * (1 - Math.exp(-tt * 7)))) * Math.exp(-tt * 3.2) + 0.05 * noise() * Math.exp(-tt * 9));
    if (kind === "tick") voice(fx, at, 0.06, (tt) => 0.09 * Math.sin(TAU * 2100 * tt) * Math.exp(-tt * 130));
    if (kind === "whoosh") {
      whooshAt.push(at);
      voice(whoosh, at - 0.6, 1.2, (tt) => noise() * Math.exp(-(((tt - 0.6) / 0.28) ** 2)));
    }
  }
  whoosh = svf(whoosh, (i) => {
    let near = 9;
    for (const w of whooshAt) if (Math.abs(i / SR - w) < Math.abs(near)) near = i / SR - w;
    return 500 + 2600 * Math.exp(-((near / 0.3) ** 2));
  }, 1.6, "bp");

  for (let i = 0; i < N; i++) {
    keys[i] *= duck[i];
    bass[i] *= duck[i];
  }
  mixIn(keys, 0.13, -0.1, 0.6);
  mixIn(bass, 0.34);
  mixIn(kick, 0.62);
  mixIn(rim, 0.5, 0.2, 0.35);
  mixIn(hat, 0.11, 0.3, 0.1);
  mixIn(pluckL, 0.1, -0.45, 0.9);
  mixIn(pluckR, 0.1, 0.45, 0.9);
  mixIn(fx, 1, 0, 0.8);
  mixIn(whoosh, 0.16, 0, 0.5);

  // Reverb: damped combs into two allpasses; the right channel uses slightly longer delays.
  const reverb = (offset) => {
    const out = new Float32Array(N);
    for (const d0 of [1557, 1617, 1491, 1422, 1277, 1356]) {
      const d = d0 + offset;
      const buf = new Float32Array(d);
      let idx = 0;
      let lp = 0;
      for (let i = 0; i < N; i++) {
        const y = buf[idx];
        lp = y * 0.65 + lp * 0.35;
        buf[idx] = send[i] + lp * 0.86;
        idx = (idx + 1) % d;
        out[i] += y / 6;
      }
    }
    for (const d of [225 + offset, 556 + offset]) {
      const buf = new Float32Array(d);
      let idx = 0;
      for (let i = 0; i < N; i++) {
        const y = buf[idx];
        buf[idx] = out[i] + y * 0.5;
        out[i] = y - out[i] * 0.5;
        idx = (idx + 1) % d;
      }
    }
    return out;
  };
  const wl = reverb(0);
  const wr = reverb(23);
  for (let i = 0; i < N; i++) {
    L[i] += wl[i] * 0.8;
    R[i] += wr[i] * 0.8;
  }
  return master(L, R, N, 1.6, 1.1);
}
function clamp01(x) {
  return Math.min(1, Math.max(0, x));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = path.join(here, "out");
  fs.mkdirSync(out, { recursive: true });
  for (const id of process.argv[2] ? [process.argv[2]] : Object.keys(ADS)) {
    const file = path.join(out, `${id}.wav`);
    fs.writeFileSync(file, ADS[id].audio.style === "smooth" ? synthSmooth(id) : synth(id));
    console.log(`${file}  ${((ADS[id].beats * 60) / (ADS[id].bpm ?? 150)).toFixed(1)} s`);
  }
}
