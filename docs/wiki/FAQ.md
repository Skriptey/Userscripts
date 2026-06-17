# FAQ

Common questions about the Skriptey userscripts. Script-specific entries are
grouped by script.

## General

**Q. Do I need a userscript manager?**
Yes — [Tampermonkey](https://www.tampermonkey.net/) or
[Violentmonkey](https://violentmonkey.github.io/). Tampermonkey is recommended
for scripts that download files (best `GM_xmlhttpRequest`/`GM_download` support).

**Q. Are the scripts safe to read?**
Yes. They ship verbatim — no build step, no minification. Read the `.user.js`
before installing; each declares its permissions in the metadata block.

**Q. How do updates work?**
Each script's `@updateURL` points at its published copy, so your manager
auto-updates it. The version bumps on every change.

---

## ITAM Enhancer

**Q. Do I need to log into Apple Music?**
No. It reuses the web player's own access, so anonymous catalog data — formats,
barcode, ISRCs — works logged out. If you _are_ logged in, your own
Music-User-Token is sent too, so library/region-gated items also resolve. You
never paste or enter anything.

**Q. Where do the format badges / barcode / ISRCs come from?**
One call to Apple's catalog API returns `audioTraits` (formats), `upc` (barcode)
and per-track `isrc` — the same data the player has, just surfaced.

**Q. Does it work on Apple Music Classical?**
Yes. **Apple Music Classical** (`classical.music.apple.com`) is the same web stack
on the same catalog, so everything works there too — formats, barcode, ISRCs,
cover art and all. Classical releases also name each track's parent **work**, so
the panel adds an extra **Work** column (turn it off with **Classical Work
column** in the menu).

**Q. What about old `itunes.apple.com` links?**
They just work — you don't need to do anything. Apple redirects every legacy
iTunes Store / iTunes Preview music link to `music.apple.com` before the page
loads, so you land on Apple Music, where the script runs.

**Q. What's the "Work" column in the track table?**
On classical releases each track belongs to a larger **work** (e.g. a symphony or
opera act); the **Work** column shows it so you can see the grouping at a glance.
It only appears when at least one track names a work, and rows without one stay
blank — so ordinary pop/rock albums never show it.

**Q. Why do some tracks show their own formats in the panel?**
A track can carry formats the album-level set doesn't — e.g. a single Dolby Atmos
or Spatial Audio track on an album that's otherwise stereo. When that happens, the
panel's track table adds a **Formats** column and shows badges for the tracks that
**differ** (rows that match the album stay blank, and the column is hidden entirely
when every track matches). Turn it off with **Per-track formats column** in the
menu.

**Q. "Submit to MagicISRC" used to open a blank page — what changed?**
MagicISRC attaches ISRCs to a specific **MusicBrainz release**, so an ISRC list
alone isn't enough. Now, when you click **Submit to MagicISRC ↗**, the script
looks the release up by the album's **barcode** on MusicBrainz and opens MagicISRC
pre-filled with that release and its ISRCs. If the album has no barcode, or
MusicBrainz doesn't have a release for that barcode yet, you'll get a message to
use the **Harmony** button to match or add the release first — it won't open
MagicISRC blank. The MusicBrainz lookup happens only when you click the button.

**Q. The "Animated cover-art resolution" menu item looked like it did nothing.**
It opens a small **prompt** — type `L`, `XL`, or `Max` (1080 / 2160 / highest) and
it saves your choice. In current Tampermonkey/Violentmonkey the menu label now also
updates live to show the value you picked (older managers refresh it on the next
page load).

**Q. Do the settings-menu toggles update live now?**
Yes. In current Tampermonkey and Violentmonkey each toggle flips its `…: on/off`
label immediately — the menu even stays open, so you can flip several in a row.
Managers without live-menu support refresh the labels on the next page load. The
on-page badges/columns/buttons are added when the page loads, so **reload** to
apply a toggle to what's already on screen.

**Q. The badges didn't appear on an album.**
Apple Music's layout class names change often, so inline badge placement is
best-effort. The floating **ITAM ▾** button always opens the panel with formats,
barcode and ISRCs regardless. You can also toggle "Auto format badges" off.

**Q. Where are the new Barcode / Cover art / Harmony buttons?**
On an album page they appear as a small button row in the header, just after the
format badges: **Barcode & ISRCs**, **Download cover art**, and **Harmony ↗**.
The same actions are also in the **ITAM ▾** panel. Each can be turned off
individually from your userscript manager's menu.

**Q. What does the Harmony button do?**
It opens a [Harmony](https://harmony.pulsewidth.org.uk/) release lookup for the
album across multiple services (MusicBrainz, Deezer, iTunes, Spotify, Tidal,
Qobuz, Beatport, Discogs), with the album's barcode (UPC) pre-filled for a
stronger match. Toggle it with "Integrate Harmony lookup".

**Q. What quality is the downloaded cover art?**
Static art is the highest resolution Apple exposes (the artwork's native
dimensions), saved as `<artist> - <album>_Cover.jpg`.

**Q. Can I download animated (motion) cover art?**
Yes — when an album has it, the **Download cover art** button becomes a dropdown:
**Static**, **Square animated**, **Vertical animated**, or **All**. Animated
covers save as `.mp4` (`<artist> - <album>_SquareCover.mp4` /
`…_VerticalCover.mp4`). **All** bundles them into `<artist> - <album>_CoverArt.zip`
(at the L resolution). Pick the resolution with the **Animated cover-art
resolution** menu item — **L** (1080) / **XL** (2160) / **Max** (highest); note
XL and Max are **very large** (hundreds of MB), so at those sizes the animated
files download separately instead of zipping.

**Q. Can I download lyrics?**
Yes — when you're **logged in to Apple Music**, the **Download Lyrics** button (in the
header and the panel) offers whatever the release actually has: **Word-by-Word** (Apple
Music “Sing”), **Line-by-Line** (time-synced), and **Static** (plain text). Word and
line save as `.lrc` (word-by-word as enhanced “A2” LRC), static as `.txt`. An album
bundles every track into a ZIP with files named `<disc> - <track> - <title>.<ext>`; a
single song saves one file. If you're not logged in, or the release has no lyrics, the
button isn't shown. Lyrics need your **logged-in subscription** (Apple gates them behind
your account) and are licensed content, so the export is for **personal use** only.

**Q. The Download Lyrics button isn't showing.**
It only appears when you're **logged in to Apple Music** _and_ the release has lyrics
(it's deliberately hidden otherwise). Make sure you're signed in, then reload. Word-by-
word lyrics also only exist for songs Apple has “Sing” data for — other songs still
offer Line-by-Line and Static.

**Q. I picked Word-by-Word but some tracks aren't word-synced — what happens?**
Each track **automatically falls back** to the next-best format it actually has:
**Word-by-Word → Line-by-Line → Static** (and **Line-by-Line → Static**). So an album
where only some tracks have “Sing” lyrics still downloads complete — word-synced where
available, line-synced or plain text otherwise. The confirmation toast tells you if any
tracks fell back. Tracks with no lyrics at all are skipped, and any error is shown as a
toast (so a download can't silently do nothing).

**Q. Download Lyrics shows “Fetching…” then nothing happens — no file, no message.**
It should always end in a toast now (“Lyrics saved ✓”, “No lyrics returned…”, or an
error). If it still seems to stall, open the browser **console** (F12 → Console): on
every attempt ITAM logs the request URL (`[ITAM] lyrics fetch → …`) and the per-track
outcome (`ok`, an HTTP status, `timeout`, or `no ttml`) — never the lyrics themselves.
Each request now has a **15-second timeout**, so a non-responding lyrics endpoint reports
`timeout` instead of hanging forever. If you see `timeout` or a `401`/`403` for every
track, your Apple Music **Music-User-Token** likely wasn't picked up — reload the Apple
Music tab while logged in and retry; the console line tells us exactly which it is.

**Q. What does “Find ISWCs” do?**
Apple shows the **writers** of a song but not its **ISWC** (the International Standard
Musical Work Code — the composition's counterpart to a recording's ISRC). **Find ISWCs**
looks each track up from **MusicBrainz** (and, when MusicBrainz has none, **credits.fm**)
by title + writer, and shows a table with each track's best **candidate ISWC**, a
**confidence** (high/medium/low), the **source**, one-click copy, and a **“Seed MB ↗”**
button that opens a **pre-filled MusicBrainz edit** for you to review and submit. It runs
only when you click, sends only the public title/writer (no account tokens), and **never
writes to MusicBrainz by itself** — you always confirm. Matching by title + writer isn't
perfect, so **verify the writers** before seeding; credits.fm values are hints, not facts.
You can turn each source off in the menu.

**Q. It says it couldn't get the token.**
Reload the page (the player must have initialised). If it persists, use the
menu's "Clear cached Apple Music token". Apple occasionally moves the token —
see the maintainer notes in the README.

---

## BunkrDL

**Q. Is this legal? Should I use it?**
BunkrDL is a download convenience tool — it does the same thing your browser
already can, just in bulk. **Only download content you have the right to keep,
for personal/offline use**, and respect creators, copyright, and each site's
terms of service. Don't redistribute what you download.

**Q. The Bulk Download button doesn't show on an album page.**
Reload — the script retries for a few seconds while the toolbar renders. If the
site's _Advanced Filters_ control is missing or renamed, BunkrDL falls back to a
floating button in the bottom-right corner.

**Q. It says “Could not read this album's file list.”**
Bunkr probably changed the album page. Reload first. If it persists, the embedded
`window.albumFiles` format likely changed — see the maintenance notes in the
[README](https://github.com/Skriptey/Userscripts/blob/main/scripts/BunkrDL/README.md#how-it-works-for-maintainers).

**Q. Downloads fail, stall, or stop partway.**
Usually Bunkr rate limiting — BunkrDL backs off and retries automatically.
Raise **Delay between files** in settings. If _every_ file fails, Bunkr likely
changed its download API; check the maintenance notes. The exact failure reason
now shows **in the progress panel** (a red **❌ message**) and in the **browser
console** (`F12` → Console → a `[BunkrDL] … failed: …` line) — include it when
reporting. Requests also time out (≈45 s) instead of hanging forever at "0 B".

**Q. Which Bunkr domains are supported?**
All of them — any `bunkr.<tld>` (and the double-r legacy `bunkrr.<tld>`), on any
subdomain, plus balbums.st. Media is fetched from Bunkr's CDN (`cdn.cr`); the
script's cross-origin access is scoped to those hosts (no wildcard).

**Q. My userscript manager keeps asking to allow cross-origin requests.**
Choose **Always allow** for the Bunkr domain the first time. The script only
connects to Bunkr's API, the resolved CDN URLs, and (for balbums) the linked
album page.

**Q. The tab runs out of memory on a huge album.**
ZIPs are built in the tab, so peak memory is ~2× the **Max ZIP size**. Lower it,
or turn **ZIP bundling** off to stream each file straight to disk.

**Q. The "Zipping…" step takes a while — is it stuck?**
Building a large ZIP happens in the browser tab, so it's the slow part of a big
album (the downloads already finished). The current-file bar shows a moving
**sheen** while it's actively packing — so a live build looks different from a
frozen one — plus a **percentage** when JSZip reports one. If a ZIP fails to build
(usually the tab hitting a memory limit), it now shows **❌ `<name>: <reason>`** on
the panel and a `[BunkrDL] ZIP build failed` line in the console, instead of
stalling silently. To skip the wait on huge albums, lower **Max ZIP size** or turn
**ZIP bundling** off (saves each file individually, no zipping).

**Q. I clicked a toggle (ZIP bundling, Compression, Pre-flight, …) and nothing seemed to happen.**
Those are **one-click toggles**: a single click flips and saves the setting straight
away (you'll get a brief "BunkrDL: …" toast), and it takes effect immediately. Only
the menu's "(current: …)" **label** can't repaint while the menu is open — it
refreshes the next time you open the menu. (The numeric/list settings open a prompt
instead, which is why they feel more obviously interactive.)

**Q. How are the ZIPs named?**
`<AlbumName>_1.zip`, `<AlbumName>_2.zip`, … from the album's title (e.g.
`TravelVids.xyz_1.zip`).

**Q. Can I download just videos (or just images)?**
Yes — that's exactly what the dropdown options are for. _Download All_ grabs
everything.

**Q. Does it use "Advanced View" and sort by size like I asked?**
Yes — effectively. The complete file list only exists on the album's advanced
view (`?advanced=1`), so BunkrDL fetches that page in the background to get
every file (this is the "Advanced View" step, without navigating you away), then
sorts by size internally (largest-first, which also packs ZIPs better). It reads
the data rather than clicking the on-page buttons because that's more reliable
than driving a UI Bunkr changes often — but the outcome is the same.

**Q. My download was interrupted (tab closed / some files failed). Do I start
over?**
No. Resume is on by default — re-run the **same album** and BunkrDL skips files
it already saved, continues the ZIP numbering, and only fetches what's missing.
Failed files aren't marked done, so they're retried. To start fresh, use **Clear
resume data** in the menu.

**Q. Can I download faster?**
Raise **Parallel downloads** (1–8) in settings. It's faster but increases the
chance of hitting Bunkr's rate limiting, so increase it gradually.

**Q. Can I download a single file, not a whole album?**
Yes, two ways: (1) on the album page, each file card has a **⬇ Download** button
that grabs just that file; (2) on the file's own page (`/f/…`, `/v/…`, etc.) use
the floating **⬇ BunkrDL — Download** button. Either saves that one file
directly (no ZIP).

**Q. What are the sort / infinite-scroll / hover-preview features on the album
index?**
On the listing sites (**balbums.st** / **bunkr-albums.io**) BunkrDL adds, on top
of the per-card download button: a **sort dropdown** (Default / Name A–Z / File
count), **infinite scroll** (auto-loads the next page near the bottom), and
**hover previews** (hover an album card to see thumbnails of its contents — click
one to open that file). Each is an independent menu toggle, and each quietly does
nothing if the page layout isn't recognised, so they can never break downloading.

**Q. I cancelled a no-ZIP download — did I lose the files already downloaded?**
No (as of v1.7.0). When you cancel, BunkrDL stops fetching new files but still
**saves everything it had already downloaded** and queued, so completed files
aren't wasted. Only the in-progress and not-yet-started files are skipped.

**Q. Spaces in my filenames show up as `+` or `%20`. Can that be fixed?**
BunkrDL already decodes them — `My+File%20(1).mp4` is saved as
`My File (1).mp4`, both for ZIP entries and individual downloads.

**Q. I get dozens of "Save" prompts on a huge album.**
Turn on **Save via GM_download** in settings — the userscript manager then saves
files to your download folder without a per-file dialog.

## MetaIncDL

**Q. Is this safe for my account?**
MetaIncDL runs on your **real, logged-in** Instagram/Facebook/Threads account and
only reads what your session can already see. Aggressive bulk grabbing can trip
Meta's anti-automation and put a **checkpoint/challenge** on your account, so the
defaults are deliberately conservative (slow pacing, a per-window request cap, a
200-item feed cap) and MetaIncDL **hard-stops** the instant it sees a checkpoint.
Only download your own / authorised content, and don't raise the limits casually.

**Q. It says "interact with the page to arm MetaIncDL."**
MetaIncDL reuses the page's own session and queries — it needs the relevant request
to have fired first. **Scroll the profile (or open the tab/post) once**, then
retry. On a cold route the query simply hasn't happened yet.

**Q. The download stopped and mentions a checkpoint/challenge.**
Stop. Open the site normally, clear the challenge, wait a while, and raise the
**Delay between pages** / lower the **Feed item cap** before trying again.

**Q. Why are some images saved as PNG (or still webp)?**
MetaIncDL always tries the **native JPEG** variant first. If only webp is available
it converts per your **webp fallback** setting — **PNG** (default, lossless),
**JPG**, or **keep** (the original `.webp`). Both PNG and JPG **carry any EXIF
across** (PNG via an `eXIf` chunk, JPG via APP1). Meta usually strips original
camera EXIF on upload, so there's often only a colour profile to keep.

**Q. Does it get Stories / Highlights of other people?**
Only ones your session can already view, and only after you confirm the one-time
**"I'm authorised"** gate (which you can disable in settings). Use responsibly.

**Q. It's labelled beta — what does that mean?**
Meta's internal endpoints and GraphQL `doc_id`s rotate and can't be tested
without a live logged-in browser. Some surfaces (especially Facebook) may need
tuning. Please report what works and what doesn't.
