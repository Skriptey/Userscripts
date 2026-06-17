# Deezer Enhancer

A **Deezer sibling of [ITAM Enhancer](../ITAMenhancer/)**. On
[deezer.com](https://www.deezer.com) album and track pages it surfaces the **barcode
(UPC)** and **per-track ISRCs** — with one-click copy and a
[MagicISRC](https://magicisrc.kepstin.ca/) link — plus **label / release info**,
**contributors**, a **[Harmony](https://harmony.pulsewidth.org.uk/) cross-service
lookup**, and **high-resolution cover-art download**. Uses Deezer's **public, no-auth
API** — no login required.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) or
   [Violentmonkey](https://violentmonkey.github.io/).

   ➡️ **[Install Deezer Enhancer](https://skriptey.github.io/Userscripts/deezer/deezer.user.js)**

2. Open any Deezer **album** or **track** page.

## What it does

- **Inline header buttons** — **Barcode & ISRCs** (opens the panel), **Download cover
  art**, and **Harmony ↗**. Each is independently toggleable; a floating **Deezer ▾**
  launcher is always available.
- **Barcode (UPC)** and **per-track ISRCs** in a clean table (every ISRC arrives in one
  API call).
- **Label, release date, genres**, and **contributors**.
- **One-click copy** — barcode, a single ISRC, all ISRCs, or the whole record as JSON.
- **MagicISRC** — resolves the album's **MusicBrainz release** by its barcode, then
  opens MagicISRC pre-filled (only when you click).
- **Harmony lookup** — opens a Harmony release lookup for the Deezer album + its UPC.
- **Cover-art download** — saves the high-resolution cover as
  `<artist> - <album>_Cover.jpg`.

## Settings

Userscript-manager menu (labels update live): **Show barcode (UPC) & ISRCs**, **Show
contributors**, **Download cover art button**, **Integrate Harmony lookup**.

## Scope / roadmap

This v1 uses only Deezer's **public catalog API**, which is robust and login-free but
does **not** expose two things that live on Deezer's **internal** endpoints (which need
a logged-in session) — planned follow-ups:

- **Audio-quality / lossless badges** (gw-light `FILESIZE_FLAC`).
- **Synchronized / word-by-word lyrics** (`pipe.deezer.com` GraphQL — Deezer is the one
  service in the family with true per-word timing).

The public `contributors` are mainly performers, not full songwriter credits (those are
also internal).

## How it works (for maintainers)

Verified live against `api.deezer.com` on 2026-06-17. The **public** REST API is
**CORS-open for the deezer.com origin** (`Access-Control-Allow-Origin:
https://www.deezer.com`), so the script reads it with a plain `fetch()` — no token, no
`@connect`. `GET /album/<id>` gives UPC / label / dates / genres / `cover_xl` /
contributors; `GET /album/<id>/tracks` carries each track's `isrc` directly (all ISRCs
in one call). Cover art is on `cdn-images.dzcdn.net` (CORS-open). The **only**
cross-origin call is the MusicBrainz barcode→MBID lookup for MagicISRC
(`GM_xmlhttpRequest` + descriptive User-Agent → `@connect musicbrainz.org`, on click).

## Security & permissions

- **Grants:** `GM_xmlhttpRequest` (the MusicBrainz lookup only), `GM_addStyle`,
  `GM_setClipboard`, the menu/storage grants, `GM_notification`, `GM_info`.
- **`@connect`:** only `musicbrainz.org` (sends just the public barcode, no tokens).
- **No unsafe DOM / no data exfiltration:** all UI is built with `textContent`; no
  `@require`, no remote code; nothing sent to third parties except the explicit
  MusicBrainz lookup.

## License

GPL-3.0-or-later — see the repository [LICENSE](../../LICENSE).
