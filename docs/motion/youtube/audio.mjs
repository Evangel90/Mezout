// The YouTube film's soundtrack: the calm synth from ads/audio.mjs at 120 BPM (one beat = 0.5 s), with cues on the
// film's moments. Run: node docs/motion/youtube/audio.mjs → docs/motion/youtube/out/youtube.wav
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { synthSmooth } from "../ads/audio.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
// Beats: 8 = the coins pass the ring, 16/28/40/50 = scene changes, 23 = paid, 28–37 = the four "No …" lines.
const film = {
  bpm: 120,
  beats: 60,
  audio: {
    kickFrom: 8,
    sfx: [
      [8, "impact"], [8, "chime"], [16, "whoosh"], [18, "tick"], [18.5, "tick"], [19, "tick"], [19.5, "tick"], [23.4, "chime"], [23.4, "impact"],
      [28, "whoosh"], [28.6, "ping", 0], [31.4, "ping", 1], [34.2, "ping", 2], [37, "ping", 3], [40, "whoosh"], [45.6, "ping", 2],
      [50, "whoosh"], [50.6, "impact"], [52, "chime"],
    ],
  },
};
fs.mkdirSync(path.join(here, "out"), { recursive: true });
fs.writeFileSync(path.join(here, "out", "youtube.wav"), synthSmooth(film));
console.log("youtube.wav  30.0 s");
