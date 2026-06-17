# Qobuz Enhancer

A **Qobuz sibling of [ITAM Enhancer](../ITAMenhancer/)**. On
[play.qobuz.com](https://play.qobuz.com) / [open.qobuz.com](https://open.qobuz.com) album
and track pages it surfaces the **exact audio quality** (Hi-Res **bit-depth / sample-rate**),
the **barcode (UPC)** and **per-track ISRCs** — with one-click copy and a
[MagicISRC](https://magicisrc.kepstin.ca/) link — plus **credits**, label/genre info, a
**[Harmony](https://harmony.pulsewidth.org.uk/) cross-service lookup**, and
**high-resolution cover-art download**.

> ### ⚠️ Draft — needs in-browser testing (subscriber-only)
>
> Qobuz has **no anonymous catalog** — every API call needs a **logged-in subscriber's**
> session — so this couldn't be verified headlessly. It's written to the documented API
> and should be **tested/tuned on a logged-in Qobuz session**, especially the token
> capture. Please report what works.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) or
   [Violentmonkey](https://violentmonkey.github.io/).

   ➡️ **[Install Qobuz Enhancer](https://skriptey.github.io/Userscripts/qobuz/qobuz.user.js)**

2. **Log in** to your Qobuz subscription and open any album or track page.

## What it does

- **Quality badges** — **Hi-Res / Lossless** plus the real **bit-depth / sample-rate**
  (e.g. `24-bit / 192 kHz`), album-level and inline near the title. Qobuz exposes the most
  precise format data of the family.
- **Inline header buttons** — **Barcode & ISRCs**, **Download cover art**, **Harmony ↗**;
  a floating **Qobuz ▾** launcher is always available.
- **Barcode (UPC)** + **per-track ISRCs**; **label / genre / release / copyright**;
  **composer** credits.
- **One-click copy** — barcode, a single ISRC, all ISRCs, or the whole record as JSON.
- **MagicISRC** + **Harmony** cross-links; **cover-art download** (high-res).

## Settings

Userscript-manager menu (labels update live): **Show audio quality**, **Inline quality
badges**, **Show barcode (UPC) & ISRCs**, **Show credits**, **Download cover art button**,
**Integrate Harmony lookup**.

## How it works (for maintainers)

The Qobuz web player calls `www.qobuz.com/api.json/0.2/` with an **`app_id`** (query
param) and an **`X-User-Auth-Token`** header (from the logged-in session). The script
**reuses both** — captured at `document-start` by hooking the page's own `fetch`/`XHR` and
reading the `app_id` query param + `X-User-Auth-Token`/`X-App-Id` headers off the player's
requests. Calls go via `GM_xmlhttpRequest` (+ `@connect www.qobuz.com`). `album/get` and
`track/get` give `maximum_bit_depth`/`maximum_sampling_rate`/`hires` (quality), `upc`,
per-track `isrc`, `label`, `copyright`, `genre`, `image`, and `performer`/`composer`. The
only non-Qobuz call is the MusicBrainz barcode→MBID lookup for MagicISRC (on click).

> **Metadata only.** The script never computes Qobuz's `request_sig` or calls
> `getFileUrl` — it never touches streaming URLs.

## Security & permissions

- **Grants:** `unsafeWindow` (to read the **player's own** `app_id` + auth token off its
  outgoing requests — sent only back to Qobuz's API, never minted or exfiltrated),
  `GM_xmlhttpRequest` (Qobuz API / cover / MusicBrainz), `GM_addStyle`, `GM_setClipboard`,
  the menu/storage grants, `GM_notification`, `GM_info`.
- **`@connect`:** `www.qobuz.com`, `static.qobuz.com` (cover), `musicbrainz.org` (barcode
  lookup, on click).
- **No unsafe DOM / no data exfiltration:** all UI is built with `textContent`; no
  `@require`, no remote code; no hardcoded secrets.

## License

GPL-3.0-or-later — see the repository [LICENSE](../../LICENSE).
