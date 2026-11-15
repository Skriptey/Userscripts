# Deezer Enhancer

A **Deezer sibling of [ITAM Enhancer](../ITAMenhancer/)**. On
[deezer.com](https://www.deezer.com) album and track pages it surfaces the **barcode
(UPC)** and **per-track ISRCs** — with one-click copy and a
[MagicISRC](https://magicisrc.kepstin.ca/) link — plus **label / release info**,
**contributors**, a **[Harmony](https://harmony.pulsewidth.org.uk/) cross-service
lookup**, and **high-resolution cover-art download**. Uses Deezer's **public, no-auth
API** — no login required for the core features. Two optional features are **off by
default**: a **lyrics download** (word-by-word, line-by-line or plain) and an
**internal-data layer** that adds lossless / quality badges and full songwriter
credits.

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
  Deezer's API usually returns a clean digit-only UPC, but as of v1.0.2 the value is
  still passed through the same **barcode normaliser** used across the family
  (strips formatting, length-gates to a plausible GTIN) before it reaches Harmony or
  the MusicBrainz lookup — defensive hardening, not a fix for an observed Deezer bug
  (see [Discogs Enhancer](../discogs-enhancer/README.md) for the bug it fixes there).
- **Cover-art download** — saves the high-resolution cover as
  `<artist> - <album>_Cover.jpg`.
- **Download Lyrics** _(off by default)_ — a dropdown with **Word-by-Word**,
  **Line-by-Line** and **Static** lyrics. Each song falls back to the best version it
  really has (word → line → static). Files are named `<disc> - <NN> - <title>.lrc`
  (or `.txt`); an album (or any download with more than one file) comes as a ZIP named
  `<artist> - <album>_Lyrics_<type>.zip`. Word-by-Word files are "enhanced" LRC that
  keep the timing of every word: `[00:12.34]<00:12.34>Hello <00:12.80>world`. Needs you
  to be logged in to Deezer (see the logged-out option below). Lyrics are licensed
  content — **for personal use only**.
- **Internal-data layer (gw-light)** _(off by default)_ — adds **Lossless (FLAC) /
  MP3 320 / MP3 128 / 360 Reality Audio badges** (panel header plus a per-track
  **Quality** column), **full credits** (songwriters, producers, publishers — replaces
  the public "Contributors" block, with a per-track **Credits** link), and hides the
  Download Lyrics button when Deezer says no track has lyrics. It uses your own Deezer
  session, only ever **reads**, and falls back to the public data if anything goes
  wrong. If Deezer reports every size as 0 (logged out, or a free account) you get a
  muted "log in to see quality" badge instead of a misleading "MP3 only".

## Settings

Userscript-manager menu (labels update live). Every feature has its own switch.

| Menu item                                            | Default             | What it does                                                                                                                                           |
| ---------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Show barcode (UPC) & ISRCs                           | on                  | Barcode + ISRC table, copy buttons, MagicISRC                                                                                                          |
| Show contributors                                    | on                  | Contributors / credits block in the panel                                                                                                              |
| Download cover art button                            | on                  | High-resolution cover download                                                                                                                         |
| Integrate Harmony lookup                             | on                  | Harmony cross-service lookup                                                                                                                           |
| Download Lyrics button                               | **off**             | The lyrics dropdown (needs a reload to appear)                                                                                                         |
| Lyrics when logged out (anonymous token, unofficial) | **off**             | Lets lyrics work without a Deezer login. **Unofficial**: turning it on shows a warning that it is undocumented, may stop working, and is not supported |
| Word-by-Word also saves raw .json                    | **off**             | Saves Deezer's untouched word-timing data next to each word-by-word `.lrc`                                                                             |
| Deezer internal data (gw-light, needs login)         | **off**             | Master switch for the internal-data layer                                                                                                              |
| Lossless / quality badges                            | on (needs gw-light) | Quality badges and column                                                                                                                              |
| Full credits (songwriters, producers)                | on (needs gw-light) | Full credits instead of public contributors                                                                                                            |

## What is not done

- Inline quality badges next to the album title (the quality badges are in the panel).
- Lyrics header tags (`[ar:]`, `[ti:]`…) in the `.lrc` files — kept off so the files
  match ITAM Enhancer's.

## How it works (for maintainers)

Verified live against `api.deezer.com` on 2026-06-17. The **public** REST API is
**CORS-open for the deezer.com origin** (`Access-Control-Allow-Origin:
https://www.deezer.com`), so the script reads it with a plain `fetch()` — no token, no
`@connect`. `GET /album/<id>` gives UPC / label / dates / genres / `cover_xl` /
contributors; `GET /album/<id>/tracks` carries each track's `isrc` directly (all ISRCs
in one call). Cover art is on `cdn-images.dzcdn.net` (CORS-open). The **only**
cross-origin call is the MusicBrainz barcode→MBID lookup for MagicISRC
(`GM_xmlhttpRequest` + descriptive User-Agent → `@connect musicbrainz.org`, on click).
The UPC is normalised to a bare digit string (`normaliseGtin`, shared with the other
five Harmony-linked scripts) before it's used in the Harmony URL or the MusicBrainz
`barcode:` query, so a non-GTIN value resolves to "no lookup" rather than a request
that can never match.

**Lyrics.** Deezer's lyrics come from its GraphQL endpoint `pipe.deezer.com`, which
needs a short-lived login token (a signed "JWT"). The token comes from
`auth.deezer.com/login/renew` using a plain page `fetch` with your own Deezer cookies
(a normal userscript request cannot be trusted to send them). With the anonymous option
on and no login, `auth.deezer.com/login/anonymous` is used instead. The token is kept
**in memory only** (about 5 minutes), is never saved or logged, and is only sent to
`pipe.deezer.com`. One `GetLyrics(trackId)` request per track returns all three
versions (word-timed, line-timed, plain text); at most 4 tracks are fetched at once,
because Deezer's network edge answers 403/429 to bursts. An expired token is replaced
once and the request retried once. A timed version is ignored when its last line ends
more than 2 seconds after the track's length. Deezer's word entries contain **no
spaces**, so the script adds one after every word except the last of a line. All page
requests have a 15-second limit.

**Internal data (gw-light).** `www.deezer.com/ajax/gw-light.php` is Deezer's own
website API — internal and undocumented, so it can change without notice. The script
POSTs to it from the page (same origin, your cookies travel), first
`deezer.getUserData` to get the CSRF token (`checkForm`), then `song.getListByAlbum`
(one call for a whole album) or `song.getData` (track pages). `FILESIZE_*` values above
zero become format badges; `SNG_CONTRIBUTORS` becomes credits; `LYRICS_ID` hides the
lyrics button when nothing has lyrics. An "invalid token" reply gets one fresh token and
one retry.

## Security & permissions

- **Grants:** `GM_xmlhttpRequest` (the MusicBrainz lookup only), `GM_addStyle`,
  `GM_setClipboard`, the menu/storage grants, `GM_notification`, `GM_info`. The lyrics
  and internal-data features add **no** new grants and **no** `@connect` lines (they use
  page requests to Deezer's own hosts).
- **`@connect`:** only `musicbrainz.org` (sends just the public barcode, no tokens).
- **Tokens stay in memory.** The lyrics login token and the gw-light CSRF token are never
  saved with `GM_setValue`, never logged, never shown, and never part of "Copy as JSON".
  The lyrics token is only sent to `pipe.deezer.com`.
- **Read-only internal layer.** Only three methods can be called (a fixed list in the code).
  Only named fields are copied from Deezer's replies; stream-related data (`TRACK_TOKEN`,
  `MD5_ORIGIN`, media links, rights) is never kept, logged or exported.
- **Lyric text** goes only into the files you download — not into the page, the console,
  or the JSON copy. Console lines hold counts, ids and status codes only.
- **No unsafe DOM / no data exfiltration:** all UI is built with `textContent`; no
  `@require`, no remote code; nothing sent to third parties except the explicit
  MusicBrainz lookup.
- **Tests:** `npm test` runs offline checks of the parsers, writers, ZIP, token logic and
  field filtering (made-up lyrics only).

## Troubleshooting

- **"Log in to Deezer to download lyrics"** — you are logged out. Log in, or (at your own
  risk) switch on the anonymous option.
- **"Deezer is rate-limiting — try again shortly"** — too many requests too fast; wait a
  minute and retry (large albums are fetched 4 tracks at a time to avoid this).
- **"No lyrics returned for this release"** — Deezer has no lyrics for those tracks
  (instrumentals, or not licensed in your region). The console shows the status per track.
- **The Download Lyrics button is missing** — switch it on in the menu and reload; with the
  internal-data layer on it is also hidden when Deezer reports no lyrics for the release.
- **Quality shows "log in to see quality"** — Deezer reported every size as 0, which it does
  for logged-out and free sessions.
- **Internal data does nothing** — Deezer may have changed the internal API; the script
  falls back to the public data (the console says why).

## License

GPL-3.0-or-later — see the repository [LICENSE](../../LICENSE).
