// ==UserScript==
// @name          Tidal Enhancer
// @namespace     https://github.com/Skriptey/Userscripts
// @version       1.0.0
// @description   Tidal Enhancer — on listen.tidal.com / tidal.com album & track pages, surfaces audio quality (Lossless / Hi-Res / Dolby Atmos / 360), the barcode (UPC) and per-track ISRCs with one-click copy and a MagicISRC link, plus full credits, a Harmony cross-service lookup, and high-resolution cover-art download. A Tidal-flavoured sibling of ITAM Enhancer.
// @author        Skriptey
// @license       GPL-3.0-or-later
// @match         https://listen.tidal.com/*
// @match         https://tidal.com/*
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
// @connect        musicbrainz.org
// @icon          https://tidal.com/favicon.ico
// @homepageURL   https://github.com/Skriptey/Userscripts/tree/main/scripts/tidal
// @supportURL    https://github.com/Skriptey/Userscripts/issues
// @downloadURL   https://skriptey.github.io/Userscripts/tidal/tidal.user.js
// @updateURL     https://skriptey.github.io/Userscripts/tidal/tidal.user.js
// ==/UserScript==

// SPDX-License-Identifier: GPL-3.0-or-later
//
// ATTRIBUTION / PRIOR ART
// -----------------------
// Original implementation, no code copied. It's the Tidal sibling of this repo's
// ITAM Enhancer (Apple Music) and reuses the same techniques: a body-mounted panel,
// the MagicISRC-via-MusicBrainz-barcode flow, and the Harmony handoff.
//
// ===========================================================================
//  Tidal Enhancer — how it works (verified live against api.tidal.com 2026-06-17)
// ===========================================================================
//
//  Tidal's web player reads catalog data from api.tidal.com/v1. That API is
//  CORS-open (Access-Control-Allow-Origin: *), so a userscript can call it with a
//  plain fetch() — no GM_xmlhttpRequest, no @connect. It accepts a public,
//  login-free "app token" via the `X-Tidal-Token` header for catalog reads
//  (quality, UPC, ISRC, credits, cover) — which is all this script needs. (If Tidal
//  rotates the token, the fix is the TOKEN constant below, or capturing the live
//  player's bearer; logged-in/account data is out of scope here.)
//
//    • DATA — GET /v1/albums/<id>?countryCode=<cc>, /v1/albums/<id>/tracks,
//      /v1/albums/<id>/items/credits (and /v1/tracks/<id> for track pages). Fields:
//      `audioQuality` + `mediaMetadata.tags` + `audioModes` (quality/format), `upc`
//      (barcode), per-track `isrc`, `copyright`, `releaseDate`, `cover` (a UUID →
//      resources.tidal.com image path), and per-item `credits[].contributors`.
//    • COVER — resources.tidal.com/images/<uuid-with-/-instead-of->/1280x1280.jpg
//      (also CORS-open), downloaded straight to disk.
//    • MagicISRC — like ITAM, MagicISRC keys to a MusicBrainz release MBID, so on an
//      explicit click we resolve it from the album's barcode via the MusicBrainz web
//      service (GM_xmlhttpRequest + the required descriptive User-Agent; the one
//      cross-origin call, hence @connect musicbrainz.org), then open MagicISRC.
//    • Harmony — opens a Harmony cross-service lookup for the Tidal album URL + UPC.
//
//  Every feature is independently toggleable from the userscript-manager menu
//  (GM_registerMenuCommand, persisted via GM_get/setValue, with live-updating
//  labels). Tidal is a single-page app, so a route observer re-runs the header
//  logic on navigation; the reliable UI lives in a body-mounted panel (Tidal's DOM
//  classes are hashed/volatile, like Apple's).
//
//  This script ships verbatim (no build step). Keep these comments accurate when you
//  edit it — see the repo standing task on annotations.
// ===========================================================================

(function () {
  'use strict';

  if (window.__tidalEnhancer_loaded) return;
  window.__tidalEnhancer_loaded = true;

  // -------------------------------------------------------------------------
  //  Section 1 — constants & settings
  // -------------------------------------------------------------------------

  const API = 'https://api.tidal.com/v1';
  // Public, login-free Tidal "app token" for catalog reads (sent as X-Tidal-Token).
  // Verified working 2026-06-17; if Tidal rotates it, replace it here.
  const TOKEN = 'CzET4vdadNUFQ5JU';
  const COVER_BASE = 'https://resources.tidal.com/images';

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
  const MB_USER_AGENT = `TidalEnhancer/${(typeof GM_info !== 'undefined' && GM_info?.script?.version) || '1.0.0'} (https://github.com/Skriptey/Userscripts)`;

  // Tidal quality/format tag → display badge. "premium" tags get the accent colour.
  const FORMAT_LABELS = {
    HIRES_LOSSLESS: 'Hi-Res Lossless',
    HI_RES_LOSSLESS: 'Hi-Res Lossless',
    HI_RES: 'Hi-Res',
    LOSSLESS: 'Lossless',
    DOLBY_ATMOS: 'Dolby Atmos',
    SONY_360RA: '360 Reality Audio',
    HIGH: 'High (AAC)',
    LOW: 'Low (AAC)',
    STEREO: 'Stereo',
  };
  const PREMIUM_TAGS = new Set([
    'HIRES_LOSSLESS',
    'HI_RES_LOSSLESS',
    'HI_RES',
    'LOSSLESS',
    'DOLBY_ATMOS',
    'SONY_360RA',
  ]);

  const DEFAULTS = {
    showFormats: true, // FEATURE: audio-quality badges (inline + panel)
    autoBadges: true, // sub-option: inject quality badges near the title
    showBarcodeIsrc: true, // FEATURE: barcode (UPC) + per-track ISRCs (panel)
    showCredits: true, // FEATURE: full credits in the panel
    coverArt: true, // FEATURE: cover-art download button
    harmonyLookup: true, // FEATURE: Harmony cross-service lookup
    country: 'US', // Tidal storefront/country code for the API
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
      GM_notification({ title: 'Tidal Enhancer', text, silent: true, timeout: 2500 });
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

  /** Map Tidal quality fields → display badges [{label, premium}] (de-duplicated). */
  function qualityBadges(audioQuality, tags, modes) {
    const all = [...(tags || []), ...(modes || []), ...(audioQuality ? [audioQuality] : [])];
    const seen = new Set();
    const out = [];
    for (const raw of all) {
      const key = String(raw).toUpperCase();
      const label = FORMAT_LABELS[key] || key;
      if (seen.has(label) || label === 'Stereo') continue; // Stereo is implied; skip the noise
      seen.add(label);
      out.push({ label, premium: PREMIUM_TAGS.has(key) });
    }
    return out;
  }

  /** Expand a Tidal cover UUID to a resources.tidal.com image URL at `size` px. */
  function coverUrl(cover, size = 1280) {
    if (!cover) return null;
    return `${COVER_BASE}/${String(cover).replace(/-/g, '/')}/${size}x${size}.jpg`;
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
  function tidalAlbumUrl(id) {
    return `https://tidal.com/browse/album/${id}`;
  }
  function openHarmony(model) {
    window.open(buildHarmonyUrl(tidalAlbumUrl(model.id), model.upc), '_blank', 'noopener');
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

  /** Download the album's highest-resolution cover art. */
  async function downloadCoverArt(model) {
    const url = coverUrl(model.cover, 1280);
    if (!url) return toast('No cover art found');
    toast('Downloading cover art…');
    try {
      const blob = await (await fetch(url)).blob();
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
  //  Section 3 — Tidal catalog API
  // -------------------------------------------------------------------------

  /** GET a Tidal API path → parsed JSON (plain fetch; api.tidal.com is CORS-open). */
  async function apiGet(path) {
    const sep = path.includes('?') ? '&' : '?';
    const res = await fetch(
      `${API}${path}${sep}countryCode=${encodeURIComponent(settings.country)}`,
      {
        headers: { 'X-Tidal-Token': TOKEN },
      },
    );
    if (!res.ok) throw new Error(`Tidal API HTTP ${res.status}`);
    return res.json();
  }

  /** Fetch + normalise an album/track into a flat model. */
  async function fetchEntity(page) {
    if (entityCache.has(page.id)) return entityCache.get(page.id);
    let model;
    if (page.type === 'album') {
      const a = await apiGet(`/albums/${page.id}`);
      const tracksResp = await apiGet(`/albums/${page.id}/tracks?limit=100`);
      model = parseAlbum(a, tracksResp.items || []);
      if (settings.showCredits) {
        try {
          const credits = await apiGet(
            `/albums/${page.id}/items/credits?limit=100&includeContributors=true`,
          );
          model.credits = parseCredits(credits.items || []);
        } catch {
          model.credits = [];
        }
      }
    } else {
      const t = await apiGet(`/tracks/${page.id}`);
      model = parseTrack(t);
    }
    entityCache.set(page.id, model);
    return model;
  }

  function parseAlbum(a, trackItems) {
    return {
      kind: 'album',
      id: a.id,
      name: a.title || '',
      artist:
        (a.artist && a.artist.name) || (a.artists && a.artists.map((x) => x.name).join(', ')) || '',
      upc: a.upc || '',
      copyright: a.copyright || '',
      releaseDate: a.releaseDate || a.streamStartDate || '',
      cover: a.cover || '',
      badges: qualityBadges(a.audioQuality, a.mediaMetadata && a.mediaMetadata.tags, a.audioModes),
      tracks: trackItems.filter(Boolean).map((t, i) => ({
        track: t.trackNumber || i + 1,
        disc: t.volumeNumber || 1,
        name: t.title || '',
        artist:
          (t.artist && t.artist.name) ||
          (t.artists && t.artists.map((x) => x.name).join(', ')) ||
          '',
        isrc: t.isrc || '',
        badges: qualityBadges(
          t.audioQuality,
          t.mediaMetadata && t.mediaMetadata.tags,
          t.audioModes,
        ),
      })),
      credits: [],
    };
  }

  function parseTrack(t) {
    return {
      kind: 'track',
      id: t.id,
      name: t.title || '',
      artist:
        (t.artist && t.artist.name) || (t.artists && t.artists.map((x) => x.name).join(', ')) || '',
      upc: '',
      copyright: t.copyright || '',
      releaseDate: t.streamStartDate || '',
      cover: (t.album && t.album.cover) || '',
      badges: qualityBadges(t.audioQuality, t.mediaMetadata && t.mediaMetadata.tags, t.audioModes),
      tracks: [
        {
          track: t.trackNumber || 1,
          disc: t.volumeNumber || 1,
          name: t.title || '',
          artist: (t.artist && t.artist.name) || '',
          isrc: t.isrc || '',
          badges: qualityBadges(
            t.audioQuality,
            t.mediaMetadata && t.mediaMetadata.tags,
            t.audioModes,
          ),
        },
      ],
      credits: [],
    };
  }

  /** Flatten the per-track credits payload into [{ role, names:[…] }] (album-wide). */
  function parseCredits(items) {
    const byRole = new Map();
    for (const it of items) {
      for (const c of it.credits || []) {
        const role = c.type || '';
        const names = (c.contributors || []).map((x) => x.name).filter(Boolean);
        if (!role || !names.length) continue;
        const set = byRole.get(role) || new Set();
        names.forEach((n) => set.add(n));
        byRole.set(role, set);
      }
    }
    return [...byRole.entries()].map(([role, set]) => ({ role, names: [...set] }));
  }

  // -------------------------------------------------------------------------
  //  Section 4 — page detection
  // -------------------------------------------------------------------------

  /** Parse the current Tidal URL into { type, id } or null. Handles
   *  listen.tidal.com/album/<id> and tidal.com/browse/album/<id> (+ /track/). */
  function parsePage() {
    const m = location.pathname.match(/\/(album|track)\/(\d+)/);
    if (!m) return null;
    return { type: m[1], id: m[2] };
  }

  // -------------------------------------------------------------------------
  //  Section 5 — styling
  // -------------------------------------------------------------------------

  GM_addStyle(`
    .tde-launch { position:fixed; right:16px; bottom:16px; z-index:2147483646;
      background:#000; color:#fff; border:1px solid #333; border-radius:999px; padding:9px 14px;
      font:600 13px system-ui,-apple-system,sans-serif; cursor:pointer; box-shadow:0 3px 12px rgba(0,0,0,.4); }
    .tde-launch:hover { background:#111; }
    .tde-badges { display:inline-flex; flex-wrap:wrap; gap:6px; margin:8px 0; vertical-align:middle; }
    .tde-badge { font:600 11px/1.3 system-ui,sans-serif; padding:3px 8px; border-radius:6px;
      background:rgba(127,127,127,.2); color:inherit; }
    .tde-badge.premium { background:#000; color:#fff; }
    .tde-actions { display:flex; flex-wrap:wrap; gap:8px; margin:10px 0; align-items:center; }
    .tde-chip, .tde-btn { cursor:pointer; background:rgba(127,127,127,.16); color:inherit;
      border:1px solid rgba(127,127,127,.3); border-radius:8px; padding:6px 12px;
      font:600 12px/1 system-ui,-apple-system,sans-serif; text-decoration:none; }
    .tde-chip:hover, .tde-btn:hover { background:#000; color:#fff; border-color:#000; }
    .tde-btn.accent { background:#000; color:#fff; border-color:#000; }
    .tde-overlay { position:fixed; inset:0; z-index:2147483647; background:rgba(0,0,0,.6);
      display:flex; align-items:flex-start; justify-content:center; padding:5vh 12px; }
    .tde-panel { width:760px; max-width:96vw; max-height:90vh; overflow:auto; background:#0a0a0a;
      color:#eee; border:1px solid #2a2a2a; border-radius:14px; padding:18px 20px;
      font:14px/1.5 system-ui,-apple-system,sans-serif; box-shadow:0 18px 50px rgba(0,0,0,.7); }
    .tde-panel h2 { margin:0 0 2px; font-size:20px; } .tde-panel h3 { margin:0 0 12px; font-size:14px; color:#9a9a9a; font-weight:500; }
    .tde-row { margin:6px 0; } .tde-row b { color:#9a9a9a; font-weight:600; }
    .tde-mono { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; user-select:all; }
    .tde-table { width:100%; border-collapse:collapse; margin-top:8px; font-size:13px; }
    .tde-table th, .tde-table td { text-align:left; padding:5px 8px; border-bottom:1px solid #1f1f1f; vertical-align:top; }
    .tde-table th { position:sticky; top:0; background:#0a0a0a; color:#9a9a9a; }
    .tde-isrc { cursor:pointer; } .tde-isrc:hover { color:#00c2cb; }
    .tde-close { float:right; background:none; border:0; color:#9a9a9a; font-size:22px; cursor:pointer; line-height:1; }
    .tde-foot { margin-top:10px; font-size:11px; color:#777; }
    @media (prefers-color-scheme: light) {
      .tde-panel { background:#fff; color:#1a1a1a; border-color:#ddd; }
      .tde-table th { background:#fff; color:#666; } .tde-table th, .tde-table td { border-bottom-color:#eee; }
      .tde-panel h3, .tde-row b, .tde-foot { color:#666; }
    }
  `);

  // -------------------------------------------------------------------------
  //  Section 6 — UI (badges + panel)
  // -------------------------------------------------------------------------

  function renderBadges(badges, cls = 'tde-badges') {
    const wrap = el('div', { class: cls });
    for (const b of badges)
      wrap.append(el('span', { class: `tde-badge${b.premium ? ' premium' : ''}`, text: b.label }));
    return wrap;
  }

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
    const anchor = findTitleAnchor(model.name);
    if (!anchor) return;
    if (
      settings.showFormats &&
      settings.autoBadges &&
      model.badges.length &&
      !document.querySelector('.tde-badges')
    ) {
      anchor.insertAdjacentElement('afterend', renderBadges(model.badges));
    }
    if (document.querySelector('.tde-actions')) return;
    const row = el('div', { class: 'tde-actions' });
    if (settings.showBarcodeIsrc)
      row.append(
        el('button', {
          class: 'tde-chip',
          text: 'Barcode & ISRCs',
          onclick: () => openPanel(model),
        }),
      );
    if (settings.coverArt)
      row.append(
        el('button', {
          class: 'tde-chip',
          text: 'Download cover art',
          onclick: () => downloadCoverArt(model),
        }),
      );
    if (settings.harmonyLookup && model.kind === 'album')
      row.append(
        el('button', { class: 'tde-chip', text: 'Harmony ↗', onclick: () => openHarmony(model) }),
      );
    if (!row.children.length) return;
    (document.querySelector('.tde-badges') || anchor).insertAdjacentElement('afterend', row);
  }

  function openPanel(model) {
    document.querySelector('.tde-overlay')?.remove();
    const panel = el('div', { class: 'tde-panel' });
    const overlay = el('div', { class: 'tde-overlay' }, panel);
    const close = () => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
    };
    const onKey = (e) => e.key === 'Escape' && close();
    overlay.addEventListener('click', (e) => e.target === overlay && close());
    document.addEventListener('keydown', onKey);

    panel.append(
      el('button', { class: 'tde-close', text: '×', onclick: close, title: 'Close (Esc)' }),
    );
    panel.append(el('h2', { text: model.name || 'Unknown' }));
    panel.append(el('h3', { text: model.artist || '' }));

    if (settings.showFormats && model.badges.length)
      panel.append(
        el('div', { class: 'tde-row' }, el('b', { text: 'Quality: ' }), renderBadges(model.badges)),
      );

    const fact = (label, value) =>
      value == null || value === ''
        ? null
        : el(
            'div',
            { class: 'tde-row' },
            el('b', { text: `${label}: ` }),
            el('span', { class: 'tde-mono', text: String(value) }),
          );
    if (settings.showBarcodeIsrc) panel.append(fact('Barcode (UPC)', model.upc));
    panel.append(fact('Released', model.releaseDate));
    panel.append(fact('Copyright', model.copyright));

    // --- action buttons ---
    const actions = el('div', { class: 'tde-actions' });
    if (settings.showBarcodeIsrc) {
      const isrcs = model.tracks.map((t) => t.isrc).filter(Boolean);
      if (model.upc)
        actions.append(
          el('button', {
            class: 'tde-btn',
            text: 'Copy barcode',
            onclick: () => copy(model.upc, 'Barcode copied'),
          }),
        );
      if (isrcs.length) {
        actions.append(
          el('button', {
            class: 'tde-btn',
            text: 'Copy all ISRCs',
            onclick: () => copy(isrcs.join('\n'), `${isrcs.length} ISRCs copied`),
          }),
        );
        const magic = el('button', {
          class: 'tde-btn accent',
          text: 'Submit to MagicISRC ↗',
          onclick: () => submitToMagicIsrc(model),
        });
        actions.append(magic);
      }
    }
    if (settings.coverArt)
      actions.append(
        el('button', {
          class: 'tde-btn',
          text: 'Download cover art',
          onclick: () => downloadCoverArt(model),
        }),
      );
    if (settings.harmonyLookup && model.kind === 'album')
      actions.append(
        el('button', {
          class: 'tde-btn',
          text: 'Look up in Harmony ↗',
          onclick: () => openHarmony(model),
        }),
      );
    actions.append(
      el('button', {
        class: 'tde-btn',
        text: 'Copy as JSON',
        onclick: () => copy(JSON.stringify(model, null, 2), 'JSON copied'),
      }),
    );
    panel.append(actions);

    // --- track table ---
    if (settings.showBarcodeIsrc && model.tracks.length) {
      const multiDisc = model.tracks.some((t) => t.disc !== 1);
      const table = el('table', { class: 'tde-table' });
      const head = el('tr');
      ['#', 'Title', 'Artist', 'ISRC', 'Quality'].forEach((h) =>
        head.append(el('th', { text: h })),
      );
      table.append(el('thead', {}, head));
      const tbody = el('tbody');
      for (const t of model.tracks) {
        const tr = el('tr');
        tr.append(el('td', { text: multiDisc ? `${t.disc}.${t.track}` : String(t.track || '') }));
        tr.append(el('td', { text: t.name }));
        tr.append(el('td', { text: t.artist }));
        tr.append(
          el('td', {
            class: 'tde-mono tde-isrc',
            text: t.isrc || '—',
            title: t.isrc ? 'Click to copy' : '',
            onclick: () => t.isrc && copy(t.isrc, 'ISRC copied'),
          }),
        );
        tr.append(el('td', {}, t.badges.length ? renderBadges(t.badges, 'tde-badges') : '—'));
        tbody.append(tr);
      }
      table.append(tbody);
      panel.append(table);
    }

    // --- credits ---
    if (settings.showCredits && model.credits && model.credits.length) {
      panel.append(el('h3', { text: 'Credits', style: { marginTop: '14px' } }));
      for (const c of model.credits)
        panel.append(
          el(
            'div',
            { class: 'tde-row' },
            el('b', { text: `${c.role}: ` }),
            el('span', { text: c.names.join(', ') }),
          ),
        );
    }

    panel.append(
      el('div', {
        class: 'tde-foot',
        text: 'Data from Tidal · ISRC/UPC for MusicBrainz & MagicISRC',
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
      addCmd('showFormats', `Show audio quality: ${on(settings.showFormats)}`, () =>
        toggle('showFormats', 'Audio quality'),
      ),
      addCmd('autoBadges', `Inline quality badges: ${on(settings.autoBadges)}`, () =>
        toggle('autoBadges', 'Inline badges'),
      ),
      addCmd('showBarcodeIsrc', `Show barcode (UPC) & ISRCs: ${on(settings.showBarcodeIsrc)}`, () =>
        toggle('showBarcodeIsrc', 'Barcode & ISRCs'),
      ),
      addCmd('showCredits', `Show credits: ${on(settings.showCredits)}`, () =>
        toggle('showCredits', 'Credits'),
      ),
      addCmd('coverArt', `Download cover art button: ${on(settings.coverArt)}`, () =>
        toggle('coverArt', 'Cover-art button'),
      ),
      addCmd('harmonyLookup', `Integrate Harmony lookup: ${on(settings.harmonyLookup)}`, () =>
        toggle('harmonyLookup', 'Harmony lookup'),
      ),
      addCmd('country', `Country code: ${settings.country}`, () => {
        const v = window.prompt('Tidal country code (e.g. US, GB, DE):', settings.country);
        if (v === null) return;
        saveSetting('country', v.trim().toUpperCase() || 'US');
        entityCache.clear();
        rebuildMenu();
        toast(`Country: ${settings.country} — reload to apply`);
      }),
    ];
  }

  // -------------------------------------------------------------------------
  //  Section 8 — bootstrap (launcher + SPA-aware injection)
  // -------------------------------------------------------------------------

  function ensureLauncher() {
    if (document.getElementById('tde-launch')) return;
    const btn = el('button', {
      id: 'tde-launch',
      class: 'tde-launch',
      text: 'Tidal ▾',
      title: 'Tidal Enhancer',
    });
    btn.addEventListener('click', async () => {
      const page = parsePage();
      if (!page) return toast('Open an album or track page first.');
      btn.disabled = true;
      const orig = btn.textContent;
      btn.textContent = 'Tidal …';
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
    document.querySelector('.tde-badges')?.remove();
    document.querySelector('.tde-actions')?.remove();
    ensureLauncher();
    let tries = 0;
    const tick = setInterval(() => {
      maybeHeaderUI();
      if (document.querySelector('.tde-actions') || ++tries > 8) clearInterval(tick);
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
