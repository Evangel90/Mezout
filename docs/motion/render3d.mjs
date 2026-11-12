// Renders a 3D spot (a folder here holding <name>.html and scene.js) to MP4, or serves it for a live preview.
// Run: RENDER_DEPS=<folder>/node_modules node docs/motion/render3d.mjs billboard            → billboard/video/billboard.mp4
//      RENDER_DEPS=<folder>/node_modules node docs/motion/render3d.mjs youtube --preview   → prints a URL to open
// RENDER_DEPS is a node_modules folder holding puppeteer-core and three (npm i puppeteer-core three in a scratch
// folder); neither is a dependency of this repo. Also needs ffmpeg and Google Chrome.
// If <name>/out/<name>.wav exists it becomes the soundtrack. STILL=<seconds,...> writes PNG stills to <name>/out/.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const deps = process.env.RENDER_DEPS;
if (!deps) throw new Error("Set RENDER_DEPS to a node_modules folder that holds puppeteer-core and three");
const name = process.argv[2];
if (!name || !fs.existsSync(path.join(here, name, `${name}.html`))) throw new Error("Usage: render3d.mjs <billboard|youtube> [--preview]");
const dir = path.join(here, name);
const FPS = 30;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".woff": "font/woff" };
const ROOTS = [
  ["/three/", path.join(deps, "three") + "/"],
  ["/fonts/", path.join(here, "../../apps/web/src/app/fonts") + "/"],
  ["/", here + "/"],
];
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  const [prefix, root] = ROOTS.find(([p]) => url.startsWith(p));
  const file = path.join(root, url.slice(prefix.length));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const base = `http://127.0.0.1:${server.address().port}/${name}/${name}.html`;

if (process.argv.includes("--preview")) {
  console.log(`Open ${base} in Chrome. Ctrl+C to stop.`);
} else {
  const puppeteer = createRequire(import.meta.url)(path.join(deps, "puppeteer-core"));
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    args: ["--hide-scrollbars", "--ignore-gpu-blocklist", "--enable-gpu", "--use-angle=metal"],
  });
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.error("page error:", e.message));
  page.on("console", (m) => m.type() === "error" && console.error("console:", m.text()));
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await page.goto(`${base}?render=1`);
  await page.waitForFunction(() => window.ready === true, { timeout: 60000 });
  const secs = await page.evaluate(() => window.DURATION);
  const stills = process.env.STILL?.split(",").map(Number);
  fs.mkdirSync(path.join(dir, "out"), { recursive: true });
  fs.mkdirSync(path.join(dir, "video"), { recursive: true });
  if (stills) {
    for (const t of stills) {
      await page.evaluate((t) => window.frame(t), t);
      await page.screenshot({ path: path.join(dir, "out", `still-${t.toFixed(2).padStart(5, "0")}.png`) });
    }
  } else {
    const frames = Math.round(secs * FPS);
    const file = path.join(dir, "video", `${name}.mp4`);
    const wav = path.join(dir, "out", `${name}.wav`);
    const sound = fs.existsSync(wav) ? ["-i", wav, "-c:a", "aac", "-b:a", "256k", "-shortest"] : [];
    const ff = spawn(
      "ffmpeg",
      [
        "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-", ...sound.slice(0, 2),
        "-c:v", "libx264", "-preset", "slow", "-crf", "14", "-pix_fmt", "yuv420p", "-profile:v", "high",
        "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", ...sound.slice(2), "-movflags", "+faststart", file,
      ],
      { stdio: ["pipe", "inherit", "inherit"] },
    );
    const done = new Promise((ok, fail) => ff.on("close", (code) => (code ? fail(new Error(`ffmpeg exited ${code}`)) : ok())));
    for (let f = 0; f < frames; f++) {
      await page.evaluate((t, fps) => window.frame(t, fps), f / FPS, FPS);
      const png = await page.screenshot({ type: "png", optimizeForSpeed: true });
      if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once("drain", r));
      if (f % 30 === 0) process.stdout.write(`\r${f}/${frames}`);
    }
    ff.stdin.end();
    await done;
    console.log(`\r${file}  ${frames} frames`);
  }
  await browser.close();
  server.close();
}
