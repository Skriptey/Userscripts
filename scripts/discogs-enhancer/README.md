# Discogs Enhancer

A **Discogs sibling of [ITAM Enhancer](../ITAMenhancer/)**. Discogs is a release
**database** (not a streaming player), so the feature set is reframed: rather than
surfacing hidden data (Discogs already shows it all), it gives a **structured,
copy/export-friendly panel** and **cross-links** on [discogs.com](https://www.discogs.com)
release pages — the **barcode**, **catalogue number**, **label**, **format**, **genres**,
and the **full credits**, with one-click copy, a **[Harmony](https://harmony.pulsewidth.org.uk/)**
cross-service lookup, and a **[MagicISRC](https://magicisrc.kepstin.ca/)** link when the
release carries ISRCs. Uses Discogs' **public, no-auth API**.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) or
   [Violentmonkey](https://violentmonkey.github.io/).

   ➡️ **[Install Discogs Enhancer](https://skriptey.github.io/Userscripts/discogs-enhancer/discogs-enhancer.user.js)**

2. Open any Discogs **release** page (`/release/<id>`).

## What it does

- **Inline header buttons** — **Release info & credits** (opens the panel) and
  **Harmony ↗**; a floating **Discogs ▾** launcher is always available.
- **Structured panel** — barcode, label / catalogue number, **format** (Vinyl / CD /
  File + descriptors), year, country, genres / styles, ISRCs (when present), the
  **tracklist** (with per-track **writers** where Discogs has them), and the **full
  credits** grouped by role.
- **One-click copy / export** — barcode, ISRCs, **all credits**, or the whole record
  **as JSON**.
- **Harmony lookup** — opens a Harmony release lookup for the Discogs release + its
  barcode. Discogs stores barcodes **exactly as printed** on the release (e.g.
  `4 943674 060023`), so before it's handed to Harmony the barcode is **normalised to
  a bare digit string** (spaces/hyphens stripped, length-gated to a plausible GTIN) —
  Harmony's `?gtin=` rejects any non-numeric value. The panel, **Copy barcode**, and
  the JSON export keep the original, human-formatted value; only the Harmony/MB
  handoff is normalised.
- **MagicISRC** — only shown when the release actually carries ISRCs (rare on Discogs):
  resolves the MusicBrainz release by barcode (same normalised digit string, since
  MusicBrainz's search also needs a bare barcode), then opens MagicISRC.

## Settings

Userscript-manager menu (labels update live): **Show release info & ISRCs**, **Show
credits**, **Integrate Harmony lookup**.

## Notes

- **Barcode normalisation (v1.0.2):** Discogs' `identifiers[]` stores the barcode as
  printed on the release, so raw values can contain spaces, hyphens, or scanner
  cruft (`4 943674 060023`, `5-099920-573621`, `CDP 7 46001 2`). Before the Harmony
  and MusicBrainz handoffs the barcode is stripped to bare digits and length-gated to
  a plausible GTIN (8/12/13/14 digits) — a value that isn't plausibly a GTIN after
  stripping (a catalogue number, `none`, etc.) is sent as **nothing** rather than
  junk, so Harmony still opens (URL-only lookup) and MagicISRC shows an accurate "no
  barcode" message instead of a doomed network call. Fixes Harmony's previous
  `GTIN '…' contains invalid non-numeric characters` error on spaced barcodes.
- **No cover-art download:** Discogs release **images require an authenticated user
  token**, so they're out of scope for this no-auth v1.
- Discogs asks for a **descriptive User-Agent** (it throttles generic ones), which a
  browser can't set on `fetch()` — so the script uses `GM_xmlhttpRequest` (which can) +
  `@connect api.discogs.com`.

## Security & permissions

- **Grants:** `GM_xmlhttpRequest` (Discogs API + the MusicBrainz lookup), `GM_addStyle`,
  `GM_setClipboard`, the menu/storage grants, `GM_notification`, `GM_info`.
- **`@connect`:** `api.discogs.com` (release data) and `musicbrainz.org` (barcode lookup
  for MagicISRC — only on click, sends just the public barcode). No tokens.
- **No unsafe DOM / no data exfiltration:** all UI is built with `textContent`; no
  `@require`, no remote code.

## License

GPL-3.0-or-later — see the repository [LICENSE](../../LICENSE).
