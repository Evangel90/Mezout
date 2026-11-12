# Billboard spot

A 15 s, silent, 1920×1080 loop for digital billboards, built as a real 3D scene with three.js and filmed in one continuous camera move:

1. "They pay in Bitcoin." beside a metal Bitcoin coin, with a swarm of small coins behind it.
2. The coin turns over to its MUSD face as the camera trucks past; the swarm turns green. "You get MUSD."
3. The coin spins away and a paid 25.00 MUSD receipt card spins in. "No wallet. No gas."
4. The card spins down into the Mezout mark. "Mezout" and the link hold for two seconds.

The type is extruded and flips in letter by letter; the scene has lit metal, shadows, bloom and motion blur.

The video is written to `video/billboard.mp4`, which git ignores.

## Edit and re-render

`scene.js` holds everything: the copy (search for `makeText`), the timings (`FLIP`, `SWAP`, `LOCK`) and the camera path (`CAM`).

Rendering needs `ffmpeg`, Google Chrome, and two packages that are not dependencies of this repo. Install them in any scratch folder (`npm i puppeteer-core three`), then, in your Mac terminal, inside the `Mezout` folder:

```
RENDER_DEPS=<scratch folder>/node_modules node docs/motion/render3d.mjs billboard
```

Add `--preview` to get a link that plays the scene live in Chrome instead.
