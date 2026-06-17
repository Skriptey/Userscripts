# Spotify Enhancer

A **Spotify sibling of [ITAM Enhancer](../ITAMenhancer/)**. On
[open.spotify.com](https://open.spotify.com) album and track pages it surfaces the
**barcode (UPC)** and **per-track ISRCs** — with one-click copy and a
[MagicISRC](https://magicisrc.kepstin.ca/) link — plus **label / copyright info**, a
**[Harmony](https://harmony.pulsewidth.org.uk/) cross-service lookup**, and
**cover-art download**.

> ### ⚠️ Draft — needs in-browser testing
>
> Unlike the Tidal/Deezer/Discogs enhancers (which read public, CORS-open APIs that
> could be verified directly), Spotify's Web API is **CORS-closed and login-gated**, so
> this script **could not be verified headlessly**. It's written to the documented
> behaviour and should be **tested/tuned on a logged-in Spotify session** — especially
> the token capture. Please report what works.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) or
   [Violentmonkey](https://violentmonkey.github.io/).

   ➡️ **[Install Spotify Enhancer](https://skriptey.github.io/Userscripts/spotify-enhancer/spotify-enhancer.user.js)**

2. **Log in** to Spotify and open any album or track page (the script reuses the web
   player's own token, so you must be logged in).

## What it does

- **Inline header buttons** — **Barcode & ISRCs** (opens the panel), **Download cover
  art**, and **Harmony ↗**; a floating **Spotify ▾** launcher is always available.
- **Barcode (UPC)** and **per-track ISRCs** in a clean table.
- **Label, copyright, release date.**
- **One-click copy** — barcode, a single ISRC, all ISRCs, or the whole record as JSON.
- **MagicISRC** — resolves the album's **MusicBrainz release** by its barcode, then
  opens MagicISRC (only when you click).
- **Harmony lookup** — opens a Harmony release lookup for the Spotify album + its UPC.
- **Cover-art download** — saves the cover (up to 640px on Spotify's public API) as
  `<artist> - <album>_Cover.jpg`.

## Settings

Userscript-manager menu (labels update live): **Show barcode (UPC) & ISRCs**, **Download
cover art button**, **Integrate Harmony lookup**.

## Scope / roadmap

Spotify's Web API exposes **no audio-format/quality data** (so there are no quality
badges), and **songwriter credits** + **Canvas** videos live only on Spotify's
**internal** endpoints (api-partner GraphQL / spclient) which churn and need the
`client-token` — planned follow-ups, off by default.

## How it works (for maintainers)

The Spotify Web API (`api.spotify.com`) needs a **Bearer token** and is **CORS-closed**,
so the script calls it via `GM_xmlhttpRequest` (+ `@connect api.spotify.com`). Spotify's
token endpoint is **TOTP-gated** (a moving target we deliberately do **not** re-derive);
instead, at `document-start` we hook the page's own `fetch()`/`XMLHttpRequest` and
**sniff the player's `authorization: Bearer …` header** off its outgoing requests (the
most churn-resistant capture). The token is kept in memory and re-captured continuously.
`GET /v1/albums/<id>` gives UPC / label / copyrights / images / simplified tracks;
`GET /v1/tracks?ids=<batch>` adds per-track ISRC. Cover art is on `i.scdn.co`. The only
non-Spotify call is the MusicBrainz barcode→MBID lookup for MagicISRC (on click).

## Security & permissions

- **Grants:** `unsafeWindow` (to hook the **page's own** fetch/XHR and read the Bearer
  it already sends — Spotify's own token, never minted or exfiltrated by us),
  `GM_xmlhttpRequest` (Spotify API / cover / the MusicBrainz lookup), `GM_addStyle`,
  `GM_setClipboard`, the menu/storage grants, `GM_notification`, `GM_info`.
- **`@connect`:** `api.spotify.com`, `i.scdn.co` (cover), `musicbrainz.org` (barcode
  lookup, on click). The captured token is sent **only** to Spotify's own API.
- **No unsafe DOM / no data exfiltration:** all UI is built with `textContent`; no
  `@require`, no remote code.

## License

GPL-3.0-or-later — see the repository [LICENSE](../../LICENSE).
