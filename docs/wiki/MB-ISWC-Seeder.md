# MB ISWC Seeder

The **MusicBrainz-side companion** to [ITAM Enhancer](ITAMenhancer)'s **Find ISWCs**.
ITAM (on Apple Music) resolves a track's **ISWC** and opens a MusicBrainz **Work**
edit/create page; this script runs on [musicbrainz.org](https://musicbrainz.org) and
surfaces the ISWC + **writers** ITAM passed, with one-click copy, to speed up adding
the work and its writer relationships.

> **It never edits MusicBrainz for you.** You add the relationships and click
> **Enter edit** yourself — that's what keeps it a normal, compliant human edit
> (unattended editing would need a registered MusicBrainz Bot account).

- **Install:** <https://skriptey.github.io/Userscripts/mb-iswc-seeder/mb-iswc-seeder.user.js>
  (install **[ITAM Enhancer](ITAMenhancer)** too — this is its companion)
- **Source & README:** [`scripts/mb-iswc-seeder/`](https://github.com/Skriptey/Userscripts/tree/main/scripts/mb-iswc-seeder)

## How to use

1. In ITAM Enhancer, on an Apple Music album/song, click **Find ISWCs**.
2. For a track, click **Seed MB ↗** — a MusicBrainz Work page opens with the **ISWC
   pre-filled** (by MusicBrainz's own form seeding) and a small **helper panel**
   showing the ISWC, title and **writers** ITAM found.
3. Copy each writer from the panel and add it as a **“writer” relationship** in the
   **Relationships** section, review everything, then click **Enter edit**.

## Settings

| Setting          | Default | Notes                                                       |
| ---------------- | ------- | ----------------------------------------------------------- |
| ISWC seed helper | on      | Show/hide the helper panel (manager menu; reload to apply). |

## Notes

- It only activates on a Work create/edit page opened from ITAM (`?itam=1`); it's
  inert everywhere else.
- **No network, no tokens** — it just reads the URL and renders a panel (`textContent`
  only). See the per-script
  [README](https://github.com/Skriptey/Userscripts/blob/main/scripts/mb-iswc-seeder/README.md).
