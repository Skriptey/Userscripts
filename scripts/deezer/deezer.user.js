// ==UserScript==
// @name          Deezer Enhancer
// @namespace     https://github.com/Skriptey/Userscripts
// @version       1.0.0
// @description   Deezer Enhancer — on deezer.com album & track pages, surfaces the barcode (UPC) and per-track ISRCs with one-click copy and a MagicISRC link, plus label/release info, contributors, a Harmony cross-service lookup, and high-resolution cover-art download. A Deezer-flavoured sibling of ITAM Enhancer (public no-auth API).
// @author        Skriptey
// @license       GPL-3.0-or-later
// @match         https://www.deezer.com/*
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
// @connect       musicbrainz.org
// @icon          https://www.deezer.com/favicon.ico
// @homepageURL   https://github.com/Skriptey/Userscripts/tree/main/scripts/deezer
// @supportURL    https://github.com/Skriptey/Userscripts/issues
// @downloadURL   https://skriptey.github.io/Userscripts/deezer/deezer.user.js
// @updateURL     https://skriptey.github.io/Userscripts/deezer/deezer.user.js
// ==/UserScript==

// SPDX-License-Identifier: GPL-3.0-or-later
//
// ATTRIBUTION / PRIOR ART
// -----------------------
// Original implementation, no code copied. The Deezer sibling of this repo's ITAM
// Enhancer (Apple Music); reuses the same body-mounted panel, the MagicISRC-via-
// MusicBrainz-barcode flow, and the Harmony handoff.
//
// ===========================================================================
//  Deezer Enhancer — how it works (verified live against api.deezer.com 2026-06-17)
// ===========================================================================
//
//  Deezer exposes a PUBLIC, no-auth REST API at api.deezer.com. For the deezer.com
//  origin it sends `Access-Control-Allow-Origin: https://www.deezer.com`, so a
//  userscript on the player calls it with a plain fetch() — no token, no @connect.
//
//    • DATA — GET /album/<id> (upc, label, release_date, genres, cover_xl,
//      contributors), GET /album/<id>/tracks (each track carries `isrc` directly, so
//      every ISRC arrives in ONE call), and GET /track/<id> for track pages.
//    • COVER — `cover_xl` (1000×1000) on cdn-images.dzcdn.net (CORS-open), downloaded
//      straight to disk.
//    • MagicISRC — MagicISRC keys to a MusicBrainz release MBID, so on an explicit
//      click we resolve it from the album's barcode via the MusicBrainz web service
//      (GM_xmlhttpRequest + the required descriptive User-Agent — the one cross-origin
//      call, hence @connect musicbrainz.org), then open MagicISRC.
//    • Harmony — opens a Harmony cross-service lookup for the Deezer album URL + UPC.
//
//  SCOPE: this uses only the public catalog API. Two things it does NOT cover live
//  only on Deezer's INTERNAL endpoints (which need a logged-in session) and are
//  planned follow-ups: audio-quality/lossless flags (gw-light `FILESIZE_FLAC`) and
//  synchronized/word-by-word lyrics (pipe.deezer.com GraphQL). The public
//  `contributors` are mainly performers, not full songwriter credits.
//
//  Every feature is independently toggleable from the userscript-manager menu (live
//  labels). Deezer is a single-page app, so a route observer re-runs the header
//  logic on navigation; the reliable UI lives in a body-mounted panel.
//
//  This script ships verbatim (no build step). Keep these comments accurate when you
//  edit it — see the repo standing task on annotations.
// ===========================================================================

(function () {
  'use strict';

  if (window.__deezerEnhancer_loaded) return;
  window.__deezerEnhancer_loaded = true;

  // -------------------------------------------------------------------------
  //  Section 1 — constants & settings
  // -------------------------------------------------------------------------

  const API = 'https://api.deezer.com';

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
  const MB_USER_AGENT = `DeezerEnhancer/${(typeof GM_info !== 'undefined' && GM_info?.script?.version) || '1.0.0'} (https://github.com/Skriptey/Userscripts)`;

  const DEFAULTS = {
    showBarcodeIsrc: true, // FEATURE: barcode (UPC) + per-track ISRCs (panel + header button)
    showCredits: true, // FEATURE: contributors (artists/credits) in the panel
    coverArt: true, // FEATURE: cover-art download button
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
      GM_notification({ title: 'Deezer Enhancer', text, silent: true, timeout: 2500 });
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

  function safeName(s) {
    return String(s || '')
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .trim();
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
      buildHarmonyUrl(`https://www.deezer.com/album/${model.id}`, model.upc),
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
        headers: { 'User-Agent': MB_USER_AGENT, Accept: 'application/json' },
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
  function buildMagicIsrcUrl(mbid, isrcs) {
    const p = new URLSearchParams();
    p.set('mbid', mbid);
    isrcs.forEach((c, i) => p.set(`isrc${i + 1}`, c));
    return `${MAGICISRC_BASE}?${p.toString()}`;
  }
  async function submitToMagicIsrc(model) {
    const isrcs = model.tracks.map((t) => t.isrc).filter(Boolean);
    if (!isrcs.length) return;
    if (!model.upc)
      return toast('No barcode on this release — use the Harmony button to match/add it');
    toast('Looking up MusicBrainz…');
    let mbid;
    try {
      mbid = await lookupMusicBrainzMbid(model.upc);
    } catch (err) {
      return toast(`MusicBrainz lookup failed: ${err.message}`);
    }
    if (!mbid)
      return toast(
        'No MusicBrainz release for this barcode — use the Harmony button to match/add it',
      );
    window.open(buildMagicIsrcUrl(mbid, isrcs), '_blank', 'noopener');
  }

  /** Download the album's high-resolution cover art. */
  async function downloadCoverArt(model) {
    if (!model.cover) return toast('No cover art found');
    toast('Downloading cover art…');
    try {
      const blob = await (await fetch(model.cover)).blob();
      const a = el('a', {
        href: URL.createObjectURL(blob),
        download: `${safeName(model.artist)} - ${safeName(model.name)}_Cover.jpg`,
      });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast('Cover art saved ✓');
    } catch (err) {
      toast(`Cover art failed: ${err.message}`);
    }
  }

  // -------------------------------------------------------------------------
  //  Section 3 — Deezer public API
  // -------------------------------------------------------------------------

  /** GET a Deezer API path → parsed JSON (plain fetch; api.deezer.com is CORS-open
   *  for the deezer.com origin). Deezer signals errors in the body, not the status. */
  async function apiGet(path) {
    const res = await fetch(`${API}${path}`);
    const data = await res.json();
    if (data && data.error) throw new Error(data.error.message || 'Deezer API error');
    return data;
  }

  async function fetchEntity(page) {
    if (entityCache.has(page.id)) return entityCache.get(page.id);
    let model;
    if (page.type === 'album') {
      const a = await apiGet(`/album/${page.id}`);
      const tracks = await apiGet(`/album/${page.id}/tracks?limit=200`);
      model = parseAlbum(a, (tracks && tracks.data) || []);
    } else {
      model = parseTrack(await apiGet(`/track/${page.id}`));
    }
    entityCache.set(page.id, model);
    return model;
  }

  /** Group an album/track contributor list into [{ role, names:[…] }]. */
  function parseContributors(contributors) {
    const byRole = new Map();
    for (const c of contributors || []) {
      const role = c.role || 'Contributor';
      const set = byRole.get(role) || new Set();
      if (c.name) set.add(c.name);
      byRole.set(role, set);
    }
    return [...byRole.entries()].map(([role, set]) => ({ role, names: [...set] }));
  }

  function parseAlbum(a, trackData) {
    return {
      kind: 'album',
      id: a.id,
      name: a.title || '',
      artist: (a.artist && a.artist.name) || '',
      upc: a.upc || '',
      label: a.label || '',
      releaseDate: a.release_date || '',
      genres: (a.genres && a.genres.data ? a.genres.data.map((g) => g.name) : []).join(', '),
      cover: a.cover_xl || a.cover_big || '',
      credits: parseContributors(a.contributors),
      tracks: trackData.filter(Boolean).map((t) => ({
        disc: t.disk_number || 1,
        track: t.track_position || 0,
        name: t.title || '',
        artist: (t.artist && t.artist.name) || '',
        isrc: t.isrc || '',
      })),
    };
  }

  function parseTrack(t) {
    return {
      kind: 'track',
      id: t.id,
      name: t.title || '',
      artist: (t.artist && t.artist.name) || '',
      upc: '',
      label: '',
      releaseDate: t.release_date || (t.album && t.album.release_date) || '',
      genres: '',
      cover: (t.album && (t.album.cover_xl || t.album.cover_big)) || '',
      credits: parseContributors(t.contributors),
      tracks: [
        {
          disc: t.disk_number || 1,
          track: t.track_position || 1,
          name: t.title || '',
          artist: (t.artist && t.artist.name) || '',
          isrc: t.isrc || '',
        },
      ],
    };
  }

  // -------------------------------------------------------------------------
  //  Section 4 — page detection
  // -------------------------------------------------------------------------

  /** Parse the current Deezer URL into { type, id } or null. Handles
   *  deezer.com/album/<id>, /track/<id>, and locale-prefixed /<cc>/album/<id>. */
  function parsePage() {
    const m = location.pathname.match(/\/(album|track)\/(\d+)/);
    if (!m) return null;
    return { type: m[1], id: m[2] };
  }

  // -------------------------------------------------------------------------
  //  Section 5 — styling
  // -------------------------------------------------------------------------

  GM_addStyle(`
    .dze-launch { position:fixed; right:16px; bottom:16px; z-index:2147483646;
      background:#a238ff; color:#fff; border:0; border-radius:999px; padding:9px 14px;
      font:600 13px system-ui,-apple-system,sans-serif; cursor:pointer; box-shadow:0 3px 12px rgba(0,0,0,.4); }
    .dze-launch:hover { filter:brightness(1.08); }
    .dze-actions { display:flex; flex-wrap:wrap; gap:8px; margin:10px 0; align-items:center; }
    .dze-chip, .dze-btn { cursor:pointer; background:rgba(127,127,127,.16); color:inherit;
      border:1px solid rgba(127,127,127,.3); border-radius:8px; padding:6px 12px;
      font:600 12px/1 system-ui,-apple-system,sans-serif; text-decoration:none; }
    .dze-chip:hover, .dze-btn:hover { background:#a238ff; color:#fff; border-color:#a238ff; }
    .dze-btn.accent { background:#a238ff; color:#fff; border-color:#a238ff; }
    .dze-overlay { position:fixed; inset:0; z-index:2147483647; background:rgba(0,0,0,.6);
      display:flex; align-items:flex-start; justify-content:center; padding:5vh 12px; }
    .dze-panel { width:760px; max-width:96vw; max-height:90vh; overflow:auto; background:#16161d;
      color:#eee; border:1px solid #2a2a33; border-radius:14px; padding:18px 20px;
      font:14px/1.5 system-ui,-apple-system,sans-serif; box-shadow:0 18px 50px rgba(0,0,0,.7); }
    .dze-panel h2 { margin:0 0 2px; font-size:20px; } .dze-panel h3 { margin:0 0 12px; font-size:14px; color:#9a9aaa; font-weight:500; }
    .dze-row { margin:6px 0; } .dze-row b { color:#9a9aaa; font-weight:600; }
    .dze-mono { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; user-select:all; }
    .dze-table { width:100%; border-collapse:collapse; margin-top:8px; font-size:13px; }
    .dze-table th, .dze-table td { text-align:left; padding:5px 8px; border-bottom:1px solid #24242e; vertical-align:top; }
    .dze-table th { position:sticky; top:0; background:#16161d; color:#9a9aaa; }
    .dze-isrc { cursor:pointer; } .dze-isrc:hover { color:#a238ff; }
    .dze-close { float:right; background:none; border:0; color:#9a9aaa; font-size:22px; cursor:pointer; line-height:1; }
    .dze-foot { margin-top:10px; font-size:11px; color:#777; }
    @media (prefers-color-scheme: light) {
      .dze-panel { background:#fff; color:#1a1a1a; border-color:#ddd; }
      .dze-table th { background:#fff; color:#666; } .dze-table th, .dze-table td { border-bottom-color:#eee; }
      .dze-panel h3, .dze-row b, .dze-foot { color:#666; }
    }
  `);

  // -------------------------------------------------------------------------
  //  Section 6 — UI (header buttons + panel)
  // -------------------------------------------------------------------------

  function findTitleAnchor(name) {
    const headings = document.querySelectorAll('h1, h2, [role="heading"]');
    if (name) {
      const needle = name.trim().slice(0, 40);
      for (const h of headings) if ((h.textContent || '').trim().startsWith(needle)) return h;
    }
    for (const h of headings) if ((h.textContent || '').trim()) return h;
    return null;
  }

  function injectHeaderUI(model) {
    if (document.querySelector('.dze-actions')) return;
    const anchor = findTitleAnchor(model.name);
    if (!anchor) return;
    const row = el('div', { class: 'dze-actions' });
    if (settings.showBarcodeIsrc)
      row.append(
        el('button', {
          class: 'dze-chip',
          text: 'Barcode & ISRCs',
          onclick: () => openPanel(model),
        }),
      );
    if (settings.coverArt)
      row.append(
        el('button', {
          class: 'dze-chip',
          text: 'Download cover art',
          onclick: () => downloadCoverArt(model),
        }),
      );
    if (settings.harmonyLookup && model.kind === 'album')
      row.append(
        el('button', { class: 'dze-chip', text: 'Harmony ↗', onclick: () => openHarmony(model) }),
      );
    if (!row.children.length) return;
    anchor.insertAdjacentElement('afterend', row);
  }

  function openPanel(model) {
    document.querySelector('.dze-overlay')?.remove();
    const panel = el('div', { class: 'dze-panel' });
    const overlay = el('div', { class: 'dze-overlay' }, panel);
    const close = () => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
    };
    const onKey = (e) => e.key === 'Escape' && close();
    overlay.addEventListener('click', (e) => e.target === overlay && close());
    document.addEventListener('keydown', onKey);

    panel.append(
      el('button', { class: 'dze-close', text: '×', onclick: close, title: 'Close (Esc)' }),
    );
    panel.append(el('h2', { text: model.name || 'Unknown' }));
    panel.append(el('h3', { text: model.artist || '' }));

    const fact = (label, value) =>
      value == null || value === ''
        ? null
        : el(
            'div',
            { class: 'dze-row' },
            el('b', { text: `${label}: ` }),
            el('span', { class: 'dze-mono', text: String(value) }),
          );
    if (settings.showBarcodeIsrc) panel.append(fact('Barcode (UPC)', model.upc));
    panel.append(fact('Label', model.label));
    panel.append(fact('Released', model.releaseDate));
    panel.append(fact('Genres', model.genres));

    // --- action buttons ---
    const actions = el('div', { class: 'dze-actions' });
    if (settings.showBarcodeIsrc) {
      const isrcs = model.tracks.map((t) => t.isrc).filter(Boolean);
      if (model.upc)
        actions.append(
          el('button', {
            class: 'dze-btn',
            text: 'Copy barcode',
            onclick: () => copy(model.upc, 'Barcode copied'),
          }),
        );
      if (isrcs.length) {
        actions.append(
          el('button', {
            class: 'dze-btn',
            text: 'Copy all ISRCs',
            onclick: () => copy(isrcs.join('\n'), `${isrcs.length} ISRCs copied`),
          }),
        );
        actions.append(
          el('button', {
            class: 'dze-btn accent',
            text: 'Submit to MagicISRC ↗',
            onclick: () => submitToMagicIsrc(model),
          }),
        );
      }
    }
    if (settings.coverArt)
      actions.append(
        el('button', {
          class: 'dze-btn',
          text: 'Download cover art',
          onclick: () => downloadCoverArt(model),
        }),
      );
    if (settings.harmonyLookup && model.kind === 'album')
      actions.append(
        el('button', {
          class: 'dze-btn',
          text: 'Look up in Harmony ↗',
          onclick: () => openHarmony(model),
        }),
      );
    actions.append(
      el('button', {
        class: 'dze-btn',
        text: 'Copy as JSON',
        onclick: () => copy(JSON.stringify(model, null, 2), 'JSON copied'),
      }),
    );
    panel.append(actions);

    // --- track table ---
    if (settings.showBarcodeIsrc && model.tracks.length) {
      const multiDisc = model.tracks.some((t) => t.disc !== 1);
      const table = el('table', { class: 'dze-table' });
      const head = el('tr');
      ['#', 'Title', 'Artist', 'ISRC'].forEach((h) => head.append(el('th', { text: h })));
      table.append(el('thead', {}, head));
      const tbody = el('tbody');
      for (const t of model.tracks) {
        const tr = el('tr');
        tr.append(el('td', { text: multiDisc ? `${t.disc}.${t.track}` : String(t.track || '') }));
        tr.append(el('td', { text: t.name }));
        tr.append(el('td', { text: t.artist }));
        tr.append(
          el('td', {
            class: 'dze-mono dze-isrc',
            text: t.isrc || '—',
            title: t.isrc ? 'Click to copy' : '',
            onclick: () => t.isrc && copy(t.isrc, 'ISRC copied'),
          }),
        );
        tbody.append(tr);
      }
      table.append(tbody);
      panel.append(table);
    }

    // --- contributors / credits ---
    if (settings.showCredits && model.credits && model.credits.length) {
      panel.append(el('h3', { text: 'Contributors', style: { marginTop: '14px' } }));
      for (const c of model.credits)
        panel.append(
          el(
            'div',
            { class: 'dze-row' },
            el('b', { text: `${c.role}: ` }),
            el('span', { text: c.names.join(', ') }),
          ),
        );
    }

    panel.append(
      el('div', {
        class: 'dze-foot',
        text: 'Data from Deezer (public API) · ISRC/UPC for MusicBrainz & MagicISRC',
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
      addCmd('showBarcodeIsrc', `Show barcode (UPC) & ISRCs: ${on(settings.showBarcodeIsrc)}`, () =>
        toggle('showBarcodeIsrc', 'Barcode & ISRCs'),
      ),
      addCmd('showCredits', `Show contributors: ${on(settings.showCredits)}`, () =>
        toggle('showCredits', 'Contributors'),
      ),
      addCmd('coverArt', `Download cover art button: ${on(settings.coverArt)}`, () =>
        toggle('coverArt', 'Cover-art button'),
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
    if (document.getElementById('dze-launch')) return;
    const btn = el('button', {
      id: 'dze-launch',
      class: 'dze-launch',
      text: 'Deezer ▾',
      title: 'Deezer Enhancer',
    });
    btn.addEventListener('click', async () => {
      const page = parsePage();
      if (!page) return toast('Open an album or track page first.');
      btn.disabled = true;
      const orig = btn.textContent;
      btn.textContent = 'Deezer …';
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
    document.querySelector('.dze-actions')?.remove();
    ensureLauncher();
    let tries = 0;
    const tick = setInterval(() => {
      maybeHeaderUI();
      if (document.querySelector('.dze-actions') || ++tries > 8) clearInterval(tick);
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
