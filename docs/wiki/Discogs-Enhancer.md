# Discogs Enhancer

A **Discogs sibling of [ITAM Enhancer](ITAMenhancer)**. Discogs is a release
**database**, so this is reframed as a **structured copy/export + cross-link** tool: on
[discogs.com](https://www.discogs.com) release pages it gives a clean panel with the
**barcode**, **catalogue number**, **label**, **format**, **genres** and the **full
credits**, one-click copy/JSON export, a **[Harmony](https://harmony.pulsewidth.org.uk/)**
lookup, and a **[MagicISRC](https://magicisrc.kepstin.ca/)** link when ISRCs are present.
Public, no-auth API.

- **Install:** <https://skriptey.github.io/Userscripts/discogs-enhancer/discogs-enhancer.user.js>
- **Source & README:** [`scripts/discogs-enhancer/`](https://github.com/Skriptey/Userscripts/tree/main/scripts/discogs-enhancer)

## Quick start

1. Install [Tampermonkey](https://www.tampermonkey.net/) or
   [Violentmonkey](https://violentmonkey.github.io/), then Discogs Enhancer.
2. Open any Discogs **release** page — a floating **Discogs ▾** button (bottom-right)
   opens the panel, and **Release info & credits** / **Harmony ↗** appear in the header.

## Features

- **Structured panel** — barcode, label / cat#, format, year, country, genres/styles,
  ISRCs (when present), tracklist (with per-track writers), and full credits by role.
- **Copy / export** — barcode, ISRCs, all credits, or the whole record as JSON.
- **Harmony lookup** — cross-service release lookup for the Discogs release + barcode.
  Discogs stores barcodes exactly as printed (`4 943674 060023`), so before the
  Harmony/MusicBrainz handoff the barcode is normalised to a bare digit string
  (fixes the "GTIN … contains invalid non-numeric characters" error).
- **MagicISRC** — shown only when the release carries ISRCs (rare on Discogs).

## Settings

Userscript-manager menu (live labels): **Show release info & ISRCs**, **Show credits**,
**Integrate Harmony lookup**.

## Notes

No cover-art download (Discogs images need an authenticated token). Discogs asks for a
descriptive User-Agent, so the script uses `GM_xmlhttpRequest` + `@connect
api.discogs.com`. See the per-script
[README](https://github.com/Skriptey/Userscripts/blob/main/scripts/discogs-enhancer/README.md).

## Troubleshooting

**"Harmony said my barcode contains invalid non-numeric characters" / MagicISRC
found no MusicBrainz release.** Fixed in **v1.0.2** — the barcode is now stripped to
bare digits and length-gated before it's sent to Harmony or queried against
MusicBrainz. If the Discogs **Barcode** field holds a catalogue number or "none"
(not a real barcode), the Harmony button still opens a URL-only lookup and MagicISRC
reports "no barcode" instead of failing silently.
