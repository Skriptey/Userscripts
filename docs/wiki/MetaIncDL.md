# MetaIncDL

**Download your own / authorised photos, videos, stories, reels & highlights**
from **Instagram, Facebook and Threads** in maximum original quality (images
never webp), optionally bundled into size-capped ZIPs.

> ⚠️ **Use responsibly — and mind your account.** Download only your own content
> or content you're authorised to keep. MetaIncDL runs on your **real, logged-in
> account** and reads only what your session can already see. Aggressive bulk
> grabbing can put a **checkpoint/challenge on your account**, so defaults are
> conservative and MetaIncDL **hard-stops** on any checkpoint.

> 🧪 **Beta — needs in-browser testing.** Meta's internal endpoints + token
> capture can only be validated in a real logged-in browser, and Meta's GraphQL
> `doc_id`s / field names rotate. Please report what works.

- **Install:** <https://skriptey.github.io/Userscripts/metaincdl/metaincdl.user.js>
- **Source & per-script README:** [`scripts/metaincdl/`](https://github.com/Skriptey/Userscripts/tree/main/scripts/metaincdl)

---

## Quick start

1. Install [Tampermonkey](https://www.tampermonkey.net/) (recommended) or
   [Violentmonkey](https://violentmonkey.github.io/), then MetaIncDL.
2. Log in to Instagram / Facebook / Threads and open a **profile**.
3. Click the floating **⬇ Download ▾** button (bottom-right) and choose a type.
   Approve the cross-origin prompt (**Always allow** the Meta CDN hosts) and
   watch the progress panel.

If MetaIncDL says **"interact with the page to arm"**, scroll the profile (or open
the tab) once so it can capture the query, then retry.

## What you can download

| From a profile      | What                                           |
| ------------------- | ---------------------------------------------- |
| **Timeline Photos** | image posts on the grid                        |
| **Timeline Videos** | video posts                                    |
| **Stories**         | currently-live stories _(authorisation-gated)_ |
| **Reels**           | the profile's reels / clips                    |
| **Highlights**      | saved highlight reels _(authorisation-gated)_  |
| **Download All**    | everything above                               |

Bulk runs auto-load the **whole infinite-scroll set** (paging the feed cursor —
no manual scrolling), de-duplicate, and throttle politely. On your own **home
feed** (Instagram) a **⬇ Download feed** button grabs up to your cap (default
**200**).

## Quality & format

- **Max original quality** — images from the API's native candidate list (not the
  downscaled DOM `<img>`); videos from the highest-bitrate progressive variant.
- **Never webp.** MetaIncDL tries the **native JPEG** variant first (rewriting the
  CDN `stp` `dst-webp→dst-jpg` token) and sniffs the magic bytes; only if it's
  still webp and no native variant exists does it transcode in-tab. The **webp
  fallback** setting picks **PNG** (default, lossless), **JPG** (EXIF carried
  across), or **keep** (original `.webp`).

## Settings

Manager menu (labels refresh on reopen). Every feature is an independent toggle:
the profile dropdown, the per-item overlay icon, each download type, the own-feed
grab + its item cap, the Stories/Highlights authorisation gate, **ZIP bundling** +
max size + compression, **Save via GM_download**, pre-flight confirmation, the
**webp fallback** mode, the pacing/throttle knobs (delay, jitter, CDN
concurrency, enumeration window cap), and reset-to-defaults.

## How it works

All three sites share Meta's Relay **GraphQL** substrate, so MetaIncDL is one script
with thin per-platform adapters. It **captures** the page's own session by
passively hooking `fetch`/`XHR` at `document-start` (reading `X-IG-App-ID`,
`X-CSRFToken`, `fb_dtsg`, `lsd`, and the rotating `doc_id` map — never mutating
requests) and **replays** Meta's own internal endpoints to enumerate + resolve
media, then downloads through the same engine as **[BunkrDL](BunkrDL)**.

See the per-script
[README](https://github.com/Skriptey/Userscripts/blob/main/scripts/metaincdl/README.md)
and the **[FAQ](FAQ)**.
