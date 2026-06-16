// Build the GitHub Pages install index.
//
// Scans scripts/<slug>/<slug>.user.js, parses each metadata block, copies every
// script folder into site/<slug>/ (so install + icon URLs resolve on Pages), and
// writes site/index.html listing every script with an Install button.
//
// Dependency-free — Node built-ins only.  Run: node tools/build-index.mjs
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  readdirSync,
  statSync,
  mkdirSync,
  rmSync,
  cpSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFile, first } from './lib/meta.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPTS_DIR = join(ROOT, 'scripts');
const SITE_DIR = join(ROOT, 'site');

// Published location — the org Pages URL for Skriptey/Userscripts.
const PAGES_BASE = 'https://skriptey.github.io/Userscripts';
const REPO_URL = 'https://github.com/Skriptey/Userscripts';

const escapeHtml = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

function findScripts() {
  if (!existsSync(SCRIPTS_DIR)) return [];
  const out = [];
  for (const slug of readdirSync(SCRIPTS_DIR).sort()) {
    const dir = join(SCRIPTS_DIR, slug);
    if (!statSync(dir).isDirectory()) continue;
    // Example/template scripts stay in the repo (CONTRIBUTING points new authors
    // at them) but are NOT listed on the Pages install index.
    if (/^example/i.test(slug)) continue;
    // Private scripts: a folder containing a `.privatescript` marker is excluded
    // from the install index. The publish workflow additionally strips such
    // folders from the public mirror entirely, so the script never ships
    // publicly — it lives only in the private dev repo.
    if (existsSync(join(dir, '.privatescript'))) continue;
    const preferred = join(dir, `${slug}.user.js`);
    const file = existsSync(preferred)
      ? preferred
      : readdirSync(dir)
          .filter((f) => f.endsWith('.user.js'))
          .map((f) => join(dir, f))[0];
    if (!file) continue; // folder without a userscript — skip silently
    // A malformed/WIP script must not crash the whole index; `validate` is the
    // strict gate that fails CI on bad metadata.
    try {
      const { meta } = parseFile(file);
      out.push({ slug, dir, file: basename(file), meta });
    } catch (err) {
      console.warn(`⚠ skipping ${slug}: ${err.message}`);
    }
  }
  return out;
}

function card(s) {
  const name = escapeHtml(first(s.meta, 'name') || s.slug);
  const version = escapeHtml(first(s.meta, 'version') || '');
  const desc = escapeHtml(first(s.meta, 'description') || '');
  const author = escapeHtml(first(s.meta, 'author') || '');
  const targets = []
    .concat(s.meta.match || [], s.meta.include || [])
    .map((m) => `<code>${escapeHtml(m)}</code>`)
    .join(' ');
  const installUrl = `${PAGES_BASE}/${s.slug}/${s.file}`;
  const readmeUrl = existsSync(join(s.dir, 'README.md'))
    ? `${REPO_URL}/blob/main/scripts/${s.slug}/README.md`
    : '';
  const sourceUrl = `${REPO_URL}/tree/main/scripts/${s.slug}`;
  return `      <article class="card">
        <header>
          <h2>${name}</h2>
          ${version ? `<span class="badge">v${version}</span>` : ''}
        </header>
        ${desc ? `<p class="desc">${desc}</p>` : ''}
        <dl class="meta">
          ${author ? `<dt>Author</dt><dd>${author}</dd>` : ''}
          ${targets ? `<dt>Runs on</dt><dd class="targets">${targets}</dd>` : ''}
        </dl>
        <div class="actions">
          <a class="install" href="${installUrl}">Install</a>
          ${readmeUrl ? `<a class="readme" href="${readmeUrl}">Readme</a>` : ''}
          <a class="source" href="${sourceUrl}">Source</a>
        </div>
      </article>`;
}

function page(scripts) {
  const cards = scripts.length
    ? scripts.map(card).join('\n')
    : '      <p class="empty">No userscripts published yet.</p>';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Skriptey Userscripts</title>
  <meta name="description" content="A collection of browser userscripts by Skriptey.">
  <style>
    :root { color-scheme: light dark; --accent:#6750a4; --fg:#1c1b1f; --bg:#fdfcff; --card:#fff; --muted:#5f5f66; --line:#e3e1e8; }
    @media (prefers-color-scheme: dark) { :root { --fg:#e6e1e9; --bg:#141318; --card:#1e1c22; --muted:#a8a4ad; --line:#33313a; } }
    * { box-sizing: border-box; }
    body { margin:0; font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; color:var(--fg); background:var(--bg); }
    .wrap { max-width:960px; margin:0 auto; padding:2.5rem 1.25rem 4rem; }
    header.site h1 { margin:0 0 .25rem; font-size:2rem; }
    header.site p { margin:0; color:var(--muted); }
    .note { background:rgba(103,80,164,.08); border:1px solid var(--line); border-radius:10px; padding:.8rem 1rem; font-size:.9rem; margin:1.5rem 0 2rem; }
    .grid { display:grid; gap:1rem; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); }
    .card { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:1.1rem 1.2rem; display:flex; flex-direction:column; }
    .card header { display:flex; align-items:baseline; gap:.6rem; margin-bottom:.4rem; }
    .card h2 { margin:0; font-size:1.15rem; }
    .badge { font-size:.75rem; color:var(--accent); border:1px solid var(--accent); border-radius:999px; padding:.05rem .5rem; white-space:nowrap; }
    .desc { margin:.2rem 0 .8rem; }
    dl.meta { margin:0 0 1rem; display:grid; grid-template-columns:auto 1fr; gap:.15rem .6rem; font-size:.85rem; }
    dl.meta dt { color:var(--muted); }
    dl.meta dd { margin:0; }
    .targets code { font-size:.78rem; background:rgba(127,127,127,.14); padding:.05rem .35rem; border-radius:5px; }
    .actions { margin-top:auto; display:flex; gap:.6rem; }
    a.install { background:var(--accent); color:#fff; text-decoration:none; padding:.45rem .9rem; border-radius:9px; font-weight:600; }
    a.readme, a.source { color:var(--accent); text-decoration:none; padding:.45rem .6rem; align-self:center; }
    a:hover { filter:brightness(1.08); }
    footer { margin-top:3rem; color:var(--muted); font-size:.85rem; }
    .empty { color:var(--muted); }
  </style>
</head>
<body>
  <div class="wrap">
    <header class="site">
      <h1>Skriptey Userscripts</h1>
      <p>A collection of browser userscripts.</p>
    </header>
    <div class="note">
      New here? Install a userscript manager first —
      <a href="https://www.tampermonkey.net/">Tampermonkey</a> or
      <a href="https://violentmonkey.github.io/">Violentmonkey</a> — then click <strong>Install</strong>.
    </div>
    <main class="grid">
${cards}
    </main>
    <footer>
      Source &amp; issues on <a href="${REPO_URL}">GitHub</a>. Licensed under GPL-3.0-or-later.
    </footer>
  </div>
</body>
</html>
`;
}

function build() {
  const scripts = findScripts();
  rmSync(SITE_DIR, { recursive: true, force: true });
  mkdirSync(SITE_DIR, { recursive: true });
  for (const s of scripts) {
    cpSync(s.dir, join(SITE_DIR, s.slug), { recursive: true });
  }
  writeFileSync(join(SITE_DIR, 'index.html'), page(scripts));
  writeFileSync(join(SITE_DIR, '.nojekyll'), ''); // serve files verbatim, incl. any leading-underscore names
  console.log(`Built site/ with ${scripts.length} script(s):`);
  for (const s of scripts) console.log(`  - ${s.slug} (v${first(s.meta, 'version') || '?'})`);
}

build();
