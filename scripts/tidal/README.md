# Tidal Enhancer

The **Tidal sibling of [ITAM Enhancer](../ITAMenhancer/)**. On
[listen.tidal.com](https://listen.tidal.com) / [tidal.com](https://tidal.com) album
and track pages it surfaces what the player has but doesn't show: **audio quality**
(Lossless / Hi-Res / Dolby Atmos / 360), the **barcode (UPC)** and **per-track
ISRCs** — with one-click copy and a [MagicISRC](https://magicisrc.kepstin.ca/) link —
plus **full credits**, a **[Harmony](https://harmony.pulsewidth.org.uk/)
cross-service lookup**, and **high-resolution cover-art download**.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) or
   [Violentmonkey](https://violentmonkey.github.io/).

   ➡️ **[Install Tidal Enhancer](https://skriptey.github.io/Userscripts/tidal/tidal.user.js)**

2. Open any Tidal **album** or **track** page — no login needed (it reads public
   catalog data).

## What it does

- **Inline header buttons** — **Barcode & ISRCs** (opens the panel), **Download cover
  art**, and **Harmony ↗**, plus quality badges near the title. Each is independently
  toggleable; a floating **Tidal ▾** launcher is always available as a fallback.
- **Quality badges** — **Lossless / Hi-Res Lossless / Dolby Atmos / 360 Reality
  Audio**, from Tidal's `audioQuality` + `mediaMetadata.tags` + `audioModes` (album
  and per-track).
- **Barcode (UPC)** and **per-track ISRCs**, in a clean table.
- **Credits** — full per-role credits (producer / composer / engineers / performers …)
  from Tidal's credits endpoint.
- **One-click copy** — barcode, a single ISRC (click it), all ISRCs, or the whole
  record as JSON.
- **MagicISRC** — resolves the album's **MusicBrainz release** by its barcode, then
  opens MagicISRC pre-filled (only when you click).
- **Harmony lookup** — opens a Harmony release lookup for the Tidal album + its UPC.
- **Cover-art download** — saves the high-resolution cover as
  `<artist> - <album>_Cover.jpg`.

## Settings

Userscript-manager menu (toolbar icon, on a Tidal page); labels update live in current
Tampermonkey/Violentmonkey:

| Setting                    | Default | Notes                                               |
| -------------------------- | ------- | --------------------------------------------------- |
| Show audio quality         | on      | Quality badges (inline + panel).                    |
| Inline quality badges      | on      | Inject badges near the title.                       |
| Show barcode (UPC) & ISRCs | on      | Barcode + per-track ISRC section/button.            |
| Show credits               | on      | Full per-role credits in the panel.                 |
| Download cover art button  | on      | High-res cover-art download.                        |
| Integrate Harmony lookup   | on      | The **Harmony ↗** button (albums).                  |
| Country code               | `US`    | Tidal storefront for the catalog API (e.g. GB, DE). |

## How it works (for maintainers)

Verified live against `api.tidal.com` on 2026-06-17. The web player reads catalog data
from **`api.tidal.com/v1`**, which is **CORS-open** (`Access-Control-Allow-Origin: *`),
so the script calls it with a plain `fetch()` — no `GM_xmlhttpRequest`, no `@connect`. A
public, login-free **app token** (`X-Tidal-Token`) authorises catalog reads (quality,
UPC, ISRC, credits, cover). If Tidal rotates the token, update the `TOKEN` constant (or
capture the live player's bearer). Cover art comes from **`resources.tidal.com`** (also
CORS-open). The **only** cross-origin call is the MusicBrainz barcode→MBID lookup for
MagicISRC (`GM_xmlhttpRequest` + the required descriptive User-Agent → `@connect
musicbrainz.org`), made **only on an explicit click**.

## Security & permissions

- **Grants:** `GM_xmlhttpRequest` (the MusicBrainz lookup only), `GM_addStyle`,
  `GM_setClipboard`, `GM_registerMenuCommand`/`GM_unregisterMenuCommand`/`GM_getValue`/
  `GM_setValue` (settings), `GM_notification`, `GM_info`.
- **`@connect`:** only `musicbrainz.org` (barcode lookup; sends just the public
  barcode, no tokens). The Tidal API + cover art are read with a plain CORS `fetch()`.
- **No unsafe DOM / no data exfiltration:** all UI is built with `textContent` (no
  `innerHTML`); nothing is sent to any third party except the explicit MusicBrainz
  lookup. No `@require`, no remote code.

## License

GPL-3.0-or-later — see the repository [LICENSE](../../LICENSE).
