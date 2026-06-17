# MB ISWC Seeder

The **MusicBrainz-side companion** to [ITAM Enhancer](../ITAMenhancer/)'s **Find
ISWCs** feature. ITAM (on Apple Music) finds a track's **ISWC** and opens a
MusicBrainz **Work** edit/create page via a “Seed MB ↗” deep-link; this script runs
on [musicbrainz.org](https://musicbrainz.org) and surfaces the ISWC and **writers**
ITAM passed along, with one-click copy, so you can add the work + writer relationships
quickly — **you always review and submit.**

> It **never edits MusicBrainz automatically.** Automated/unattended editing requires
> a registered MusicBrainz **Bot** account; keeping a human on every “Enter edit” is
> what makes this a normal, compliant human edit.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) or
   [Violentmonkey](https://violentmonkey.github.io/), and **ITAM Enhancer** (this is
   its companion — it does nothing on its own).

   ➡️ **[Install MB ISWC Seeder](https://skriptey.github.io/Userscripts/mb-iswc-seeder/mb-iswc-seeder.user.js)**

2. In ITAM Enhancer, click **Find ISWCs** → **Seed MB ↗** on a track. The
   MusicBrainz edit page opens with the ISWC pre-filled and this helper showing the
   writers.

## What it does

- On a MusicBrainz **Work create/edit** page that was opened from ITAM (the deep-link
  carries `?itam=1` plus the ISWC/title/writers), it shows a small **helper panel**:
  - the **ISWC** MusicBrainz has pre-filled (one-click copy),
  - the **work title**, and
  - the **writers** ITAM found, split into a list — **copy each** to paste as a
    “writer” relationship in the Relationships section.
- It guides you to add the writer relationships and submit; the **ISWC field itself is
  pre-filled by MusicBrainz's own form seeding** (`edit-work.iswcs.0`).
- It does **nothing** on any page that wasn't seeded by ITAM.

## Settings

| Setting          | Default | Notes                                                         |
| ---------------- | ------- | ------------------------------------------------------------- |
| ISWC seed helper | `on`    | Show/hide the helper panel (userscript-manager menu; reload). |

## Security & permissions

- **No network requests, no tokens, no `@connect`.** It only reads the page **URL**
  (the `itam-*` query params) and renders a panel. The writer credit is split and
  shown as text.
- **Grants:** `GM_addStyle` (panel styling), `GM_setClipboard` (copy buttons),
  `GM_registerMenuCommand`/`GM_getValue`/`GM_setValue` (the toggle), `GM_notification`
  (copy confirmation).
- **No unsafe DOM:** the panel is built with `textContent` only (no `innerHTML`), so
  the URL-sourced ISWC/title/writers can't become an injection sink.
- **Read-only toward MusicBrainz:** it never fills the relationship editor or submits
  an edit — you do every edit yourself.

## License

GPL-3.0-or-later — see the repository [LICENSE](../../LICENSE).
