// ==UserScript==
// @name          Discogs Enhancer
// @namespace     https://github.com/Skriptey/Userscripts
// @version       1.0.0
// @description   Discogs Enhancer — on discogs.com release pages, gives a clean structured panel + one-click copy/export of the barcode, catalog number, label, format and the full credits, plus a Harmony cross-service lookup (and a MagicISRC link when ISRCs are present). A Discogs-flavoured sibling of ITAM Enhancer (public no-auth API).
// @author        Skriptey
// @license       GPL-3.0-or-later
// @match         https://www.discogs.com/*
// @run-at        document-idle
// @grant         GM_xmlhttpRequest
// @grant         GM_addStyle
// @grant         GM_setClipboard
// @grant         GM_registerMenuCommand
// @grant         GM_unregisterMenuCommand
// @grant         GM_getValue
// @grant         GM_setValue
// @grant         GM_notification
// @grant         GM_info
// @connect       api.discogs.com
// @connect       musicbrainz.org
// @icon          https://www.discogs.com/favicon.ico
// @homepageURL   https://github.com/Skriptey/Userscripts/tree/main/scripts/discogs-enhancer
// @supportURL    https://github.com/Skriptey/Userscripts/issues
// @downloadURL   https://skriptey.github.io/Userscripts/discogs-enhancer/discogs-enhancer.user.js
// @updateURL     https://skriptey.github.io/Userscripts/discogs-enhancer/discogs-enhancer.user.js
// ==/UserScript==

// SPDX-License-Identifier: GPL-3.0-or-later
//
// ATTRIBUTION / PRIOR ART
// -----------------------
// Original implementation, no code copied. The Discogs sibling of this repo's ITAM
// Enhancer (Apple Music). Discogs is a release DATABASE, not a streaming player, so the
// feature set is reframed: rather than surfacing hidden data (Discogs already shows it
// all on the page), it gives a structured, copy/export-friendly panel and cross-links.
//
// ===========================================================================
//  Discogs Enhancer — how it works (verified live against api.discogs.com 2026-06-17)
// ===========================================================================
//
//  Discogs exposes a PUBLIC REST API at api.discogs.com that is CORS-open
//  (Access-Control-Allow-Origin: *). Discogs asks for a descriptive User-Agent (it
//  throttles generic ones), which browsers can't set on fetch() — so we use
//  GM_xmlhttpRequest (which can set User-Agent) + @connect api.discogs.com.
//
//    • DATA — GET /releases/<id>. Fields used: `identifiers` (Barcode + others; we
//      also scan for any ISRC), `labels[].catno` + name (catalogue number/label),
//      `formats` (physical format — Vinyl / CD / File + descriptors), `genres`,
//      `styles`, `year`, `country`, release-level `extraartists` and per-track
//      `tracklist[].extraartists` (the full credits, grouped by role).
//    • Harmony — opens a Harmony cross-service lookup for the Discogs release URL +
//      barcode (Harmony accepts Discogs release URLs).
//    • MagicISRC — only when the release actually carries ISRCs (rare on Discogs); it
//      resolves the MusicBrainz release MBID from the barcode (GM_xmlhttpRequest + the
//      required descriptive User-Agent → @connect musicbrainz.org), then opens MagicISRC.
//
//  NOT covered: Discogs release IMAGES require an authenticated user token, so cover-art
//  download is out of scope for this no-auth v1.
//
//  Every feature is independently toggleable from the userscript-manager menu (live
//  labels). Discogs is a single-page app, so a route observer re-runs the header logic
//  on navigation; the reliable UI lives in a body-mounted panel.
//
//  This script ships verbatim (no build step). Keep these comments accurate when you
//  edit it — see the repo standing task on annotations.
// ===========================================================================

(function () {
  'use strict';

  if (window.__discogsEnhancer_loaded) return;
  window.__discogsEnhancer_loaded = true;

  // -------------------------------------------------------------------------
  //  Section 1 — constants & settings
  // -------------------------------------------------------------------------

  const API = 'https://api.discogs.com';
  const APP_UA = `DiscogsEnhancer/${(typeof GM_info !== 'undefined' && GM_info?.script?.version) || '1.0.0'} +https://github.com/Skriptey/Userscripts`;

  const HARMONY_BASE = 'https://harmony.pulsewidth.org.uk';
  const HARMONY_PROVIDERS = [
    'musicbrainz',
    'discogs',
    'deezer',
    'itunes',
    'spotify',
    'tidal',
    'qobuz',
    'beatport',
  ];

  const MAGICISRC_BASE = 'https://magicisrc.kepstin.ca/';
  const MUSICBRAINZ_BASE = 'https://musicbrainz.org/ws/2';

  const DEFAULTS = {
    showInfo: true, // FEATURE: barcode / catno / label / format / genres panel + button
    showCredits: true, // FEATURE: full credits (release + per-track), grouped by role
    harmonyLookup: true, // FEATURE: Harmony cross-service lookup
  };
  const settings = loadSettings();

  function loadSettings() {
    const s = { ...DEFAULTS };
    for (const k of Object.keys(DEFAULTS)) {
      try {
        const v = GM_getValue(k, undefined);
        if (v !== undefined && v !== null) s[k] = v;
      } catch {
        /* GM storage unavailable */
      }
    }
    return s;
  }
  function saveSetting(k, v) {
    settings[k] = v;
    try {
      GM_setValue(k, v);
    } catch {
      /* ignore */
    }
  }

  const entityCache = new Map();

  // -------------------------------------------------------------------------
  //  Section 2 — small utilities
  // -------------------------------------------------------------------------

  /** Tiny hyperscript helper — textContent only (never innerHTML). */
  function el(tag, props, ...kids) {
    const node = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (k === 'class') node.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
        else if (k === 'text') node.textContent = v;
        else if (k.startsWith('on') && typeof v === 'function')
          node.addEventListener(k.slice(2), v);
        else if (v != null) node.setAttribute(k, v);
      }
    }
    for (const c of kids)
      if (c != null) node.append(c.nodeType ? c : document.createTextNode(String(c)));
    return node;
  }

  function toast(text) {
    try {
      GM_notification({ title: 'Discogs Enhancer', text, silent: true, timeout: 2500 });
    } catch {
      /* ignore */
    }
  }

  function copy(text, label) {
    try {
      GM_setClipboard(String(text ?? ''));
      toast(`${label || 'Copied'} ✓`);
    } catch {
      toast('Copy failed');
    }
  }

  // --- Harmony --------------------------------------------------------------
  function buildHarmonyUrl(url, gtin) {
    const p = new URLSearchParams();
    p.set('url', url);
    p.set('gtin', gtin || '');
    p.set('region', '');
    for (const provider of HARMONY_PROVIDERS) p.set(provider, '');
    return `${HARMONY_BASE}/release?${p.toString()}`;
  }
  function openHarmony(model) {
    window.open(
      buildHarmonyUrl(`https://www.discogs.com/release/${model.id}`, model.barcode),
      '_blank',
      'noopener',
    );
  }

  // --- MagicISRC via a MusicBrainz barcode lookup (explicit click only) ------
  function lookupMusicBrainzMbid(upc) {
    const url = `${MUSICBRAINZ_BASE}/release?query=barcode:${encodeURIComponent(upc)}&fmt=json`;
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        headers: { 'User-Agent': APP_UA, Accept: 'application/json' },
        onload: (res) => {
          if (res.status < 200 || res.status >= 300)
            return reject(new Error(`MusicBrainz HTTP ${res.status}`));
          let data;
          try {
            data = JSON.parse(res.responseText);
          } catch {
            return reject(new Error('MusicBrainz returned non-JSON'));
          }
          const releases = Array.isArray(data.releases) ? data.releases : [];
          if (!releases.length) return resolve(null);
          const official = releases.find((r) => r.status === 'Official');
          resolve((official || releases[0]).id || null);
        },
        onerror: () => reject(new Error('network error')),
        ontimeout: () => reject(new Error('timeout')),
      });
    });
  }
  async function submitToMagicIsrc(model) {
    if (!model.isrcs.length) return;
    if (!model.barcode)
      return toast('No barcode on this release — use the Harmony button to match/add it');
    toast('Looking up MusicBrainz…');
    let mbid;
    try {
      mbid = await lookupMusicBrainzMbid(model.barcode);
    } catch (err) {
      return toast(`MusicBrainz lookup failed: ${err.message}`);
    }
    if (!mbid)
      return toast(
        'No MusicBrainz release for this barcode — use the Harmony button to match/add it',
      );
    const p = new URLSearchParams();
    p.set('mbid', mbid);
    model.isrcs.forEach((c, i) => p.set(`isrc${i + 1}`, c));
    window.open(`${MAGICISRC_BASE}?${p.toString()}`, '_blank', 'noopener');
  }

  // -------------------------------------------------------------------------
  //  Section 3 — Discogs API
  // -------------------------------------------------------------------------

  /** GET a Discogs API path → parsed JSON. GM_xmlhttpRequest lets us send the
   *  descriptive User-Agent Discogs asks for (browsers can't set it on fetch). */
  function apiGet(path) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: `${API}${path}`,
        headers: { 'User-Agent': APP_UA, Accept: 'application/json' },
        onload: (res) => {
          if (res.status < 200 || res.status >= 300)
            return reject(new Error(`Discogs API HTTP ${res.status}`));
          try {
            resolve(JSON.parse(res.responseText));
          } catch {
            reject(new Error('Discogs returned non-JSON'));
          }
        },
        onerror: () => reject(new Error('network error')),
        ontimeout: () => reject(new Error('timeout')),
      });
    });
  }

  async function fetchEntity(page) {
    if (entityCache.has(page.id)) return entityCache.get(page.id);
    const model = parseRelease(await apiGet(`/releases/${page.id}`));
    entityCache.set(page.id, model);
    return model;
  }

  /** Group a credit list ([{role, name}]) by role → [{ role, names:[…] }]. */
  function groupCredits(list) {
    const byRole = new Map();
    for (const c of list || []) {
      const role = c.role || 'Credit';
      const set = byRole.get(role) || new Set();
      if (c.name) set.add(c.name);
      byRole.set(role, set);
    }
    return [...byRole.entries()].map(([role, set]) => ({ role, names: [...set] }));
  }

  function parseRelease(d) {
    const ids = Array.isArray(d.identifiers) ? d.identifiers : [];
    const barcode = (ids.find((i) => i.type === 'Barcode') || {}).value || '';
    // ISRCs are rare on Discogs — scan identifiers whose description mentions ISRC.
    const isrcs = ids
      .filter((i) => /isrc/i.test(i.description || ''))
      .map((i) => (i.value || '').replace(/\s/g, '').toUpperCase())
      .filter(Boolean);
    return {
      kind: 'release',
      id: d.id,
      name: d.title || '',
      artist: d.artists_sort || '',
      barcode,
      isrcs,
      labels: (d.labels || []).map((l) => `${l.name}${l.catno ? ` — ${l.catno}` : ''}`),
      format: (d.formats || [])
        .map((f) => [f.name, ...(f.descriptions || [])].join(' '))
        .join(' · '),
      year: d.year || '',
      country: d.country || '',
      genres: [...(d.genres || []), ...(d.styles || [])].join(', '),
      credits: groupCredits(d.extraartists),
      tracks: (d.tracklist || []).map((t) => ({
        position: t.position || '',
        title: t.title || '',
        duration: t.duration || '',
        writers: (t.extraartists || [])
          .filter((c) => /writ|compos/i.test(c.role || ''))
          .map((c) => c.name),
      })),
    };
  }

  // -------------------------------------------------------------------------
  //  Section 4 — page detection
  // -------------------------------------------------------------------------

  /** Parse the current Discogs URL into { id } or null — only release pages
   *  (discogs.com/release/<id>-<slug>, optionally locale-prefixed). */
  function parsePage() {
    const m = location.pathname.match(/\/release\/(\d+)/);
    return m ? { id: m[1] } : null;
  }

  // -------------------------------------------------------------------------
  //  Section 5 — styling
  // -------------------------------------------------------------------------

  GM_addStyle(`
    .dge-launch { position:fixed; right:16px; bottom:16px; z-index:2147483646;
      background:#333; color:#fff; border:0; border-radius:999px; padding:9px 14px;
      font:600 13px system-ui,-apple-system,sans-serif; cursor:pointer; box-shadow:0 3px 12px rgba(0,0,0,.4); }
    .dge-launch:hover { background:#000; }
    .dge-actions { display:flex; flex-wrap:wrap; gap:8px; margin:10px 0; align-items:center; }
    .dge-chip, .dge-btn { cursor:pointer; background:rgba(127,127,127,.16); color:inherit;
      border:1px solid rgba(127,127,127,.3); border-radius:8px; padding:6px 12px;
      font:600 12px/1 system-ui,-apple-system,sans-serif; text-decoration:none; }
    .dge-chip:hover, .dge-btn:hover { background:#333; color:#fff; border-color:#333; }
    .dge-btn.accent { background:#333; color:#fff; border-color:#333; }
    .dge-overlay { position:fixed; inset:0; z-index:2147483647; background:rgba(0,0,0,.6);
      display:flex; align-items:flex-start; justify-content:center; padding:5vh 12px; }
    .dge-panel { width:760px; max-width:96vw; max-height:90vh; overflow:auto; background:#16161a;
      color:#eee; border:1px solid #2a2a30; border-radius:14px; padding:18px 20px;
      font:14px/1.5 system-ui,-apple-system,sans-serif; box-shadow:0 18px 50px rgba(0,0,0,.7); }
    .dge-panel h2 { margin:0 0 2px; font-size:20px; } .dge-panel h3 { margin:0 0 12px; font-size:14px; color:#9a9a9a; font-weight:500; }
    .dge-row { margin:6px 0; } .dge-row b { color:#9a9a9a; font-weight:600; }
    .dge-mono { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; user-select:all; }
    .dge-table { width:100%; border-collapse:collapse; margin-top:8px; font-size:13px; }
    .dge-table th, .dge-table td { text-align:left; padding:5px 8px; border-bottom:1px solid #24242a; vertical-align:top; }
    .dge-table th { position:sticky; top:0; background:#16161a; color:#9a9a9a; }
    .dge-close { float:right; background:none; border:0; color:#9a9a9a; font-size:22px; cursor:pointer; line-height:1; }
    .dge-foot { margin-top:10px; font-size:11px; color:#777; }
    @media (prefers-color-scheme: light) {
      .dge-panel { background:#fff; color:#1a1a1a; border-color:#ddd; }
      .dge-table th { background:#fff; color:#666; } .dge-table th, .dge-table td { border-bottom-color:#eee; }
      .dge-panel h3, .dge-row b, .dge-foot { color:#666; }
    }
  `);

  // -------------------------------------------------------------------------
  //  Section 6 — UI (header button + panel)
  // -------------------------------------------------------------------------

  function findTitleAnchor(name) {
    const headings = document.querySelectorAll('h1, [role="heading"]');
    if (name) {
      const needle = name.trim().slice(0, 30);
      for (const h of headings) if ((h.textContent || '').includes(needle)) return h;
    }
    for (const h of headings) if ((h.textContent || '').trim()) return h;
    return null;
  }

  function injectHeaderUI(model) {
    if (document.querySelector('.dge-actions')) return;
    const anchor = findTitleAnchor(model.name);
    if (!anchor) return;
    const row = el('div', { class: 'dge-actions' });
    if (settings.showInfo)
      row.append(
        el('button', {
          class: 'dge-chip',
          text: 'Release info & credits',
          onclick: () => openPanel(model),
        }),
      );
    if (settings.harmonyLookup)
      row.append(
        el('button', { class: 'dge-chip', text: 'Harmony ↗', onclick: () => openHarmony(model) }),
      );
    if (!row.children.length) return;
    anchor.insertAdjacentElement('afterend', row);
  }

  function openPanel(model) {
    document.querySelector('.dge-overlay')?.remove();
    const panel = el('div', { class: 'dge-panel' });
    const overlay = el('div', { class: 'dge-overlay' }, panel);
    const close = () => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
    };
    const onKey = (e) => e.key === 'Escape' && close();
    overlay.addEventListener('click', (e) => e.target === overlay && close());
    document.addEventListener('keydown', onKey);

    panel.append(
      el('button', { class: 'dge-close', text: '×', onclick: close, title: 'Close (Esc)' }),
    );
    panel.append(el('h2', { text: model.name || 'Unknown' }));
    panel.append(el('h3', { text: model.artist || '' }));

    const fact = (label, value) =>
      value == null || value === ''
        ? null
        : el(
            'div',
            { class: 'dge-row' },
            el('b', { text: `${label}: ` }),
            el('span', { class: 'dge-mono', text: String(value) }),
          );
    if (settings.showInfo) {
      panel.append(fact('Barcode', model.barcode));
      panel.append(fact('Label / cat#', model.labels.join(' · ')));
      panel.append(fact('Format', model.format));
      panel.append(fact('Year', model.year));
      panel.append(fact('Country', model.country));
      panel.append(fact('Genres / styles', model.genres));
      if (model.isrcs.length) panel.append(fact('ISRCs', model.isrcs.join(', ')));
    }

    // --- action buttons ---
    const actions = el('div', { class: 'dge-actions' });
    if (model.barcode)
      actions.append(
        el('button', {
          class: 'dge-btn',
          text: 'Copy barcode',
          onclick: () => copy(model.barcode, 'Barcode copied'),
        }),
      );
    if (model.isrcs.length) {
      actions.append(
        el('button', {
          class: 'dge-btn',
          text: 'Copy ISRCs',
          onclick: () => copy(model.isrcs.join('\n'), 'ISRCs copied'),
        }),
      );
      actions.append(
        el('button', {
          class: 'dge-btn accent',
          text: 'Submit to MagicISRC ↗',
          onclick: () => submitToMagicIsrc(model),
        }),
      );
    }
    if (settings.showCredits && model.credits.length)
      actions.append(
        el('button', {
          class: 'dge-btn',
          text: 'Copy credits',
          onclick: () =>
            copy(
              model.credits.map((c) => `${c.role}: ${c.names.join(', ')}`).join('\n'),
              'Credits copied',
            ),
        }),
      );
    if (settings.harmonyLookup)
      actions.append(
        el('button', {
          class: 'dge-btn',
          text: 'Look up in Harmony ↗',
          onclick: () => openHarmony(model),
        }),
      );
    actions.append(
      el('button', {
        class: 'dge-btn',
        text: 'Copy as JSON',
        onclick: () => copy(JSON.stringify(model, null, 2), 'JSON copied'),
      }),
    );
    panel.append(actions);

    // --- tracklist ---
    if (model.tracks.length) {
      const hasWriters = model.tracks.some((t) => t.writers.length);
      const table = el('table', { class: 'dge-table' });
      const head = el('tr');
      ['#', 'Title', ...(hasWriters ? ['Writers'] : []), 'Length'].forEach((h) =>
        head.append(el('th', { text: h })),
      );
      table.append(el('thead', {}, head));
      const tbody = el('tbody');
      for (const t of model.tracks) {
        const tr = el('tr');
        tr.append(el('td', { text: t.position }));
        tr.append(el('td', { text: t.title }));
        if (hasWriters) tr.append(el('td', { text: t.writers.join(', ') }));
        tr.append(el('td', { text: t.duration }));
        tbody.append(tr);
      }
      table.append(tbody);
      panel.append(table);
    }

    // --- credits ---
    if (settings.showCredits && model.credits.length) {
      panel.append(el('h3', { text: 'Credits', style: { marginTop: '14px' } }));
      for (const c of model.credits)
        panel.append(
          el(
            'div',
            { class: 'dge-row' },
            el('b', { text: `${c.role}: ` }),
            el('span', { text: c.names.join(', ') }),
          ),
        );
    }

    panel.append(
      el('div', {
        class: 'dge-foot',
        text: 'Data from Discogs (public API) · barcode/ISRC for MusicBrainz & MagicISRC',
      }),
    );
    document.body.append(overlay);
  }

  // -------------------------------------------------------------------------
  //  Section 7 — settings menu (live-updating labels)
  // -------------------------------------------------------------------------

  const canRefreshMenu = typeof GM_unregisterMenuCommand === 'function';
  let menuIds = [];
  let menuBuilt = false;

  function addCmd(id, label, onClick) {
    try {
      return GM_registerMenuCommand(label, onClick, { id, autoClose: false });
    } catch {
      return GM_registerMenuCommand(label, onClick) ?? id;
    }
  }
  function rebuildMenu() {
    if (canRefreshMenu) {
      for (const id of menuIds)
        try {
          GM_unregisterMenuCommand(id);
        } catch {
          /* ignore */
        }
    } else if (menuBuilt) return;
    menuIds = buildMenu();
    menuBuilt = true;
  }
  function toggle(key, label) {
    saveSetting(key, !settings[key]);
    rebuildMenu();
    toast(`${label} ${settings[key] ? 'on' : 'off'} — reload to apply`);
  }
  function buildMenu() {
    const on = (v) => (v ? 'on' : 'off');
    return [
      addCmd('showInfo', `Show release info & ISRCs: ${on(settings.showInfo)}`, () =>
        toggle('showInfo', 'Release info'),
      ),
      addCmd('showCredits', `Show credits: ${on(settings.showCredits)}`, () =>
        toggle('showCredits', 'Credits'),
      ),
      addCmd('harmonyLookup', `Integrate Harmony lookup: ${on(settings.harmonyLookup)}`, () =>
        toggle('harmonyLookup', 'Harmony lookup'),
      ),
    ];
  }

  // -------------------------------------------------------------------------
  //  Section 8 — bootstrap (launcher + SPA-aware injection)
  // -------------------------------------------------------------------------

  function ensureLauncher() {
    if (document.getElementById('dge-launch')) return;
    const btn = el('button', {
      id: 'dge-launch',
      class: 'dge-launch',
      text: 'Discogs ▾',
      title: 'Discogs Enhancer',
    });
    btn.addEventListener('click', async () => {
      const page = parsePage();
      if (!page) return toast('Open a Discogs release page first.');
      btn.disabled = true;
      const orig = btn.textContent;
      btn.textContent = 'Discogs …';
      try {
        openPanel(await fetchEntity(page));
      } catch (err) {
        toast(`Failed: ${err.message}`);
      } finally {
        btn.disabled = false;
        btn.textContent = orig;
      }
    });
    document.body.appendChild(btn);
  }

  async function maybeHeaderUI() {
    const page = parsePage();
    if (!page) return;
    try {
      injectHeaderUI(await fetchEntity(page));
    } catch {
      /* API not ready / failed — launcher still works on demand */
    }
  }

  let lastPath = '';
  function onRoute() {
    if (location.pathname === lastPath) return;
    lastPath = location.pathname;
    document.querySelector('.dge-actions')?.remove();
    ensureLauncher();
    let tries = 0;
    const tick = setInterval(() => {
      maybeHeaderUI();
      if (document.querySelector('.dge-actions') || ++tries > 8) clearInterval(tick);
    }, 600);
  }

  function hookHistory(method) {
    const orig = history[method];
    history[method] = function (...args) {
      const r = orig.apply(this, args);
      queueMicrotask(onRoute);
      return r;
    };
  }
  hookHistory('pushState');
  hookHistory('replaceState');
  window.addEventListener('popstate', onRoute);
  setInterval(onRoute, 1500);

  rebuildMenu();
  ensureLauncher();
  onRoute();
})();
