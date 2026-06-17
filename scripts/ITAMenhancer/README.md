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
  cover art**, and **Harmony ↗**. Each is independently toggleable.
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
  with: formats, **barcode (UPC)**, record label, copyright, release date,
  Mastered-for-iTunes, and a **track table with ISRCs** (plus the cover-art and
  Harmony actions).
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
  `mvod.itunes.apple.com`), and `musicbrainz.org` (the barcode→MBID lookup for
  MagicISRC, made **only when you click** Submit to MagicISRC). The app bundle is
  fetched same-origin; the Harmony button opens a URL (no fetch). **Apple Music
  Classical** (`classical.music.apple.com`) reads the **same** catalog API from the
  same hosts — adding that `@match` introduces no new cross-origin endpoint.
- **`@require`:** [JSZip 3.10.1](https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js)
  from cdnjs (pinned, immutable versioned URL) — only used to bundle the "All"
  cover-art ZIP. No remote code is fetched at runtime.
- **No data exfiltration / no unsafe DOM:** the captured tokens are sent only to
  Apple's own API; all UI is built with `textContent` (no `innerHTML`). The
  catalog credential is cached locally (GM storage); the user token is read per
  session and never stored. Cover art (static and animated) is downloaded straight
  to the user's machine. The only third-party request is the **MusicBrainz barcode
  lookup**, which runs **only on an explicit MagicISRC click** and sends just the
  public barcode (no tokens). Nothing else is sent to any third party.

## License

GPL-3.0-or-later — see the repository [LICENSE](../../LICENSE).
