# YouTube film

A 30 s, 1920×1080 film with sound, made for merchants. Five 3D stages, filmed by one camera that whips between them:

| Time | Shows |
| --- | --- |
| 0–8 s | "Your customers hold Bitcoin." A river of Bitcoin coins flows through a ring and comes out as MUSD: "You get paid in MUSD. The Bitcoin-backed dollar." |
| 8–14 s | The checkout playing live on a 3D phone for Merchant's Store, with the four ways to pay in orbit: "They pay any way." It confirms and turns green: "You get the exact amount. In MUSD. The contract makes sure." |
| 14–20 s | Four lines the camera dives through: no wallet (passkey sign-up), no gas fees (we cover the network fee), no seed phrase, no price swings (paid in stable MUSD). |
| 20–25 s | Shopify, WooCommerce, payment links, QR codes, REST API and AI agents (x402) circle the Mezout mark: "Plugs into your store." then "AI agents can pay you too." |
| 25–30 s | "Mezout. Start getting paid." with the link, "Built on Mezo", passkey sign-up and the testnet note. |

How it is made: the lens has real depth of field (every frame averages 20 views through a wide aperture, which also gives the motion blur), the floor is a mirror, the type is extruded and flips in letter by letter, and the phone's screen replays the checkout scenes from `../ads/ads.js`. The brand marks come from `../ads/logos.js`.

The video is written to `video/youtube.mp4`, which git ignores.

## Edit and re-render

- `scene.js`: the copy (search for `makeText`), the stages, the timings and the camera path (`CAM`).
- `audio.mjs`: the soundtrack's tempo and cues; the synth itself is in `../ads/audio.mjs`.

In your Mac terminal, inside the `Mezout` folder (see `../billboard/README.md` for `RENDER_DEPS`):

```
node docs/motion/youtube/audio.mjs
RENDER_DEPS=<scratch folder>/node_modules node docs/motion/render3d.mjs youtube
```
