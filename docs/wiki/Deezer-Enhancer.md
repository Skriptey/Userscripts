# Deezer Enhancer

A **Deezer sibling of [ITAM Enhancer](ITAMenhancer)**. On
[deezer.com](https://www.deezer.com) album & track pages it surfaces the **barcode
(UPC)** and **per-track ISRCs** (copy + [MagicISRC](https://magicisrc.kepstin.ca/)),
**label / release info**, **contributors**, a
**[Harmony](https://harmony.pulsewidth.org.uk/)** cross-service lookup, and **high-res
cover-art download** — via Deezer's **public, no-auth API** (no login needed).

- **Install:** <https://skriptey.github.io/Userscripts/deezer/deezer.user.js>
- **Source & README:** [`scripts/deezer/`](https://github.com/Skriptey/Userscripts/tree/main/scripts/deezer)

## Quick start

1. Install [Tampermonkey](https://www.tampermonkey.net/) or
   [Violentmonkey](https://violentmonkey.github.io/), then Deezer Enhancer.
2. Open any Deezer **album** or **track** — a floating **Deezer ▾** button (bottom-right)
   opens the details panel, and **Barcode & ISRCs** / **Download cover art** /
   **Harmony ↗** buttons appear in the header.

## Features

- **Barcode (UPC)** + **per-track ISRCs** in a table; copy one, all, or the whole record
  as JSON.
- **Label, release date, genres, contributors.**
- **MagicISRC** — resolves the MusicBrainz release by barcode, then opens MagicISRC.
- **Harmony lookup** — cross-service release lookup for the Deezer album + UPC.
- **Cover-art download** — high-resolution JPEG.

## Settings

Userscript-manager menu (live labels): **Show barcode (UPC) & ISRCs**, **Show
contributors**, **Download cover art button**, **Integrate Harmony lookup**.

## Scope / roadmap

v1 uses Deezer's **public** catalog API (login-free). **Audio-quality / lossless badges**
and **synchronized / word-by-word lyrics** live on Deezer's **internal** endpoints (need
a session) and are planned follow-ups — Deezer is the family's only source of true
per-word lyric timing. See the per-script
[README](https://github.com/Skriptey/Userscripts/blob/main/scripts/deezer/README.md).
