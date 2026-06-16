# `docs/`

Long-form documentation for this repository.

## `docs/wiki/` — source for the GitHub Wiki

The Markdown files in [`wiki/`](wiki/) are the **source of truth for the project
[GitHub Wiki](https://github.com/Skriptey/Userscripts/wiki)**. They live in the
main repo (committed, portable across devices) and are mirrored to the wiki.

GitHub wikis are a separate git repository (`<repo>.wiki.git`). Page file names
map to wiki page titles; `Home.md` is the landing page, `_Sidebar.md` is the
navigation sidebar.

### Publish / update the wiki

The wiki must be initialised once via the web UI (open the repo's **Wiki** tab
and create the first page), then it can be pushed to like any repo:

```bash
# one-time: clone the wiki repo next to this one
git clone https://github.com/Skriptey/Userscripts.wiki.git

# each update: copy the source pages over and push
cp docs/wiki/*.md Userscripts.wiki/
cd Userscripts.wiki
git add -A && git commit -m "Sync wiki from docs/wiki" && git push
```

> Pushing to the wiki is a manual step left to a maintainer (it touches a
> separate remote). A CI sync action could be added later if desired.

Keep these pages in step with the scripts — see the **annotations & docs**
standing task in [`.claude/CLAUDE.md`](../.claude/CLAUDE.md).
