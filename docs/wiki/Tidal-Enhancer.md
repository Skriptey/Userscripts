# Tidal Enhancer

The **Tidal sibling of [ITAM Enhancer](ITAMenhancer)**. On
[listen.tidal.com](https://listen.tidal.com) / [tidal.com](https://tidal.com) album &
track pages it surfaces **audio quality** (Lossless / Hi-Res / Dolby Atmos / 360), the
**barcode (UPC)** and **per-track ISRCs** (copy + [MagicISRC](https://magicisrc.kepstin.ca/)),
**full credits**, a **[Harmony](https://harmony.pulsewidth.org.uk/)** cross-service
lookup, and **high-res cover-art download**.

- **Install:** <https://skriptey.github.io/Userscripts/tidal/tidal.user.js>
- **Source & README:** [`scripts/tidal/`](https://github.com/Skriptey/Userscripts/tree/main/scripts/tidal)

## Quick start

1. Install [Tampermonkey](https://www.tampermonkey.net/) or
   [Violentmonkey](https://violentmonkey.github.io/), then Tidal Enhancer.
2. Open any Tidal **album** or **track** — quality badges appear near the title and a
   floating **Tidal ▾** button (bottom-right) opens the details panel. **No login
   needed** (it reads public catalog data).

## Features

- **Quality badges** — Lossless / Hi-Res Lossless / Dolby Atmos / 360 Reality Audio,
  album-level and per-track.
- **Barcode (UPC)** + **per-track ISRCs** in a table; copy one, all, or the whole
  record as JSON.
- **Credits** — full per-role credits (producer / composer / engineers / performers).
- **MagicISRC** — resolves the MusicBrainz release by barcode, then opens MagicISRC.
- **Harmony lookup** — cross-service release lookup for the Tidal album + UPC.
- **Cover-art download** — high-resolution JPEG.

## Settings

Userscript-manager menu (labels update live): **Show audio quality**, **Inline quality
badges**, **Show barcode (UPC) & ISRCs**, **Show credits**, **Download cover art
button**, **Integrate Harmony lookup**, and **Country code** (Tidal storefront for the
catalog API, default `US`).

## Notes

Reads Tidal's **CORS-open** `api.tidal.com/v1` with a public, login-free app token — no
account needed. The only third-party call is the MusicBrainz barcode lookup for
MagicISRC (on click). See the per-script
[README](https://github.com/Skriptey/Userscripts/blob/main/scripts/tidal/README.md).
