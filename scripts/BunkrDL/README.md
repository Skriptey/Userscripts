# BunkrDL — Bunkr bulk downloader

A userscript that adds **bulk-download controls to Bunkr albums and
[balbums.st](https://balbums.st) listings**. Pick a media type (or _All_) and it
resolves every file, downloads them in a **rate-limited** way, and bundles them
into **size-capped ZIP files** named after the album.

> ⚠️ **Use responsibly.** Only download content you have the right to keep, for
> personal/offline use. Respect creators, copyright, and each site's terms. The
> built-in rate limiting exists to be a good citizen — please don't remove it.

## Install

1. Install a userscript manager —
   [Tampermonkey](https://www.tampermonkey.net/) (recommended; best
   `GM_xmlhttpRequest` support) or
   [Violentmonkey](https://violentmonkey.github.io/).

   ➡️ **[Install BunkrDL](https://skriptey.github.io/Userscripts/BunkrDL/BunkrDL.user.js)**

2. Your manager will show the requested permissions (cross-origin requests to
   Bunkr/balbums hosts and the JSZip library). Review and accept to install.

The first time it makes a cross-origin request your manager may ask you to allow
it — choose **Always allow** for the Bunkr domains to avoid repeated prompts.

## What it does

### On a Bunkr album page — `https://<any-bunkr-domain>/a/<id>`

A **“⬇ Bulk Download ▾”** button appears next to the page's **Advanced Filters**
control (or, if that control isn't found, as a floating button in the
bottom-right). It opens a dropdown:

| Option            | Downloads                                           |
| ----------------- | --------------------------------------------------- |
| Download Images   | `jpg jpeg png gif webp avif bmp tif heic svg ico …` |
| Download Videos   | `mp4 mkv webm mov avi m4v ts mpg wmv flv 3gp …`     |
| Download Audio    | `mp3 m4a flac wav ogg opus aac wma aiff …`          |
| Download Archives | `zip rar 7z tar gz bz2 xz zst cbz cbr iso …`        |
| Download All      | Everything in the album                             |

Each **file card in the grid** also gets a **“⬇ Download”** button that fetches
just that one file (saved directly, no ZIP).

### On balbums.st listing pages

On the search results, `/live`, `/topalbums`, `/topvideos`, `/topfiles`, and
`/topimages` pages, a small **“⬇ Download ▾”** button is added under each album
card. Picking a type fetches that album from Bunkr and runs the same flow.
Buttons are also added to cards that load later via infinite scroll.

### On a single Bunkr file page

On an individual file page (`/f/`, `/v/`, `/i/`, `/d/`) a floating
**“⬇ BunkrDL — Download”** button fetches just that one file and saves it
directly (no ZIP).

A **progress panel** (bottom-right) shows overall progress, the current file,
per-file/zip progress bars, a log, and a **Cancel** button. Before a large job it
shows a **confirmation** with the file count, total size, and number of ZIPs.

## Output / ZIP naming

Files are bundled into ZIPs named **`<AlbumName>_1.zip`, `<AlbumName>_2.zip`, …**
The album name comes from the page's title (e.g. the example album
`bunkr.cr/a/1s5ek7Sm` → `TravelVids.xyz_1.zip`). Each ZIP is filled up to the
**Max ZIP size** and then handed to the browser as a normal download.

If a **single file is larger than the Max ZIP size**, BunkrDL follows your
_Oversize file handling_ setting:

- **ask** (default) — prompts you to put it in its own (larger) ZIP, or skip it.
- **extend** — silently puts it in its own oversized ZIP.
- **skip** — skips it and logs the skip.

You can also switch off ZIP bundling entirely (see settings) to save each file
individually — useful for very large albums or low-memory machines.

**Filenames are decoded for readability.** Bunkr encodes spaces as `+` (and
sometimes `%20`/`%xx`); BunkrDL turns these back into real characters, so
`My+File%20(1).mp4` is saved as `My File (1).mp4`.

**Resume & integrity.** Completed files are remembered per album, so if the tab
closes (or some files fail) mid-album, re-running the same album downloads only
what's missing and continues the ZIP numbering. Each download is checked against
the manifest's expected size and retried if it came up short. (Use **Clear resume
data** in the menu to forget all saved progress.)

## Settings

Open your userscript manager's menu (click the manager's toolbar icon while on a
supported page) and use the **BunkrDL** commands. Settings persist via the
manager's storage.

| Setting                   | Default    | Notes                                                                           |
| ------------------------- | ---------- | ------------------------------------------------------------------------------- |
| Max ZIP size              | `1024` MiB | Target cap per ZIP. Also bounds memory — see below.                             |
| Delay between files       | `1500` ms  | Base pause before each file (rate limiting).                                    |
| Delay jitter              | `750` ms   | Random `0..jitter` added to each pause.                                         |
| Max retries per file      | `4`        | Attempts before a file is counted as failed.                                    |
| Parallel downloads        | `1`        | Files fetched at once (1–8). Higher = faster, but more rate-limit/ban risk.     |
| Oversize file handling    | `ask`      | `ask` \| `extend` \| `skip` (see above).                                        |
| ZIP bundling              | `on`       | Off = save each file individually instead of zipping.                           |
| Compression               | `STORE`    | `STORE` (fast, no recompress — best for already-compressed media) or `DEFLATE`. |
| Pre-flight confirmation   | `on`       | Show a summary (count, size, # ZIPs) and confirm before a job starts.           |
| Verify file sizes         | `on`       | Re-download files whose bytes fall short of the manifest size.                  |
| Resume support            | `on`       | Remember completed files so an interrupted album resumes.                       |
| Save ZIPs via GM_download | `off`      | Let the manager save (no per-file dialog) — handy for many-ZIP albums.          |
| Clear resume data         | —          | Forget saved progress for all albums.                                           |
| Reset to defaults         | —          | Restores every setting above.                                                   |

> **Memory note:** ZIP building happens **in the browser tab**, so peak memory is
> roughly `2 × Max ZIP size` while a ZIP is generated, plus one in-flight file per
> parallel download. The 1 GiB default suits most machines; lower it (or
> _Parallel downloads_) on low-RAM devices, or turn ZIP bundling **off** to stream
> files straight to disk for very large albums.

## How it works (for maintainers)

Bunkr changes its anti-scraping often, so the moving parts are isolated and
commented in the script. The scheme below was **re-verified live on 2026-06-16**
against `bunkr.cr` (an 839 MiB file downloaded end-to-end, HTTP 200). It is now a
**four-step** flow — the old single-call `apidl.bunkr.ru` + XOR + `get.bunkrr.su`
Referer path is **dead** (`apidl` still answers but returns the legacy
`{encrypted,url}` form — don't use it):

1. **Enumerate the album.** The _complete_ manifest exists only on an album's
   **advanced view** (`?advanced=1`) as a JS array
   `window.albumFiles = [{ slug, original, name, size, extension, timestamp, … }, …]`.
   **The numeric `id` field is no longer present** — only `slug` is stable, so
   the numeric file id is read per file in step 2. The default album page renders
   only a paginated subset, so BunkrDL fetches the `?advanced=1` HTML in the
   background (`fetchAlbum` → `parseAlbumFiles`) — this _is_ the "Advanced View"
   step, done without navigating you away — and **sorts by size internally**
   (largest-first, which also improves ZIP packing), so the site's "Size" button
   isn't needed either.
2. **Read each file's id + resolver host.** For each file, BunkrDL fetches the
   file page `https://<albumHost>/f/<slug>` and reads its primary download
   button: `href="https://dl.bunkr.<tld>/file/<NUMERIC_ID>"` (with a matching
   `data-file-id`). It takes **both** the resolver host (e.g. `dl.bunkr.cr`)
   **and** the numeric id from that href — the host must _not_ be assumed to be
   `dl.<current-domain>` (e.g. `dl.bunkr.fi` doesn't resolve). See
   `resolveItemId` / `parseFilePage`.
3. **Resolve the media path.** BunkrDL `POST`s `{"id":"<id>"}` **as a string** (a
   numeric id returns HTTP 400), `Content-Type: application/json`, to that file's
   own resolver host: `https://<resolverHost>/api/_001_v2`. The response is now
   **unencrypted** — no XOR, no `SECRET_KEY`, no base64:
   `{ mediafiles:"https://<sub>.cdn.cr", original:"<name>", path:"/storage/media/<uuid>.<ext>" }`.
   `rawUrl = mediafiles + path`. See `resolveFileUrl`.
4. **Sign the URL.** BunkrDL `GET`s
   `https://glb-apisign.cdn.cr/sign?path=<encodeURIComponent(pathname)>` (no
   cookies) for a short-lived `{ token, ex }`, then appends `n=<filename>`,
   `token`, and `ex` to `rawUrl`. The signature authorises the download — **no
   `Referer` is needed**, and the _unsigned_ URL returns `403`. See `signUrl`.

Each signed URL is then fetched with `GM_xmlhttpRequest` (cross-origin, with
progress), rate-limited with jitter and exponential backoff on HTTP 429/503,
then bin-packed into size-capped ZIPs via [JSZip](https://stuk.github.io/jszip/).
The per-file page fetch in step 2 runs inside the same worker pool, so the
concurrency setting still applies.

If downloads suddenly stop working, the likely culprit is steps 2–4 — re-verify
the resolver host/response shape, the sign endpoint, and the query-param names
against a live file (a real-browser User-Agent is required), then update
`parseFilePage` / `resolveFileUrl` / `signUrl` accordingly. If only the media
host changed, the progress log names the blocked host so you know what to add to
`@connect`. Bump `@version`.

## Security & permissions

This script ships verbatim (no build step) so you can read every line.

- **`@require` (JSZip)** is pinned to an exact, immutable cdnjs version:
  `https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js`.
  Expected Subresource Integrity (you can verify the cached copy in your
  manager):
  `sha512-XMVd28F1oH/O71fzwBnV7HucLxVwtxf26XV8P4wPk26EDxuGZ91N8bsOttmnomcCD3CS5ZMRL50H0GgOHvegtg==`
- **`@connect` is scoped to the hosts actually used** (verified live): the
  per-file resolver on **`dl.bunkr.<tld>`** (a subdomain of the album's
  `bunkr.<tld>`), the signer **`glb-apisign.cdn.cr`** and the rotating media host
  **`*.cdn.cr`** (both subdomains of `cdn.cr`), album/file HTML on the various
  Bunkr TLDs, and `balbums.st` for its cards. All major managers (Tampermonkey,
  Violentmonkey, Greasemonkey) match `@connect` **subdomains**, so the
  `bunkr.<tld>` and `cdn.cr` entries already cover these — but as belt-and-braces
  for any stricter manager, the two **fixed** hosts **`dl.bunkr.cr`** and
  **`glb-apisign.cdn.cr`** are now **also listed explicitly**. The media host is a
  **rotating** `*.cdn.cr` subdomain that can't be enumerated, so it always relies
  on the `cdn.cr` entry + subdomain matching. There is **no `@connect *`**. The
  resolver host is read from the file page's download button and **allowlisted to
  `dl.bunkr.<tld>`** before the resolve POST (which echoes the file id), so a
  tampered page can't redirect it elsewhere; the media host is likewise checked to
  be `*.cdn.cr`. If Bunkr ever moves media to a brand-new CDN _domain_, downloads
  fail and the failure is surfaced (see _Troubleshooting_) naming the blocked host
  so it can be added here (and reported upstream).
- **No page data is exfiltrated.** Requests go only to Bunkr's per-file resolver,
  the CDN signer, the resolved CDN URLs, and (for balbums cards) the linked album
  page. The album title is used only for ZIP filenames and is HTML-unescaped via
  pure string work (no HTML is ever injected into the page; all UI uses
  `textContent`).
- **Grants** are limited to what the features need: `GM_xmlhttpRequest`
  (cross-origin download), `GM_setValue`/`GM_getValue`/`GM_deleteValue`/`GM_listValues`
  (settings + resume storage), `GM_registerMenuCommand` (settings menu),
  `GM_notification` (status), `GM_addStyle` (UI), `GM_download` (optional save
  path; otherwise ZIPs save via a plain `<a download>` click), and `unsafeWindow`
  (read `window.albumFiles`).

## Troubleshooting

- **The button doesn't appear on an album page.** Reload; the script retries for
  a few seconds while the toolbar renders. If the site's _Advanced Filters_
  control is missing/renamed, BunkrDL falls back to a floating button.
- **“Could not read this album's file list.”** Bunkr may have changed the page;
  reload, and if it persists the `window.albumFiles` format likely changed (see
  _How it works_).
- **Downloads fail / stop.** Usually Bunkr rate limiting (BunkrDL backs off and
  retries) or a changed download API (see _How it works_). Try increasing
  _Delay between files_. The exact reason is shown **in the progress panel** (a
  red **`❌ <message>`**) and logged to the **browser console** (`F12` → Console →
  a `[BunkrDL] … failed: …` line) — include that message when reporting an issue.
  API calls now time out (≈45 s) instead of hanging indefinitely at "0 B".
- **Tab runs out of memory.** Lower _Max ZIP size_ or turn off _ZIP bundling_.
- **Browser blocks multiple downloads.** With ZIP bundling off you get one
  download per file; allow multiple downloads for the site when prompted.

## License

GPL-3.0-or-later — see the repository [LICENSE](../../LICENSE).
