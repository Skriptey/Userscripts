# MetaIncDL — Instagram / Facebook / Threads downloader

Adds **download controls** to Instagram, Facebook and Threads. On a profile you
get a **⬇ Download ▾** dropdown (Timeline Photos / Videos / Stories / Reels /
Highlights / Download All); media is fetched in **maximum original quality**,
images are saved as **jpg/png/native — never webp**, and output can optionally
be bundled into **size-capped ZIPs** (the BunkrDL model).

> ### ⚠️ Use responsibly — and mind your account
>
> Download only **your own** content, or content you are **authorised** to keep.
> MetaIncDL runs on **your real, logged-in account** and only ever reads what your
> session can already see (it bypasses no access control). Aggressive bulk
> grabbing can trip Meta's anti-automation and put a **checkpoint/challenge on
> your account**, so the defaults are deliberately conservative and MetaIncDL
> **hard-stops** the moment it sees a checkpoint. Stories/Highlights are gated
> behind an "I'm authorised" confirmation.

> ### 🧪 Beta — needs in-browser testing
>
> Meta's internal endpoints and the token capture can only be validated in a
> real logged-in browser, and Meta's GraphQL `doc_id`s / field names rotate.
> Treat early runs as testing and please report what works.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) (recommended) or
   [Violentmonkey](https://violentmonkey.github.io/).

   ➡️ **[Install MetaIncDL](https://skriptey.github.io/Userscripts/metaincdl/metaincdl.user.js)**

2. Log in to Instagram, Facebook or Threads and open a profile. Approve the
   cross-origin request prompt (choose **Always allow** for the Meta CDN hosts).

## What it does

### On a profile

A floating **⬇ Download ▾** button opens a dropdown:

- **Timeline Photos** — image posts on the profile grid
- **Timeline Videos** — video posts
- **Stories** — currently-live stories _(authorisation-gated)_
- **Reels** — the profile's reels/clips
- **Highlights** — saved highlight reels _(authorisation-gated)_
- **Download All** — everything above

Bulk runs **auto-load the whole infinite-scroll set** by paging the underlying
feed (no manual scrolling), de-duplicate, and throttle politely.

### On a post / reel / story / highlight (Instagram)

The on-page download UI is reserved for **another member's content**:

- on a **post or reel permalink** (`/p/…`, `/reel/…`), a floating
  **⬇ Download this post** button;
- in a **story or highlight viewer** (`/stories/…`), a floating **⬇ Download
  story** / **⬇ Download highlight** button _(authorisation-gated)_.

### Your own home feed (Instagram) — from the menu

The home-feed grab is **not** an on-page button (it would clutter your own feed
and sit over Instagram's Messages widget). Instead, run **⬇ Download my home
feed now (≤cap)** from the userscript-manager menu — it grabs up to your
configured cap (default **200**); the feed is effectively infinite, so the cap
(and a hard-stop on any checkpoint) is mandatory. Toggle it with **Own feed /
FYP bulk download**.

### Quality & format

- **Maximum original quality** — images come from the API's native candidate
  list (not the page's downscaled `<img>`), videos from the highest-bitrate
  progressive variant.
- **Never webp.** MetaIncDL prefers the native JPEG variant (it rewrites the CDN
  `stp` `dst-webp→dst-jpg` token), sniffs the magic bytes after download, and
  only if the bytes are still webp **and** no native variant is reachable does it
  transcode in-tab (`createImageBitmap` → `OffscreenCanvas`). The
  **webp fallback** setting chooses **PNG** (default, lossless — EXIF carried
  across in a PNG `eXIf` chunk), **JPG** (EXIF carried across in APP1), or
  **keep** (save the original `.webp` byte-for-byte). Meta usually strips
  original camera EXIF on upload, so there is often only a colour profile to
  retain — whatever is present is preserved.

### ZIP bundling

Off by default (each file saved individually). Turn it on to bundle into
**`<name>_1.zip`, `<name>_2.zip`, …** capped at **Max ZIP size**. With ZIP off,
fetching and saving are decoupled so a slow save dialog never stalls the queue.

## Settings (all in the manager menu, labels refresh on reopen)

Every feature is an **independent toggle**, persisted via GM storage:

| Setting                                 | Default        | What it does                                                                         |
| --------------------------------------- | -------------- | ------------------------------------------------------------------------------------ |
| Profile Download dropdown               | on             | The **⬇ Download ▾** control on a profile.                                           |
| Per-item overlay icon                   | on             | Floating **⬇ Download** button on a post/reel permalink or a story/highlight viewer. |
| Timeline Photos / Videos                | on             | Include images / videos in profile bulk runs.                                        |
| Stories / Reels / Highlights            | on             | Each download type, independently.                                                   |
| Own feed / FYP bulk download            | on             | The home-feed grab.                                                                  |
| Feed / FYP item cap                     | 200            | Hard cap on the infinite feed.                                                       |
| Authorisation gate (Stories/Highlights) | on             | One-time "I'm authorised" confirmation.                                              |
| ZIP bundling                            | off            | Bundle into size-capped ZIPs vs. individual files.                                   |
| Max ZIP size                            | 1024 MiB       | Target cap per ZIP.                                                                  |
| Compression                             | STORE          | `STORE` (no recompress) or `DEFLATE`.                                                |
| Save via GM_download                    | off            | Manager saves with no per-file dialog.                                               |
| Pre-flight confirmation                 | on             | Confirm count before a bulk job starts.                                              |
| webp fallback                           | png            | `png` / `jpg` / `keep` (native JPEG is always tried first).                          |
| Delay between pages / jitter            | 2500 / 1500 ms | Polite pacing between enumeration requests.                                          |
| CDN download concurrency                | 3              | Parallel byte downloads (not GraphQL-throttled).                                     |
| Enumeration window cap (/11 min)        | 18             | Max enumeration requests per rolling 11 minutes.                                     |
| Reset MetaIncDL settings to defaults    | —              | Restore all settings.                                                                |

## How it works (for maintainers)

All three sites are the same **Meta/Relay GraphQL** substrate, so MetaIncDL is one
script with thin per-platform adapters.

- **Capture, don't mint.** At `@run-at document-start` (before the app boots)
  MetaIncDL installs **passive** wrappers on the page's own `window.fetch` and
  `XMLHttpRequest` (via `unsafeWindow`; on Firefox through `exportFunction`). It
  **reads** the auth the page already sends — `X-IG-App-ID`, `X-CSRFToken`,
  `X-IG-WWW-Claim`, `X-ASBD-ID`, `fb_dtsg`, `lsd` — and the rotating GraphQL
  `doc_id` ↔ friendly-name map, **never mutating** a request and always calling
  through.
- **Replay.** MetaIncDL then calls Meta's **own internal endpoints** (e.g. IG
  `/api/v1/feed/user/<id>/`, `/api/v1/feed/reels_media/`, `/api/v1/clips/user/`;
  GraphQL replays for Threads/FB) same-origin with the session cookies, paging on
  the feed cursor. Nothing that rotates is hardcoded; if a needed query hasn't
  fired yet on a cold route, MetaIncDL asks you to interact with the page to "arm"
  it.
- **Resolve + download.** A generic media walker picks the max-quality
  image/video URL from the JSON (`image_versions2.candidates` / `video_versions`,
  recursing carousels), normalises webp→native, then downloads via
  `GM_xmlhttpRequest` through the same worker-pool / save-queue / JSZip engine
  used by BunkrDL.

## Security & permissions

- **Grants:** `unsafeWindow` (to wrap the **page's own** fetch/XHR — a
  sandbox-only patch silently never fires, especially on Firefox),
  `GM_xmlhttpRequest` (+ the Meta `@connect` hosts) to fetch media bytes,
  `GM_download`, `GM_addStyle`, `GM_notification`, and the menu/storage grants.
- **`@connect`:** `instagram.com`, `cdninstagram.com`, `facebook.com`,
  `fbcdn.net`, `threads.com`, `threads.net` — Meta origins only.
- **`@require`:** the **pinned** JSZip `3.10.1` cdnjs URL (same as BunkrDL).
- **No exfiltration, no unsafe DOM.** Captured tokens are only ever replayed to
  Meta's own endpoints, never logged or sent elsewhere; all injected UI is built
  with `createElement`/`textContent` (no `innerHTML` with page data).

## Troubleshooting

- **"Interact with the page to arm MetaIncDL."** A needed query hasn't fired yet —
  scroll the profile/open the tab once, then retry.
- **A checkpoint/challenge appeared.** Stop, open the site normally and clear it
  before trying again, and raise the delays / lower the cap.
- **Only some media downloaded.** Meta's CDN URLs are signed and expire — large
  grabs that sit too long can 403; just re-run the grab (already-saved files are
  re-downloaded — there's no resume yet).

## License

GPL-3.0-or-later — see the repository [LICENSE](../../LICENSE).
