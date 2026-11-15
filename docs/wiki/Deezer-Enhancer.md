# Deezer Enhancer

A **Deezer sibling of [ITAM Enhancer](ITAMenhancer)**. On
[deezer.com](https://www.deezer.com) album & track pages it surfaces the **barcode
(UPC)** and **per-track ISRCs** (copy + [MagicISRC](https://magicisrc.kepstin.ca/)),
**label / release info**, **contributors**, a
**[Harmony](https://harmony.pulsewidth.org.uk/)** cross-service lookup, and **high-res
cover-art download** — via Deezer's **public, no-auth API** (no login needed). Two extras
are **off by default**: a **lyrics download** and an **internal-data layer** (lossless
badges and full credits).

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
- **Harmony lookup** — cross-service release lookup for the Deezer album + UPC. As of
  v1.0.2 the UPC is normalised to a bare digit string before the Harmony/MusicBrainz
  handoff (defensive hardening shared with the other Harmony-linked scripts).
- **Cover-art download** — high-resolution JPEG.
- **Download Lyrics** _(off by default)_ — **Word-by-Word**, **Line-by-Line** or **Static**.
  Each song falls back to the best version it has. Albums come as a ZIP; word-by-word
  files keep every word's timing (`[00:12.34]<00:12.34>Hello <00:12.80>world`). You need to
  be logged in to Deezer (or switch on the unofficial anonymous option). Lyrics are
  licensed — personal use only.
- **Internal-data layer** _(off by default)_ — **Lossless / MP3 / 360 Reality Audio
  badges**, a per-track **Quality** column, **full credits** (songwriters, producers…),
  and the lyrics button hides itself when Deezer says there are no lyrics. It uses your own
  session, only reads, and falls back to the public data if it fails.

## Settings

Userscript-manager menu (live labels). Every feature has its own switch:

- **Show barcode (UPC) & ISRCs**, **Show contributors**, **Download cover art button**,
  **Integrate Harmony lookup** — on by default.
- **Download Lyrics button** — **off** by default.
- **Lyrics when logged out (anonymous token, unofficial)** — **off** by default. Turning it
  on shows a warning: it is not official, may stop working, and is not supported.
- **Word-by-Word also saves raw .json** — **off** by default; keeps Deezer's untouched
  word-timing data next to each word-by-word `.lrc`.
- **Deezer internal data (gw-light, needs login)** — **off** by default (the master switch).
- **Lossless / quality badges** and **Full credits (songwriters, producers)** — on, but they
  only do something once the internal-data switch is on.

## Notes

- Lyrics and tokens are never saved, logged or included in "Copy as JSON"; the login token
  lives in memory for a few minutes and is only sent to Deezer's lyrics server.
- If every size reads 0 (logged out or free account) the panel shows a muted "log in to see
  quality" badge instead of a wrong "MP3 only".
- Still not done: inline quality badges by the title; header tags in the `.lrc` files.
  See the per-script
  [README](https://github.com/Skriptey/Userscripts/blob/main/scripts/deezer/README.md).
