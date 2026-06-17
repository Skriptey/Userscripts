# BunkrDL

**Bulk-download Bunkr albums and [balbums.st](https://balbums.st) listings** by
media type, rate-limited, bundled into size-capped ZIP files named after the
album.

> ⚠️ **Use responsibly.** Only download content you have the right to keep, for
> personal/offline use. Respect creators, copyright, and each site's terms. The
> built-in rate limiting is there to be a good citizen — please leave it on.

- **Install:** <https://skriptey.github.io/Userscripts/BunkrDL/BunkrDL.user.js>
- **Source & per-script README:** [`scripts/BunkrDL/`](https://github.com/Skriptey/Userscripts/tree/main/scripts/BunkrDL)

---

## Quick start

1. Install [Tampermonkey](https://www.tampermonkey.net/) (recommended) or
   [Violentmonkey](https://violentmonkey.github.io/), then install BunkrDL.
2. Open a Bunkr album, e.g. `https://bunkr.cr/a/<id>`.
3. Click **⬇ Bulk Download ▾** (next to _Advanced Filters_, or the floating
   button bottom-right) and choose a type.
4. Approve the cross-origin request prompt (choose **Always allow** for the
   Bunkr domain), watch the progress panel, and the ZIP(s) download when ready.

## Where the buttons appear

### Bunkr album pages — `https://<any-bunkr-domain>/a/<id>`

A **⬇ Bulk Download ▾** dropdown next to **Advanced Filters** (or a floating
button if that control isn't present), with options:

- **Download Images** — `jpg jpeg png gif webp avif bmp tif heic svg ico …`
- **Download Videos** — `mp4 mkv webm mov avi m4v ts mpg wmv flv 3gp …`
- **Download Audio** — `mp3 m4a flac wav ogg opus aac wma aiff …`
- **Download Archives** — `zip rar 7z tar gz bz2 xz zst cbz cbr iso …`
- **Download All** — everything

Each **file card in the grid** also gets a **⬇ Download** button that fetches
just that one file (saved directly, no ZIP).

All Bunkr domains/TLDs are supported (`bunkr.cr`, `bunkr.ru`, `bunkr.site`,
`bunkr.media`, `bunkr.fi`, … including legacy ones).

### balbums.st / bunkr-albums.io listing pages

On search results, `/live`, `/topalbums`, `/topvideos`, `/topfiles`, and
`/topimages`, a small **⬇ Download ▾** button is added under each album card.
Picking a type fetches that album from Bunkr and downloads it.

Three listing enhancements are also added (each menu-toggleable, each a no-op if
the layout isn't recognised):

- **Sort dropdown** — reorder the grid by Default / Name (A–Z) / File count.
- **Infinite scroll** — auto-load the next page of albums near the bottom.
- **Hover previews** — hover a card to show its item thumbnails; click one to
  open that file.

### Single Bunkr file pages

On an individual file page (`/f/`, `/v/`, `/i/`, `/d/`) a floating
**⬇ BunkrDL — Download** button fetches just that one file and saves it directly
(no ZIP).

## ZIP naming & splitting

ZIPs are named **`<AlbumName>_1.zip`, `<AlbumName>_2.zip`, …** using the album's
title. Each ZIP is filled up to **Max ZIP size**, then the next one starts.

**A single file bigger than the cap** is handled per your _Oversize file
handling_ setting:

| Mode            | Behaviour                                         |
| --------------- | ------------------------------------------------- |
| `ask` (default) | Prompt: put it in its own larger ZIP, or skip it. |
| `extend`        | Silently give it its own oversized ZIP.           |
| `skip`          | Skip it (logged in the progress panel).           |

Prefer no ZIPs? Turn **ZIP bundling** off to save each file individually. In this
mode BunkrDL **keeps downloading the rest of the queue in the background** while
each file's save is pending, so a slow "where to save?" dialog won't stall the
album (un-saved files held in memory are bounded by **Max ZIP size**). For the
smoothest no-ZIP **Download All**, also turn on **Save via GM_download** so the
manager saves each file with no per-file dialog.

Building a large ZIP runs in the tab, so it's the slow part of a big album; the
progress panel shows a **percentage** plus a moving **sheen** while it packs (so a
live build is distinct from a frozen one), and a ZIP that fails to build is shown
as **❌** on the panel rather than stalling silently.

Filenames are decoded for readability (Bunkr uses `+`/`%20` for spaces, so
`My+File%20(1).mp4` becomes `My File (1).mp4`).

## Resume & integrity

Completed files are remembered **per album**. If the tab closes or some files
fail mid-album, just run the same album again — BunkrDL skips what's already
done, continues the ZIP numbering, and only downloads what's missing. Each
download is also size-checked against the manifest and retried if it's truncated.
Use **Clear resume data** in the menu to start an album over from scratch.

The progress panel has a **Cancel** button. Cancelling stops fetching new files
but still **saves anything already downloaded** (and records it for resume), so
completed files aren't wasted — only in-progress / not-yet-started files stop.

## Settings

Open your userscript manager's menu (its toolbar icon, while on a supported
page) → **BunkrDL** commands. Settings persist across sessions.

| Setting                     | Default    | Notes                                                                                      |
| --------------------------- | ---------- | ------------------------------------------------------------------------------------------ |
| Max ZIP size                | `1024` MiB | Cap per ZIP; also bounds tab memory (~2× while zipping).                                   |
| Delay between files         | `1500` ms  | Base pause before each file.                                                               |
| Delay jitter                | `750` ms   | Random `0..jitter` added per pause.                                                        |
| Max retries per file        | `4`        | Attempts before a file is failed.                                                          |
| Parallel downloads          | `1`        | Files at once (1–8). Higher = faster, more ban risk.                                       |
| Oversize file handling      | `ask`      | `ask` / `extend` / `skip`.                                                                 |
| ZIP bundling                | `on`       | Off = save files individually. Applies to the next download.                               |
| Compression                 | `STORE`    | `STORE` (best for media) or `DEFLATE`.                                                     |
| Pre-flight confirmation     | `on`       | Confirm count/size/# ZIPs before starting.                                                 |
| Verify file sizes           | `on`       | Retry downloads shorter than the manifest size.                                            |
| Resume support              | `on`       | Remember completed files to resume an album.                                               |
| Save via GM_download        | `off`      | Manager saves (ZIPs & individual files), no per-file dialog; best for no-ZIP Download All. |
| Listing: sort dropdown      | `on`       | Sort control (Default / Name / File count) on listing pages.                               |
| Listing: infinite scroll    | `on`       | Auto-load the next page of albums near the bottom.                                         |
| Listing: hover previews     | `on`       | Hover an album card to preview its item thumbnails.                                        |
| Listing: max preview thumbs | `12`       | Cap on thumbnails per hover preview.                                                       |
| Clear resume data           | —          | Forget saved progress for all albums.                                                      |
| Reset to defaults           | —          | Restore all settings.                                                                      |

The numeric/list items open a prompt; the rest are **one-click toggles** (a single
click flips and saves them, with a toast). The menu's "(current: …)" label refreshes
the next time you open the menu — no page reload needed.

## Rate limiting

By default downloads run **one at a time** with a jittered delay between files,
and back off exponentially when Bunkr returns **HTTP 429/503** (respecting
`Retry-After`). This is deliberate — it avoids tripping Bunkr's rate limiting or
getting your IP temporarily blocked. If you still hit limits, raise _Delay
between files_. You can raise **Parallel downloads** for speed, but it increases
the chance of being rate-limited.

See the **[FAQ](FAQ)** for common problems and the per-script
[README](https://github.com/Skriptey/Userscripts/blob/main/scripts/BunkrDL/README.md)
for the technical “how it works” / maintenance notes.
