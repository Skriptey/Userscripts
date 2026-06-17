# Skriptey Userscripts — Wiki

Welcome to the documentation wiki for the
[Skriptey/Userscripts](https://github.com/Skriptey/Userscripts) collection.

Every script here is hand-written plain JavaScript — **the file in the repo is
exactly what you install**, with no bundling or minification, so you can read
every line first.

## Getting started

1. Install a userscript manager:
   [Tampermonkey](https://www.tampermonkey.net/) or
   [Violentmonkey](https://violentmonkey.github.io/).
2. Browse and install from the index:
   <https://skriptey.github.io/Userscripts/>

## Scripts

| Script                                   | What it does                                                                                                                                                                                                                                                                                  | Docs                                       |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| **[BunkrDL](BunkrDL)**                   | Bulk-download Bunkr albums & balbums.st listings into size-capped ZIPs, rate-limited.                                                                                                                                                                                                         | [BunkrDL](BunkrDL) · [FAQ](FAQ)            |
| **[ITAM Enhancer](ITAMenhancer)**        | Apple Music & Apple Music Classical: audio formats, barcodes (UPC) & per-track ISRCs (copy + MagicISRC), plus inline header buttons, a Harmony cross-service lookup, cover-art download, synced/word-by-word lyrics download, ISWC lookup (MusicBrainz seeding), and a classical Work column. | [ITAM Enhancer](ITAMenhancer) · [FAQ](FAQ) |
| **[MB ISWC Seeder](MB-ISWC-Seeder)**     | MusicBrainz-side companion to ITAM's _Find ISWCs_: surfaces the ISWC + writers on a seeded Work edit page (one-click copy) to speed up adding the work + writer relationships. You always submit.                                                                                             | [MB ISWC Seeder](MB-ISWC-Seeder)           |
| **[Tidal Enhancer](Tidal-Enhancer)**     | Tidal: audio quality (Lossless / Hi-Res / Atmos / 360), barcode (UPC) & per-track ISRCs (copy + MagicISRC), full credits, a Harmony cross-service lookup, and high-res cover-art download. No login needed.                                                                                   | [Tidal Enhancer](Tidal-Enhancer)           |
| **[Deezer Enhancer](Deezer-Enhancer)**   | Deezer: barcode (UPC) & per-track ISRCs (copy + MagicISRC), label/release info, contributors, a Harmony cross-service lookup, and high-res cover-art download. Public no-auth API.                                                                                                            | [Deezer Enhancer](Deezer-Enhancer)         |
| **[Discogs Enhancer](Discogs-Enhancer)** | Discogs: structured copy/export of barcode, cat#, label, format & full credits, plus a Harmony lookup and MagicISRC (when ISRCs are present). Public no-auth API.                                                                                                                             | [Discogs Enhancer](Discogs-Enhancer)       |
| **[Spotify Enhancer](Spotify-Enhancer)** | Spotify: barcode (UPC) & per-track ISRCs (copy + MagicISRC), credits, a Harmony cross-service lookup, and high-res cover-art download. Reuses the player's own token. _(Beta — needs in-browser testing.)_                                                                                    | [Spotify Enhancer](Spotify-Enhancer)       |
| **[Qobuz Enhancer](Qobuz-Enhancer)**     | Qobuz: exact audio quality (Hi-Res bit-depth / sample-rate), barcode (UPC) & per-track ISRCs (copy + MagicISRC), credits, a Harmony lookup, and high-res cover-art download. Reuses the logged-in session. _(Beta — subscriber-only, needs testing.)_                                         | [Qobuz Enhancer](Qobuz-Enhancer)           |

## Help

- Per-script usage and settings: see each script's page (e.g. **[BunkrDL](BunkrDL)**).
- Common questions: **[FAQ](FAQ)**.
- Bugs / requests: [open an issue](https://github.com/Skriptey/Userscripts/issues).
- Security reports: see [SECURITY.md](https://github.com/Skriptey/Userscripts/blob/main/SECURITY.md) (report privately).

All scripts are licensed **GPL-3.0-or-later**.
