# Social ads

Three vertical ads (1080×1920, 30 fps, with sound) for Instagram Reels and TikTok, cut to a 150 BPM track, and one square ad (1080×1080) for X with a calmer look and a 100 BPM track.

| Ad | Length | Shows |
| --- | --- | --- |
| `pay-any-way` | 16 s | Customers pay in Bitcoin, the merchant gets MUSD; the checkout, a paid 25.00 MUSD, no wallet / gas / seed phrase / price swings, where it plugs in |
| `borrow-dont-sell` | 11.2 s | Borrow MUSD against BTC at checkout; a 150 MUSD borrow is paid at 184%, a 600 MUSD borrow is refused at the 160% floor |
| `ai-agents` | 11.2 s | An agent hits a 402, pays 0.05 MUSD under its cap and gets a 200; x402, the agents it runs in, pricing an API route |
| `x-settle-in-musd` | 21.6 s | For X: "Accept Bitcoin. Settle in MUSD.", the four payment methods flowing through the router to one exact payout, what is built in, the integrations |

The finished videos are written to `video/`, which git ignores; render them to get them back.

## Edit and re-render

- `ads.js`: the scenes, copy, timings and sound cues of each ad.
- `lib.js`: the drawing helpers (type, coins, pills, transitions, motion blur).
- `logos.js`: the Shopify, WooCommerce, Claude, Cursor and Mezo marks, with where each came from.
- `audio.mjs`: the soundtrack, synthesized from scratch (no samples, nothing to license).

Open `ad.html` in Chrome to play an ad live; add `?ad=borrow-dont-sell` to pick one, and click the video for sound.

To render, in your Mac terminal, inside the `Mezout` folder:

```
node docs/motion/ads/audio.mjs
node docs/motion/ads/render.mjs
```

Rendering needs `ffmpeg`, Google Chrome and `puppeteer-core`, which is not a dependency of this repo. Install it in any scratch folder (`npm i puppeteer-core`) and set `PUPPETEER_CORE` to that folder's `node_modules/puppeteer-core`. Add an ad's name to either command to do just that one.
