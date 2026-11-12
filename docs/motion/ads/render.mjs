// Renders the ads to MP4: every frame is drawn by ad.html in headless Chrome and piped to ffmpeg with the soundtrack.
// Run: node docs/motion/ads/audio.mjs && node docs/motion/ads/render.mjs [ad-id]
// Needs ffmpeg, Google Chrome and puppeteer-core. puppeteer-core is not a repo dependency: install it anywhere
// (npm i puppeteer-core in a scratch folder) and point PUPPETEER_CORE at that folder's node_modules/puppeteer-core.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const puppeteer = require(process.env.PUPPETEER_CORE || "puppeteer-core");
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const FPS = 30;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--allow-file-access-from-files", "--hide-scrollbars"] });
const page = await browser.newPage();
await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
await page.goto(`${pathToFileURL(path.join(here, "ad.html"))}?render=1`);
if (!(await page.evaluate(() => window.ready))) throw new Error("Geist did not load");
const ads = await page.evaluate(() => Object.fromEntries(Object.entries(ADS).map(([k, v]) => [k, { secs: (v.beats * 60) / (v.bpm ?? 150), w: v.w ?? 1080, h: v.h ?? 1920 }])));

fs.mkdirSync(path.join(here, "video"), { recursive: true });
// STILL=<seconds,...> writes PNG stills to out/ instead of a video, for checking a scene.
const stills = process.env.STILL?.split(",").map(Number);

for (const id of process.argv[2] ? [process.argv[2]] : Object.keys(ads)) {
  await page.setViewport({ width: ads[id].w, height: ads[id].h, deviceScaleFactor: 1 });
  if (stills) {
    for (const t of stills) {
      await page.evaluate((id, t) => window.frame(id, t), id, t);
      await page.screenshot({ path: path.join(here, "out", `${id}-${t.toFixed(2)}.png`) });
    }
    continue;
  }
  const frames = Math.round(ads[id].secs * FPS);
  const file = path.join(here, "video", `${id}.mp4`);
  const wav = path.join(here, "out", `${id}.wav`);
  const ff = spawn(
    "ffmpeg",
    [
      "-y", "-loglevel", "error",
      "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-",
      "-i", wav,
      "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-profile:v", "high",
      "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
      "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart", "-shortest", file,
    ],
    { stdio: ["pipe", "inherit", "inherit"] },
  );
  const done = new Promise((ok, fail) => ff.on("close", (code) => (code ? fail(new Error(`ffmpeg exited ${code}`)) : ok())));
  for (let f = 0; f < frames; f++) {
    await page.evaluate((id, t, fps) => window.frame(id, t, fps), id, f / FPS, FPS);
    const png = await page.screenshot({ type: "png", optimizeForSpeed: true });
    if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once("drain", r));
    if (f % 60 === 0) process.stdout.write(`\r${id}  ${f}/${frames}`);
  }
  ff.stdin.end();
  await done;
  console.log(`\r${file}  ${frames} frames`);
}
await browser.close();
