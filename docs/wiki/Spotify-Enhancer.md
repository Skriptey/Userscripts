# Spotify Enhancer

A **Spotify sibling of [ITAM Enhancer](ITAMenhancer)**. On
[open.spotify.com](https://open.spotify.com) album & track pages it surfaces the
**barcode (UPC)** and **per-track ISRCs** (copy + [MagicISRC](https://magicisrc.kepstin.ca/)),
**label / copyright info**, a **[Harmony](https://harmony.pulsewidth.org.uk/)**
cross-service lookup, and **cover-art download**.

> ⚠️ **Draft — needs in-browser testing.** Spotify's Web API is CORS-closed and
> login-gated, so this couldn't be verified headlessly (unlike Tidal/Deezer/Discogs).
> Test it on a **logged-in** Spotify session — especially the token capture — and
> report what works.

- **Install:** <https://skriptey.github.io/Userscripts/spotify-enhancer/spotify-enhancer.user.js>
- **Source & README:** [`scripts/spotify-enhancer/`](https://github.com/Skriptey/Userscripts/tree/main/scripts/spotify-enhancer)

## Quick start

1. Install [Tampermonkey](https://www.tampermonkey.net/) or
   [Violentmonkey](https://violentmonkey.github.io/), then Spotify Enhancer.
2. **Log in** to Spotify, open any album/track — a floating **Spotify ▾** button opens
   the panel, and **Barcode & ISRCs** / **Download cover art** / **Harmony ↗** appear in
   the header. (Login is required: the script reuses the web player's own token.)

## Features

- **Barcode (UPC)** + **per-track ISRCs** in a table; copy one, all, or the whole record
  as JSON.
- **Label, copyright, release date.**
- **MagicISRC** — resolves the MusicBrainz release by barcode, then opens MagicISRC.
- **Harmony lookup** — cross-service release lookup for the Spotify album + UPC.
- **Cover-art download** — up to 640px (Spotify's public-API ceiling).

## Settings

Userscript-manager menu (live labels): **Show barcode (UPC) & ISRCs**, **Download cover
art button**, **Integrate Harmony lookup**.

## Scope / roadmap

No quality badges (Spotify's API exposes no format data). **Songwriter credits** and
**Canvas** videos live on Spotify's internal endpoints (churn-prone, need the
client-token) — planned follow-ups. Token capture works by **hooking the player's own
fetch/XHR** to reuse its Bearer (never re-deriving Spotify's TOTP). See the per-script
[README](https://github.com/Skriptey/Userscripts/blob/main/scripts/spotify-enhancer/README.md).
