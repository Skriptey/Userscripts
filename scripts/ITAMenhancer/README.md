# ITAM Enhancer

**iTunes / Apple Music Enhancer** — on [music.apple.com](https://music.apple.com)
**and [Apple Music Classical](https://classical.music.apple.com)**
(`classical.music.apple.com`) album, song and music-video pages it surfaces the
data the web player already has but doesn't show: **available audio formats**, the
**barcode (UPC)**, and **per-track ISRCs** — with one-click copy and a
[MagicISRC](https://magicisrc.kepstin.ca/) link. It also adds **inline
album-header buttons**, a **[Harmony](https://harmony.pulsewidth.org.uk/)
cross-service lookup**, **cover-art download**, and — for classical releases — an
optional per-track **Work** column. Old `itunes.apple.com` links need nothing
special: Apple redirects them to `music.apple.com`, where the script runs.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) or
   [Violentmonkey](https://violentmonkey.github.io/).

   ➡️ **[Install ITAM Enhancer](https://skriptey.github.io/Userscripts/ITAMenhancer/ITAMenhancer.user.js)**

2. Open any Apple Music album and you're set — no login or configuration needed.

## What it does

- **Inline album-header buttons** — a button row appears in the album header
  (after the format badges): **Barcode & ISRCs** (opens the panel), **Download
  cover art**, **Download Lyrics** (when logged in), **Find ISWCs**, and
  **Harmony ↗**. Each is independently toggleable.
- **Format badges** — shows the album's `audioTraits` as badges (Lossless,
  Hi-Res Lossless, Dolby Atmos, Spatial Audio, …) inline near the title (toggle
  in settings) and in the details panel.
- **Per-track formats** — a track can carry formats the album-level set doesn't
  (e.g. one Dolby Atmos / Spatial track on an otherwise stereo album). The panel's
  track table adds a **Formats** column that shows badges only for the tracks that
  **differ** from the album-level set (blank when identical); the column appears
  only when at least one track differs. Toggle with **Per-track formats column**.
- **Classical Work column** — classical releases (e.g. on **Apple Music
  Classical**) name each track's parent **work**; the panel's track table adds a
  **Work** column showing it. The column appears only when at least one track names
  a work, and individual cells are blank for tracks without one — so non-classical
  albums never grow the column. Toggle with **Classical Work column**.
- **Details panel** — a floating **“ITAM ▾”** button (bottom-right) opens a panel
  with: formats, **barcode (UPC)**, record label, copyright, release date, an
  **Apple Digital Master (“Mastered for iTunes”) badge**, and a **track table with
  ISRCs and track lengths** (plus the cover-art and Harmony actions). The panel
  **grows with the window** on wide screens and **hides the Composer column** when
  it gets too narrow; its footer shows the running ITAM Enhancer version.
- **One-click copy** — copy the barcode, any single ISRC (click it), **all
  ISRCs**, or the whole record **as JSON**.
- **MagicISRC** — one click opens the album in kepstin's MagicISRC, pre-filled
  for editing. MagicISRC keys a submission to a **MusicBrainz release**, so on
  click the script first resolves the release's MusicBrainz ID (MBID) from the
  album's **barcode (UPC)** (`musicbrainz.org/ws/2/release?query=barcode:…`),
  then opens `?mbid=<id>&isrc1=…&isrc2=…` with the ISRCs in track order. If the
  album has no barcode, or MusicBrainz has no release for it yet, it tells you to
  use the **Harmony** button to match/add the release first (rather than opening
  MagicISRC blank). The lookup runs **only when you click** the button.
- **Harmony lookup** — opens a [Harmony](https://harmony.pulsewidth.org.uk/)
  release lookup for the album with the main providers pre-selected and the
  album's UPC pre-filled (album pages).
- **Cover-art download** — saves the **highest-resolution** static cover as
  `<artist> - <album>_Cover.jpg`. When the album has **animated (motion)
  artwork**, the button becomes a dropdown — **Static**, **Square animated**,
  **Vertical animated**, or **All**. Animated covers download as `.mp4`
  (`<artist> - <album>_SquareCover.mp4` / `…_VerticalCover.mp4`; Apple serves them
  as unencrypted fMP4 over HLS). **All** bundles everything into
  `<artist> - <album>_CoverArt.zip` at the **L** resolution; at **XL/Max** the
  (huge) animated files save separately instead of zipping. Resolution is set via
  the **Animated cover-art resolution** menu item (**L** 1080 · **XL** 2160 ·
  **Max** highest).
- **Download Lyrics** _(requires being logged in to Apple Music)_ — pick a
  preferred tier from the dropdown: **Word-by-Word** (Apple Music “Sing”, enhanced
  “A2” `.lrc` — which **does** embed per-word timestamps), **Line-by-Line**
  (standard `.lrc`), or **Static** (plain `.txt`). **Each track automatically falls
  back** to the next-best format it actually has — **Word-by-Word → Line-by-Line →
  Static** (and **Line-by-Line → Static**) — so a release where only some tracks
  have “Sing” lyrics still downloads complete; the toast notes if any tracks fell
  back, and the console logs a per-tier tally (`word=… line=… static=…`).
  **Word-by-Word also saves Apple’s raw `.ttml` source** next to each `.lrc` — the
  lossless word-by-word original, so a genuinely word-synced track is never reduced
  to just an LRC. Multiple files (an album, or one word-synced song = `.lrc` +
  `.ttml`) bundle into a ZIP with names `<disc> - <track> - <title>.<ext>`; a lone
  file downloads directly. If the ZIP build ever stalls, each file is saved
  individually instead so the lyrics are never lost. Tracks with no lyrics are
  skipped, a single bad track can’t abort the rest, and any failure is surfaced as a
  toast (never a silent no-op). The button is **hidden when nothing is
  downloadable**. Lyrics come from Apple’s `syllable-lyrics`/`lyrics` TTML (read
  with `extend=ttmlLocalizations` so word-timed data stored there isn’t missed) and
  need your **logged-in subscription**; they are licensed content, so this is for
  **personal use** only. Toggle with **Download Lyrics button**.
- **Find ISWCs** — Apple gives writers but **no ISWC**, so on an explicit click this
  looks each track's **ISWC** (the work code, the composition counterpart of an ISRC)
  up from **[MusicBrainz](https://musicbrainz.org/)** (primary — also gives the work's
  MBID) plus a **[credits.fm](https://credits.fm/)** gap-fill, and opens a results
  table with each track's best **candidate**, a **confidence** (high/medium/low) and
  the **source**, one-click copy, and a **“Seed MB ↗”** deep-link that pre-fills a
  MusicBrainz edit. It's **human-confirmed** — nothing is written to MusicBrainz
  automatically (a planned MB-side companion will streamline the seeding). Each source
  is a toggle; the lookup sends only the public track **title/writer** (no tokens), and
  credits.fm data is CC-BY, so treat ISWCs as **hints to verify**, not facts to import.
  Toggle with **Find ISWCs button**.
- Works on **album**, **song**, and **music-video** pages on both
  **music.apple.com** and **classical.music.apple.com** (Apple Music Classical),
  across all storefronts, and follows the in-app (single-page) navigation. The
  floating launcher is always available as a fallback if Apple's layout shifts.
  Legacy **`itunes.apple.com`** links are not matched directly — Apple
  301-redirects them to `music.apple.com` before the page loads, so they're
  already covered.

## Settings

Open your userscript manager's menu (its toolbar icon, on an Apple Music page):

| Setting                        | Default            | Notes                                                                                                                           |
| ------------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Show audio formats             | `on`               | Master toggle for the format badges (inline + in the panel).                                                                    |
| Show barcodes (UPC) & ISRCs    | `on`               | Master toggle for the barcode + per-track ISRC section (and the header button).                                                 |
| Per-track formats column       | `on`               | Sub-option of _Show barcodes & ISRCs_: per-track **Formats** column for tracks that differ from the album-level set.            |
| Classical Work column          | `on`               | Sub-option of _Show barcodes & ISRCs_: per-track **Work** column for classical releases (shown only when a track names a work). |
| Inline format badges           | `on`               | Sub-option of _Show audio formats_: also inject badges near the album title.                                                    |
| Integrate Harmony lookup       | `on`               | The **Harmony ↗** header/panel button (album cross-service lookup).                                                             |
| Download cover art button      | `on`               | The **Download cover art** header/panel control (static + animated dropdown).                                                   |
| Download Lyrics button         | `on`               | The **Download Lyrics** header/panel control (Word-by-Word / Line-by-Line / Static). Shown only when logged in + lyrics exist.  |
| Find ISWCs button              | `on`               | The **Find ISWCs** header/panel control — per-track ISWC lookup + MusicBrainz seeding (runs on click).                          |
| ISWC source · MusicBrainz      | `on`               | Sub-option of _Find ISWCs_: query MusicBrainz works (primary; supplies the work MBID for seeding).                              |
| ISWC source · credits.fm       | `on`               | Sub-option of _Find ISWCs_: query credits.fm as a gap-fill when MusicBrainz has no ISWC.                                        |
| Animated cover-art resolution  | `L`                | Prompts for **L** (1080), **XL** (2160), or **Max** (highest). XL/Max are very large.                                           |
| Locale override                | storefront default | Apple Music locale (e.g. `en-US`, `ja-JP`) for the API.                                                                         |
| Clear cached Apple Music token | —                  | Forget the cached catalog credential (re-captured on next use).                                                                 |

Each feature set can be turned on/off independently from the userscript manager's
menu; the panel and badges render only the enabled sets. In current Tampermonkey
and Violentmonkey the menu **labels update live** the instant you toggle (the
`…: on/off` caption flips without reopening the menu) — older managers refresh the
label on the next page load. Either way, the on-page UI is injected at load, so
**reload the page** to apply a change to what's already on screen.

## How it works (for maintainers)

Verified live against `amp-api` on 2026-06-15. Apple Music's web player calls
Apple's catalog API with **two** tokens, and ITAM Enhancer reuses the player's
**native** tokens — you never log in or paste anything:

- **Catalog credential** (`Authorization: Bearer …`) — always required for any
  catalog read. It's the credential the web player itself already holds; ITAM
  Enhancer obtains it from the live player and caches it by its own expiry, so it
  is fetched rarely (`getDevToken()`).
- **Music-User-Token** (`Media-User-Token: …`) — optional; the **logged-in user's
  own** session, read from the MusicKit instance (cookie fallback) and sent **when
  available** so account/region/library-gated content resolves. Logged out →
  omitted (anonymous catalog is the fallback). It never replaces the catalog
  credential; it rides alongside it.

One request returns everything:
`GET https://amp-api.music.apple.com/v1/catalog/<cc>/<type>s/<id>?include=tracks&extend=editorialVideo,audioTraits`
→ `attributes.audioTraits` (album-level formats), `attributes.upc` (barcode),
`relationships.tracks.data[].attributes.isrc`, `attributes.artwork` (the cover-art
URL template, expanded to its native max resolution), `attributes.editorialVideo`
(animated/motion artwork — HLS streams), plus label/copyright/dates. Adding
`audioTraits` to `extend` makes each **track** return its own `attributes.audioTraits`
too, so the panel can flag tracks whose formats differ from the album-level set.
The call uses `GM_xmlhttpRequest` (cross-origin + lets us set `Origin`); static art
is fetched the same way from `*.mzstatic.com`. **Animated artwork** is unencrypted
fMP4 over HLS on `mvod.itunes.apple.com`: a variant is chosen by the L/XL/Max
setting, then the init + media segments are concatenated into a playable `.mp4`
(no decrypt or transcode). The Harmony button just opens a URL (no extra network).

**MagicISRC** needs a MusicBrainz release MBID (a bare ISRC list opens it blank).
On click only, the script resolves the MBID from the album's barcode via the
MusicBrainz web service
(`GET https://musicbrainz.org/ws/2/release?query=barcode:<upc>&fmt=json`, sending
the descriptive `User-Agent` MusicBrainz requires and respecting its ~1 req/sec
rate limit), prefers an `Official` release, then opens
`https://magicisrc.kepstin.ca/?mbid=<id>&isrc1=…&isrc2=…`. No barcode / no MB match
→ a toast pointing at the Harmony button; nothing is opened blank.

If it breaks: Apple may rotate the token location or API shape — check
`getDevToken`/`scrapeBundleToken` and `fetchEntity`/`parseEntity`. Apple Music's
DOM classes are volatile, so inline badge placement is best-effort (anchored to
the heading text); the panel is the reliable path.

## Attribution

Original implementation — **no code copied** from the works that inspired it
(both are unlicensed / all rights reserved, so their code is deliberately not
reused):

- **Apple Music Formats** by uh wot — <https://gist.github.com/uhwot/1b97f5b806fdf1424377ddb86446d912>
  (itself based on [bunnykek/AppleMusic-Formats-Extension](https://github.com/bunnykek/AppleMusic-Formats-Extension))
- **Apple Music Barcodes/ISRCs** by ToadKing — <https://github.com/ToadKing/apple-music-barcode-isrc>
- **MagicISRC** by kepstin — <https://magicisrc.kepstin.ca/>

## Security & permissions

- **Grants:** `GM_xmlhttpRequest` (call amp-api with `Origin`/`Authorization`),
  `GM_addStyle` (UI), `GM_setClipboard` (copy buttons), `GM_getValue`/`GM_setValue`
  (settings + token cache), `GM_registerMenuCommand` (settings), `GM_notification`
  (toasts), `unsafeWindow` (read the page's MusicKit tokens).
- **Cross-origin hosts (`@connect`):** `amp-api.music.apple.com` (catalog API),
  `mzstatic.com` (static cover art), `itunes.apple.com` (animated-artwork HLS on
  `mvod.itunes.apple.com`), `musicbrainz.org` (the barcode→MBID lookup for MagicISRC
  **and** the ISWC work search), and `api.credits.fm` (the ISWC gap-fill lookup). The
  MusicBrainz/credits.fm requests are made **only when you click** Submit to MagicISRC
  or **Find ISWCs**, and send only the **public title/barcode/writer** — never any
  token. The app bundle is fetched same-origin; the Harmony button opens a URL (no
  fetch). **Apple Music Classical** (`classical.music.apple.com`) reads the **same**
  catalog API from the same hosts — adding that `@match` introduces no new endpoint.
- **No `@require` / zero runtime dependencies.** The cover-art "All" ZIP and the
  album lyrics ZIP are built by a tiny **built-in STORE-only ZIP writer**
  (`buildStoreZip`) — there is no JSZip (or any other) third-party library. This
  also fixed an Apple-Music-specific stall where JSZip's async build never
  resolved, forcing dozens of individual file downloads.
- **No data exfiltration / no unsafe DOM:** the captured tokens are sent only to
  Apple's own API; all UI is built with `textContent` (no `innerHTML`). The
  catalog credential is cached locally (GM storage); the user token is read per
  session and never stored. Cover art (static and animated) is downloaded straight
  to the user's machine. The only third-party request is the **MusicBrainz barcode
  lookup**, which runs **only on an explicit MagicISRC click** and sends just the
  public barcode (no tokens). Nothing else is sent to any third party.
- **Lyrics:** **Download Lyrics** calls Apple's `syllable-lyrics`/`lyrics` endpoints,
  which require your **logged-in Music-User-Token** — it does nothing when you're
  logged out (the button is hidden). The TTML is fetched only from Apple's own API
  and saved straight to your machine. Lyrics are third-party **licensed/copyrighted**
  content, so this export is for **personal use** only.
- **ISWC lookup:** **Find ISWCs** runs **only on click** and queries MusicBrainz +
  credits.fm with just the **public title/writer** (no tokens). It is **read-only and
  human-confirmed** — it never writes to MusicBrainz; the “Seed MB ↗” link only opens
  a pre-filled MusicBrainz edit page in a new tab for **you** to review and submit.
  credits.fm data is CC-BY (surfaced as a hint to verify, not imported as fact).

## License

GPL-3.0-or-later — see the repository [LICENSE](../../LICENSE).
