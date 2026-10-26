# Motion graphics

Five looping animations that explain Mezout, in the site's own palette and Geist font.

| Scene | Length | Shows |
| --- | --- | --- |
| `01-pay-any-way` | 8 s | MUSD, BTC, MEZO and borrow-against-BTC all land as exactly 25.00 MUSD for the merchant |
| `02-borrow-dont-sell` | 10 s | A 150 MUSD borrow moves the loan from 198% to 184% and is paid; a 600 MUSD borrow would fall to 143% and is refused at the 160% floor |
| `03-passkey-merchant` | 9 s | Passkey sign-up creates a smart account; payouts arrive with no wallet, seed phrase or gas |
| `04-gasless` | 8 s | Customer signs, the relayer pays the gas, the router settles on Mezo, the merchant gets 25.00 MUSD |
| `05-plug-in` | 9 s | Payment links, QR, REST API and WooCommerce create invoices; a signed `invoice.paid` webhook marks the order paid; embedded checkout marked "Soon" |
| `06-receipt` | 13 s | Portrait, landing page hero: a receipt prints, a PAID stamp lands, and the payment method cycles while the merchant always receives 25.00 MUSD |
| `07-checkout` | 11 s | Portrait: the hosted checkout; the customer picks Pay with BTC, signs one message with no network fee and sees Payment complete |

Each scene comes in two versions: with a title and subtitle, and `-clean` with no captions, for laying your own text over it.

- `apps/web/public/motion/`: the versions the landing page uses: cropped to the content, transparent and without the watermark.
- `svg/`: vector, loops forever, 1200×675 (the portrait scenes keep their own size). Use in web pages (`<img src="…svg">`) or open in a browser. Figma and Keynote import SVGs as still images only.
- `video/*.mp4`: 1920×1080, 30 fps, one loop each. For demo videos, slides and social posts.
- `video/*.gif`: 960 px wide, captioned scenes only. For READMEs, Devfolio and chats.

## Edit and regenerate

All seven scenes are drawn by `generate.mjs`. Change the copy or timing there, then, in your Mac terminal, inside the `Mezout` folder:

```
node docs/motion/generate.mjs
```

That rewrites `svg/` and `apps/web/public/motion/`. The embedded Geist fonts come from `fonts/`, subset to the characters the scenes use; add a character outside that set and it falls back to a system font. The MP4s and GIFs are rendered from the SVGs frame by frame in headless Chrome and encoded with `ffmpeg`, so ask Claude to re-render them after a change.
