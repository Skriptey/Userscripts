# Qobuz Enhancer

A **Qobuz sibling of [ITAM Enhancer](ITAMenhancer)**. On
[play.qobuz.com](https://play.qobuz.com) / [open.qobuz.com](https://open.qobuz.com) album
& track pages it surfaces the **exact audio quality** (Hi-Res **bit-depth / sample-rate**),
the **barcode (UPC)** and **per-track ISRCs** (copy + [MagicISRC](https://magicisrc.kepstin.ca/)),
**credits**, a **[Harmony](https://harmony.pulsewidth.org.uk/)** cross-service lookup, and
**high-res cover-art download**.

> ⚠️ **Draft — needs in-browser testing (subscriber-only).** Qobuz has no anonymous
> catalog (every call needs a logged-in subscriber), so this couldn't be verified
> headlessly. Test on a **logged-in** Qobuz session — especially the token capture.

- **Install:** <https://skriptey.github.io/Userscripts/qobuz/qobuz.user.js>
- **Source & README:** [`scripts/qobuz/`](https://github.com/Skriptey/Userscripts/tree/main/scripts/qobuz)

## Quick start

1. Install [Tampermonkey](https://www.tampermonkey.net/) or
   [Violentmonkey](https://violentmonkey.github.io/), then Qobuz Enhancer.
2. **Log in** to Qobuz, open any album/track — quality badges appear near the title and a
   floating **Qobuz ▾** button (bottom-right) opens the details panel.

## Features

- **Quality badges** — Hi-Res / Lossless + the real **bit-depth / sample-rate** (e.g.
  `24-bit / 192 kHz`); the most precise format data of the family.
- **Barcode (UPC)** + **per-track ISRCs**, label / genre / release / copyright, composer
  credits; copy one, all, or the whole record as JSON.
- **MagicISRC** + **Harmony** cross-links; **cover-art download** (high-res).

## Settings

Userscript-manager menu (live labels): **Show audio quality**, **Inline quality badges**,
**Show barcode (UPC) & ISRCs**, **Show credits**, **Download cover art button**,
**Integrate Harmony lookup**.

## Notes

Reuses the logged-in player's **`app_id` + `X-User-Auth-Token`** (captured by hooking the
player's own fetch/XHR). **Metadata only** — never computes `request_sig` / calls
`getFileUrl`. See the per-script
[README](https://github.com/Skriptey/Userscripts/blob/main/scripts/qobuz/README.md).
