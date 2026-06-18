# ITAM Enhancer

**iTunes / Apple Music Enhancer.** On [music.apple.com](https://music.apple.com)
and [Apple Music Classical](https://classical.music.apple.com)
(`classical.music.apple.com`) album, song and music-video pages it surfaces what
the web player already knows but hides: **audio formats**, the **barcode (UPC)**,
and **per-track ISRCs** — with one-click copy and a
[MagicISRC](https://magicisrc.kepstin.ca/) link. Old `itunes.apple.com` links are
covered automatically (Apple redirects them to Apple Music).

- **Install:** <https://skriptey.github.io/Userscripts/ITAMenhancer/ITAMenhancer.user.js>
- **Source & README:** [`scripts/ITAMenhancer/`](https://github.com/Skriptey/Userscripts/tree/main/scripts/ITAMenhancer)

## Quick start

1. Install [Tampermonkey](https://www.tampermonkey.net/) or
   [Violentmonkey](https://violentmonkey.github.io/), then install ITAM Enhancer.
2. Open any Apple Music album. Format badges appear near the title, and a floating
   **ITAM ▾** button (bottom-right) opens the full details panel. No login or
   setup required.

## Features

- **Inline album-header buttons** — **Barcode & ISRCs** (opens the panel),
  **Download cover art**, **Download Lyrics** (logged-in), **Find ISWCs**, and
  **Harmony ↗**, placed after the format badges. Each is independently toggleable;
  the floating **ITAM ▾** launcher remains as a fallback.
- **Format badges** — Lossless / Hi-Res Lossless / Dolby Atmos / Spatial Audio,
  inline near the title and in the panel.
- **Barcode (UPC)** and **per-track ISRCs**, in a clean table.
- **Per-track formats** — when a track's formats differ from the album-level set
  (e.g. one Atmos/Spatial track on a stereo album), the track table gains a
  **Formats** column showing badges for the differing tracks only (toggleable).
- **Classical Work column** — classical releases (e.g. on **Apple Music
  Classical**) name each track's parent **work**; the panel's track table adds a
  **Work** column, shown only when at least one track names a work (toggleable).
  The table also lists each **track length**, shows an **Apple Digital Master
  (“Mastered for iTunes”) badge**, and **hides the Composer column** on a narrow
  panel; the panel **widens with the window** and shows the script version in its
  footer.
- **One-click copy** — barcode, a single ISRC (click it), all ISRCs, or the whole
  record as JSON.
- **MagicISRC** submit link — resolves the album's **MusicBrainz release** by its
  barcode, then opens MagicISRC pre-filled with the release and its ISRCs.
- **Harmony lookup** — opens a [Harmony](https://harmony.pulsewidth.org.uk/)
  cross-service release lookup, providers pre-selected and UPC pre-filled (albums).
- **Cover-art download** — static (highest-res JPEG, `<artist> - <album>_Cover.jpg`);
  and when the album has **animated (motion) artwork**, a dropdown for **Static /
  Square / Vertical / All** (`.mp4` — `…_SquareCover.mp4` / `…_VerticalCover.mp4`).
  **All** → a `<artist> - <album>_CoverArt.zip` at the L resolution. Resolution is
  set via **Animated cover-art resolution** (L 1080 / XL 2160 / Max highest).
- **Download Lyrics** _(logged-in only)_ — pick a preferred tier: **Word-by-Word**
  (Apple Music “Sing” → enhanced/“A2” `.lrc`, which **does** carry per-word
  timestamps), **Line-by-Line** (`.lrc`), or **Static** (`.txt`). Each track **falls
  back automatically** to the next-best format it has (Word-by-Word → Line-by-Line →
  Static; Line-by-Line → Static), so a release where only some tracks are word-synced
  still downloads complete (the console logs a per-tier tally). **Word-by-Word also
  saves Apple’s raw `.ttml` source** beside each `.lrc` — the lossless word-by-word
  original, **pretty-printed (re-indented) for readability** by default (every `<p>`
  line stays byte-for-byte; toggle **Pretty-print lyrics .ttml** off for raw bytes). Multiple files (an album, or one word-synced song = `.lrc` + `.ttml`) are
  zipped (`<disc> - <track> - <title>.<ext>`); a lone file downloads directly, and if
  the zip ever stalls the files are saved individually instead. The button is
  **hidden when nothing is downloadable**. Lyrics are licensed content — **personal
  use** only.
- **Find ISWCs** — Apple gives writers but no ISWC, so on click this looks each track's
  **ISWC** up from **MusicBrainz** (+ a **credits.fm** gap-fill) and shows ranked
  candidates with a **confidence** and **source**, one-click copy, and a **“Seed MB ↗”**
  deep-link that pre-fills a MusicBrainz edit. **Human-confirmed** — nothing is written
  automatically (read-only; sends only the public title/writer, no tokens). Each source
  is a toggle. Treat ISWCs as hints to verify.
- Works on **album / song / music-video** pages on both **music.apple.com** and
  **classical.music.apple.com** (Apple Music Classical), every storefront, and
  follows the single-page navigation. Legacy `itunes.apple.com` links aren't
  matched directly — Apple redirects them to `music.apple.com` first.

## Settings

Userscript-manager menu (toolbar icon, on an Apple Music page):

| Setting                        | Default            | Notes                                                                                    |
| ------------------------------ | ------------------ | ---------------------------------------------------------------------------------------- |
| Show audio formats             | on                 | Master toggle for format badges (inline + panel).                                        |
| Show barcodes (UPC) & ISRCs    | on                 | Master toggle for barcode + ISRC section/button.                                         |
| Per-track formats column       | on                 | Sub-option of _Show barcodes & ISRCs_: per-track Formats column for differing tracks.    |
| Classical Work column          | on                 | Sub-option of _Show barcodes & ISRCs_: per-track **Work** column for classical releases. |
| Inline format badges           | on                 | Sub-option of _Show audio formats_.                                                      |
| Integrate Harmony lookup       | on                 | The **Harmony ↗** header/panel button (albums).                                          |
| Download cover art button      | on                 | Static + animated cover-art control.                                                     |
| Download Lyrics button         | on                 | Word-by-Word / Line-by-Line / Static lyrics. Logged-in only; hidden when no lyrics.      |
| Find ISWCs button              | on                 | Per-track ISWC lookup + MusicBrainz seeding (on click).                                  |
| ISWC source · MusicBrainz      | on                 | Sub-option of _Find ISWCs_: query MusicBrainz (primary; gives the work MBID).            |
| ISWC source · credits.fm       | on                 | Sub-option of _Find ISWCs_: credits.fm gap-fill when MusicBrainz has no ISWC.            |
| Animated cover-art resolution  | L                  | Prompts for L=1080 · XL=2160 · Max=highest (XL/Max huge).                                |
| Locale override                | storefront default | API locale, e.g. `en-US`.                                                                |
| Clear cached Apple Music token | —                  | Re-captured on next use.                                                                 |

Each feature set toggles independently from the manager's menu; the panel shows
only the enabled sets. In current Tampermonkey/Violentmonkey the menu labels update
**live** as you toggle (older managers refresh them on reload); the on-page UI
applies on the next page load.

## Tokens (FYI)

ITAM Enhancer reuses the Apple Music web player's **own** access — you never log
in or paste anything:

- a **catalog credential** the player already holds (always needed; obtained from
  the live player and cached, so it's fetched rarely), and
- your **Music-User-Token** **only if you're already logged in** (your own
  session, sent alongside so library/region-gated content resolves). Logged out →
  anonymous catalog, which already has formats, UPC and ISRCs.

See the per-script
[README](https://github.com/Skriptey/Userscripts/blob/main/scripts/ITAMenhancer/README.md)
for the technical details and attribution.
