// ==UserScript==
// @name          Qobuz Enhancer
// @namespace     https://github.com/Skriptey/Userscripts
// @version       1.0.1
// @description   Qobuz Enhancer — on play.qobuz.com / open.qobuz.com album & track pages, surfaces the exact audio quality (Hi-Res bit-depth/sample-rate), the barcode (UPC) and per-track ISRCs with one-click copy and a MagicISRC link, plus credits, a Harmony cross-service lookup, and high-resolution cover-art download. A Qobuz-flavoured sibling of ITAM Enhancer (reuses the logged-in player's own token).
// @author        Skriptey
// @license       GPL-3.0-or-later
// @match         https://play.qobuz.com/*
// @match         https://open.qobuz.com/*
// @run-at        document-start
// @grant         unsafeWindow
// @grant         GM_xmlhttpRequest
// @grant         GM_addStyle
// @grant         GM_setClipboard
// @grant         GM_registerMenuCommand
// @grant         GM_unregisterMenuCommand
// @grant         GM_getValue
// @grant         GM_setValue
// @grant         GM_notification
// @grant         GM_info
// @connect       www.qobuz.com
// @connect       static.qobuz.com
// @connect       musicbrainz.org
// @icon          https://www.qobuz.com/favicon.ico
// @homepageURL   https://github.com/Skriptey/Userscripts/tree/main/scripts/qobuz
// @supportURL    https://github.com/Skriptey/Userscripts/issues
// @downloadURL   https://skriptey.github.io/Userscripts/qobuz/qobuz.user.js
// @updateURL     https://skriptey.github.io/Userscripts/qobuz/qobuz.user.js
// ==/UserScript==

// SPDX-License-Identifier: GPL-3.0-or-later
//
// ATTRIBUTION / PRIOR ART
// -----------------------
// Original implementation, no code copied. The Qobuz sibling of this repo's ITAM
// Enhancer (Apple Music); reuses the body-mounted panel, the MagicISRC-via-MusicBrainz-
// barcode flow, and the Harmony handoff.
//
// ===========================================================================
//  Qobuz Enhancer — how it works
// ===========================================================================
//
//  ⚠️ NOT yet verified against the live API in-browser. Qobuz has NO anonymous catalog
//  (every call needs a logged-in subscriber's credentials), so it can't be exercised
//  headlessly. The DESIGN follows the documented API; expect to test/tune the token
//  capture and field mapping on a logged-in play.qobuz.com session.
//
//  The Qobuz web player calls www.qobuz.com/api.json/0.2/ with an `app_id` (query
//  param) and an `X-User-Auth-Token` header (from the logged-in session). We REUSE
//  both — captured by hooking the page's own fetch()/XMLHttpRequest at document-start
//  and reading the `app_id` query param + `X-User-Auth-Token`/`X-App-Id` headers off
//  the player's outgoing requests (we deliberately do NOT compute Qobuz's request_sig
//  or call getFileUrl — metadata only, never streaming URLs). Calls go via
//  GM_xmlhttpRequest (the API is not reliably CORS-open) → @connect www.qobuz.com.
//
//    • DATA — album/get?album_id=<id>&app_id=<id> and track/get?track_id=<id> (header
//      X-User-Auth-Token). Fields: `maximum_bit_depth` + `maximum_sampling_rate` +
//      `hires` (the real audio quality), `upc` (barcode), per-track `isrc`, `label`,
//      `copyright`, `genre`, `release_date_original`, `image` (cover), and per-track
//      `performer`/`composer` (credits).
//    • COVER — the album `image` (templated to the largest size) on static.qobuz.com.
//    • MagicISRC — resolves the MusicBrainz release MBID from the barcode (one call;
//      @connect musicbrainz.org), then opens MagicISRC.
//    • Harmony — opens a Harmony cross-service lookup for the Qobuz album URL + UPC.
//
//  Requires a logged-in Qobuz subscriber session. METADATA ONLY — never touch
//  getFileUrl / streaming-URL signing.
//
//  This script ships verbatim (no build step). Keep these comments accurate when you
//  edit it — see the repo standing task on annotations.
// ===========================================================================

(function () {
  'use strict';

  if (window.__qobuzEnhancer_loaded) return;
  window.__qobuzEnhancer_loaded = true;

  // -------------------------------------------------------------------------
  //  Section 1 — auth capture (hook the player's own fetch/XHR, at document-start)
  // -------------------------------------------------------------------------

  let appId = null; // Qobuz public app_id (from the player's API calls)
  let authToken = null; // the logged-in user's X-User-Auth-Token

  function grabUrl(url) {
    try {
      const a = new URL(url, location.href).searchParams.get('app_id');
      if (a) appId = a;
    } catch {
      /* ignore */
    }
  }
  function grabHeaders(headers) {
    if (!headers) return;
    const read = (key) => {
      try {
        if (typeof Headers !== 'undefined' && headers instanceof Headers) return headers.get(key);
        if (Array.isArray(headers)) {
          const e = headers.find((p) => String(p[0]).toLowerCase() === key);
          return e && e[1];
        }
        if (typeof headers === 'object') {
          for (const n of Object.keys(headers)) if (n.toLowerCase() === key) return headers[n];
        }
      } catch {
        /* ignore */
      }
      return null;
    };
    const at = read('x-user-auth-token');
    if (at) authToken = at;
    const ai = read('x-app-id');
    if (ai) appId = ai;
  }

  (function hookAuth() {
    const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    try {
      const origFetch = w.fetch;
      if (origFetch) {
        w.fetch = function (input, init) {
          try {
            grabUrl(typeof input === 'string' ? input : input && input.url);
            grabHeaders((init && init.headers) || (input && input.headers));
          } catch {
            /* ignore */
          }
          return origFetch.apply(this, arguments);
        };
      }
    } catch {
      /* ignore */
    }
    try {
      const XHR = w.XMLHttpRequest.prototype;
      const origOpen = XHR.open;
      XHR.open = function (method, url) {
        try {
          grabUrl(url);
        } catch {
          /* ignore */
        }
        return origOpen.apply(this, arguments);
      };
      const origSet = XHR.setRequestHeader;
      XHR.setRequestHeader = function (name, value) {
        try {
          if (/^x-user-auth-token$/i.test(name)) authToken = value;
          else if (/^x-app-id$/i.test(name)) appId = value;
        } catch {
          /* ignore */
        }
        return origSet.apply(this, arguments);
      };
    } catch {
      /* ignore */
    }
  })();

  // -------------------------------------------------------------------------
  //  Section 2 — constants & settings
  // -------------------------------------------------------------------------

  const API = 'https://www.qobuz.com/api.json/0.2';

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
  const MB_USER_AGENT = `QobuzEnhancer/${(typeof GM_info !== 'undefined' && GM_info?.script?.version) || '1.0.0'} (https://github.com/Skriptey/Userscripts)`;

  const DEFAULTS = {
    showFormats: true, // FEATURE: hi-res quality badges (inline + panel)
    autoBadges: true, // sub-option: inject quality badges near the title
    showBarcodeIsrc: true, // FEATURE: barcode (UPC) + per-track ISRCs (panel)
    showCredits: true, // FEATURE: credits (performers/composers) in the panel
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
  //  Section 3 — small utilities
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
      GM_notification({ title: 'Qobuz Enhancer', text, silent: true, timeout: 2500 });
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

  /** Build quality badges from Qobuz bit-depth/sample-rate + hires flag. */
  function qualityBadges(bitDepth, sampleRate, hires) {
    const out = [];
    if (bitDepth && sampleRate) {
      out.push({ label: hires ? 'Hi-Res Lossless' : 'Lossless', premium: true });
      out.push({ label: `${bitDepth}-bit / ${sampleRate} kHz`, premium: false });
    } else {
      out.push({ label: 'Lossless', premium: true });
    }
    return out;
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
      buildHarmonyUrl(`https://www.qobuz.com/album/${model.id}`, model.upc),
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
    const p = new URLSearchParams();
    p.set('mbid', mbid);
    isrcs.forEach((c, i) => p.set(`isrc${i + 1}`, c));
    window.open(`${MAGICISRC_BASE}?${p.toString()}`, '_blank', 'noopener');
  }

  /** Download the album's high-resolution cover art (cross-origin via GM_xmlhttpRequest). */
  function downloadCoverArt(model) {
    if (!model.cover) return toast('No cover art found');
    toast('Downloading cover art…');
    GM_xmlhttpRequest({
      method: 'GET',
      url: model.cover,
      responseType: 'blob',
      onload: (res) => {
        if (res.status < 200 || res.status >= 300 || !res.response)
          return toast(`Cover art failed: HTTP ${res.status}`);
        const a = el('a', {
          href: URL.createObjectURL(res.response),
          download: `${safeName(model.artist)} - ${safeName(model.name)}_Cover.jpg`,
        });
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        toast('Cover art saved ✓');
      },
      onerror: () => toast('Cover art failed: network error'),
      ontimeout: () => toast('Cover art failed: timeout'),
    });
  }

  // -------------------------------------------------------------------------
  //  Section 4 — Qobuz API (app_id + X-User-Auth-Token reused from the player)
  // -------------------------------------------------------------------------

  function apiGet(endpoint, params) {
    if (!appId || !authToken)
      return Promise.reject(
        new Error('no Qobuz session captured yet — interact with the page (log in), then retry'),
      );
    const qs = new URLSearchParams({ ...params, app_id: appId }).toString();
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: `${API}/${endpoint}?${qs}`,
        headers: { 'X-User-Auth-Token': authToken, Accept: 'application/json' },
        onload: (res) => {
          if (res.status === 401)
            return reject(
              new Error('Qobuz session expired — reload the logged-in page, then retry'),
            );
          if (res.status < 200 || res.status >= 300)
            return reject(new Error(`Qobuz API HTTP ${res.status}`));
          try {
            resolve(JSON.parse(res.responseText));
          } catch {
            reject(new Error('Qobuz returned non-JSON'));
          }
        },
        onerror: () => reject(new Error('network error')),
        ontimeout: () => reject(new Error('timeout')),
      });
    });
  }

  async function fetchEntity(page) {
    if (entityCache.has(page.id)) return entityCache.get(page.id);
    let model;
    if (page.type === 'album') model = parseAlbum(await apiGet('album/get', { album_id: page.id }));
    else model = parseTrack(await apiGet('track/get', { track_id: page.id }));
    entityCache.set(page.id, model);
    return model;
  }

  /** Largest cover URL from a Qobuz `image` object (swap _600 → _max where templated). */
  function coverUrl(image) {
    const u = (image && (image.large || image.small || image.thumbnail)) || '';
    return u ? u.replace(/_\d+\.jpg/, '_max.jpg') : '';
  }

  function parseAlbum(a) {
    return {
      kind: 'album',
      id: a.id,
      name: a.title || '',
      artist: (a.artist && a.artist.name) || '',
      upc: a.upc || '',
      label: (a.label && a.label.name) || '',
      copyright: a.copyright || '',
      genre: (a.genre && a.genre.name) || '',
      releaseDate: a.release_date_original || a.release_date_stream || '',
      cover: coverUrl(a.image),
      badges: qualityBadges(a.maximum_bit_depth, a.maximum_sampling_rate, a.hires),
      tracks: (a.tracks && a.tracks.items ? a.tracks.items : []).map((t) => ({
        disc: t.media_number || 1,
        track: t.track_number || 0,
        name: t.title || '',
        artist: (t.performer && t.performer.name) || (a.artist && a.artist.name) || '',
        isrc: t.isrc || '',
        composer: (t.composer && t.composer.name) || '',
        performers: t.performers || '',
        badges: qualityBadges(
          t.maximum_bit_depth || a.maximum_bit_depth,
          t.maximum_sampling_rate || a.maximum_sampling_rate,
          t.hires != null ? t.hires : a.hires,
        ),
      })),
    };
  }

  function parseTrack(t) {
    const a = t.album || {};
    return {
      kind: 'track',
      id: t.id,
      name: t.title || '',
      artist: (t.performer && t.performer.name) || (a.artist && a.artist.name) || '',
      upc: a.upc || '',
      label: (a.label && a.label.name) || '',
      copyright: t.copyright || a.copyright || '',
      genre: (a.genre && a.genre.name) || '',
      releaseDate: a.release_date_original || '',
      cover: coverUrl(a.image),
      badges: qualityBadges(t.maximum_bit_depth, t.maximum_sampling_rate, t.hires),
      tracks: [
        {
          disc: t.media_number || 1,
          track: t.track_number || 1,
          name: t.title || '',
          artist: (t.performer && t.performer.name) || '',
          isrc: t.isrc || '',
          composer: (t.composer && t.composer.name) || '',
          performers: t.performers || '',
          badges: qualityBadges(t.maximum_bit_depth, t.maximum_sampling_rate, t.hires),
        },
      ],
    };
  }

  // -------------------------------------------------------------------------
  //  Section 5 — page detection
  // -------------------------------------------------------------------------

  /** Parse the current Qobuz URL into { type, id } or null
   *  (play.qobuz.com/album/<id>, /track/<id>; open.qobuz.com likewise). */
  function parsePage() {
    const m = location.pathname.match(/\/(album|track)\/([A-Za-z0-9]+)/);
    return m ? { type: m[1], id: m[2] } : null;
  }

  // -------------------------------------------------------------------------
  //  Section 6 — styling
  // -------------------------------------------------------------------------

  GM_addStyle(`
    .qbe-launch { position:fixed; right:16px; bottom:16px; z-index:2147483646;
      background:#0a0a0a; color:#fff; border:1px solid #333; border-radius:999px; padding:9px 14px;
      font:600 13px system-ui,-apple-system,sans-serif; cursor:pointer; box-shadow:0 3px 12px rgba(0,0,0,.4); }
    .qbe-launch:hover { background:#222; }
    .qbe-badges { display:inline-flex; flex-wrap:wrap; gap:6px; margin:8px 0; vertical-align:middle; }
    .qbe-badge { font:600 11px/1.3 system-ui,sans-serif; padding:3px 8px; border-radius:6px; background:rgba(127,127,127,.2); color:inherit; }
    .qbe-badge.premium { background:#c79a3a; color:#000; }
    .qbe-actions { display:flex; flex-wrap:wrap; gap:8px; margin:10px 0; align-items:center; }
    .qbe-chip, .qbe-btn { cursor:pointer; background:rgba(127,127,127,.16); color:inherit;
      border:1px solid rgba(127,127,127,.3); border-radius:8px; padding:6px 12px;
      font:600 12px/1 system-ui,-apple-system,sans-serif; text-decoration:none; }
    .qbe-chip:hover, .qbe-btn:hover { background:#c79a3a; color:#000; border-color:#c79a3a; }
    .qbe-btn.accent { background:#c79a3a; color:#000; border-color:#c79a3a; }
    .qbe-overlay { position:fixed; inset:0; z-index:2147483647; background:rgba(0,0,0,.6);
      display:flex; align-items:flex-start; justify-content:center; padding:5vh 12px; }
    .qbe-panel { width:760px; max-width:96vw; max-height:90vh; overflow:auto; background:#0f0f12;
      color:#eee; border:1px solid #2a2a30; border-radius:14px; padding:18px 20px;
      font:14px/1.5 system-ui,-apple-system,sans-serif; box-shadow:0 18px 50px rgba(0,0,0,.7); }
    .qbe-panel h2 { margin:0 0 2px; font-size:20px; } .qbe-panel h3 { margin:0 0 12px; font-size:14px; color:#9a9a9a; font-weight:500; }
    .qbe-row { margin:6px 0; } .qbe-row b { color:#9a9a9a; font-weight:600; }
    .qbe-mono { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; user-select:all; }
    .qbe-table { width:100%; border-collapse:collapse; margin-top:8px; font-size:13px; }
    .qbe-table th, .qbe-table td { text-align:left; padding:5px 8px; border-bottom:1px solid #24242a; vertical-align:top; }
    .qbe-table th { position:sticky; top:0; background:#0f0f12; color:#9a9a9a; }
    .qbe-isrc { cursor:pointer; } .qbe-isrc:hover { color:#c79a3a; }
    .qbe-close { float:right; background:none; border:0; color:#9a9a9a; font-size:22px; cursor:pointer; line-height:1; }
    .qbe-foot { margin-top:10px; font-size:11px; color:#777; }
    @media (prefers-color-scheme: light) {
      .qbe-panel { background:#fff; color:#1a1a1a; border-color:#ddd; }
      .qbe-table th { background:#fff; color:#666; } .qbe-table th, .qbe-table td { border-bottom-color:#eee; }
      .qbe-panel h3, .qbe-row b, .qbe-foot { color:#666; }
    }
  `);

  // -------------------------------------------------------------------------
  //  Section 7 — UI (badges + header buttons + panel)
  // -------------------------------------------------------------------------

  function renderBadges(badges) {
    const wrap = el('div', { class: 'qbe-badges' });
    for (const b of badges)
      wrap.append(el('span', { class: `qbe-badge${b.premium ? ' premium' : ''}`, text: b.label }));
    return wrap;
  }

  /** Find the album/track-title heading (robust to Qobuz's volatile class names):
   *  the heading whose text matches the entity name, else the first non-empty
   *  heading near the top. */
  function findTitleAnchor(name) {
    const all = [...document.querySelectorAll('h1, h2, [role="heading"]')];
    const main = document.querySelector('main');
    // Scope the title match to <main> so a nav/sidebar/shelf heading can't win.
    const scoped = main ? [...main.querySelectorAll('h1, h2, [role="heading"]')] : all;
    // Shorter, case-insensitive needle — robust to edition suffixes, trailing
    // whitespace and minor title differences between the API name and the
    // rendered heading. Prefer a STARTS-WITH match; only then fall back to a
    // (scoped) CONTAINS match, so a one-word title can't grab a shelf heading.
    const needle = (name || '').trim().toLowerCase().slice(0, 24);
    if (needle) {
      for (const h of scoped) {
        if ((h.textContent || '').trim().toLowerCase().startsWith(needle)) return h;
      }
      for (const h of scoped) {
        if ((h.textContent || '').trim().toLowerCase().includes(needle)) return h;
      }
    }
    // Otherwise the album title is the main <h1>; fall back to any non-empty heading.
    const h1 = (main || document).querySelector('h1');
    if (h1 && (h1.textContent || '').trim()) return h1;
    for (const h of all) if ((h.textContent || '').trim()) return h;
    return null;
  }

  function injectHeaderUI(model) {
    const anchor = findTitleAnchor(model.name);
    if (!anchor) return;
    if (
      settings.showFormats &&
      settings.autoBadges &&
      model.badges.length &&
      !document.querySelector('.qbe-badges')
    )
      anchor.insertAdjacentElement('afterend', renderBadges(model.badges));
    if (document.querySelector('.qbe-actions')) return;
    const row = el('div', { class: 'qbe-actions' });
    if (settings.showBarcodeIsrc)
      row.append(
        el('button', {
          class: 'qbe-chip',
          text: 'Barcode & ISRCs',
          onclick: () => openPanel(model),
        }),
      );
    if (settings.coverArt)
      row.append(
        el('button', {
          class: 'qbe-chip',
          text: 'Download cover art',
          onclick: () => downloadCoverArt(model),
        }),
      );
    if (settings.harmonyLookup && model.kind === 'album')
      row.append(
        el('button', { class: 'qbe-chip', text: 'Harmony ↗', onclick: () => openHarmony(model) }),
      );
    if (!row.children.length) return;
    (document.querySelector('.qbe-badges') || anchor).insertAdjacentElement('afterend', row);
  }

  function openPanel(model) {
    document.querySelector('.qbe-overlay')?.remove();
    const panel = el('div', { class: 'qbe-panel' });
    const overlay = el('div', { class: 'qbe-overlay' }, panel);
    const close = () => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
    };
    const onKey = (e) => e.key === 'Escape' && close();
    overlay.addEventListener('click', (e) => e.target === overlay && close());
    document.addEventListener('keydown', onKey);

    panel.append(
      el('button', { class: 'qbe-close', text: '×', onclick: close, title: 'Close (Esc)' }),
    );
    panel.append(el('h2', { text: model.name || 'Unknown' }));
    panel.append(el('h3', { text: model.artist || '' }));

    if (settings.showFormats && model.badges.length)
      panel.append(
        el('div', { class: 'qbe-row' }, el('b', { text: 'Quality: ' }), renderBadges(model.badges)),
      );

    const fact = (label, value) =>
      value == null || value === ''
        ? null
        : el(
            'div',
            { class: 'qbe-row' },
            el('b', { text: `${label}: ` }),
            el('span', { class: 'qbe-mono', text: String(value) }),
          );
    if (settings.showBarcodeIsrc) panel.append(fact('Barcode (UPC)', model.upc));
    panel.append(fact('Label', model.label));
    panel.append(fact('Genre', model.genre));
    panel.append(fact('Released', model.releaseDate));
    panel.append(fact('Copyright', model.copyright));

    // --- action buttons ---
    const actions = el('div', { class: 'qbe-actions' });
    if (settings.showBarcodeIsrc) {
      const isrcs = model.tracks.map((t) => t.isrc).filter(Boolean);
      if (model.upc)
        actions.append(
          el('button', {
            class: 'qbe-btn',
            text: 'Copy barcode',
            onclick: () => copy(model.upc, 'Barcode copied'),
          }),
        );
      if (isrcs.length) {
        actions.append(
          el('button', {
            class: 'qbe-btn',
            text: 'Copy all ISRCs',
            onclick: () => copy(isrcs.join('\n'), `${isrcs.length} ISRCs copied`),
          }),
        );
        actions.append(
          el('button', {
            class: 'qbe-btn accent',
            text: 'Submit to MagicISRC ↗',
            onclick: () => submitToMagicIsrc(model),
          }),
        );
      }
    }
    if (settings.coverArt)
      actions.append(
        el('button', {
          class: 'qbe-btn',
          text: 'Download cover art',
          onclick: () => downloadCoverArt(model),
        }),
      );
    if (settings.harmonyLookup && model.kind === 'album')
      actions.append(
        el('button', {
          class: 'qbe-btn',
          text: 'Look up in Harmony ↗',
          onclick: () => openHarmony(model),
        }),
      );
    actions.append(
      el('button', {
        class: 'qbe-btn',
        text: 'Copy as JSON',
        onclick: () => copy(JSON.stringify(model, null, 2), 'JSON copied'),
      }),
    );
    panel.append(actions);

    // --- track table ---
    if (settings.showBarcodeIsrc && model.tracks.length) {
      const multiDisc = model.tracks.some((t) => t.disc !== 1);
      const hasComposer = settings.showCredits && model.tracks.some((t) => t.composer);
      const table = el('table', { class: 'qbe-table' });
      const head = el('tr');
      ['#', 'Title', ...(hasComposer ? ['Composer'] : []), 'ISRC'].forEach((h) =>
        head.append(el('th', { text: h })),
      );
      table.append(el('thead', {}, head));
      const tbody = el('tbody');
      for (const t of model.tracks) {
        const tr = el('tr');
        tr.append(el('td', { text: multiDisc ? `${t.disc}.${t.track}` : String(t.track || '') }));
        tr.append(el('td', { text: t.name }));
        if (hasComposer) tr.append(el('td', { text: t.composer }));
        tr.append(
          el('td', {
            class: 'qbe-mono qbe-isrc',
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

    panel.append(
      el('div', {
        class: 'qbe-foot',
        text: 'Data from Qobuz (reusing the logged-in player token) · metadata only',
      }),
    );
    document.body.append(overlay);
  }

  // -------------------------------------------------------------------------
  //  Section 8 — settings menu (live-updating labels)
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
    ];
  }

  // -------------------------------------------------------------------------
  //  Section 9 — bootstrap (DOM-ready: launcher + SPA-aware injection)
  // -------------------------------------------------------------------------

  function ensureLauncher() {
    if (!document.body || document.getElementById('qbe-launch')) return;
    const btn = el('button', {
      id: 'qbe-launch',
      class: 'qbe-launch',
      text: 'Qobuz ▾',
      title: 'Qobuz Enhancer',
    });
    btn.addEventListener('click', async () => {
      const page = parsePage();
      if (!page) return toast('Open an album or track page first.');
      btn.disabled = true;
      const orig = btn.textContent;
      btn.textContent = 'Qobuz …';
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

  let headerUIBusy = false; // serialise attempts so only one fetchEntity runs at a time
  async function maybeHeaderUI() {
    if (headerUIBusy) return;
    const page = parsePage();
    if (!page) return;
    headerUIBusy = true;
    try {
      injectHeaderUI(await fetchEntity(page));
    } catch {
      /* session not captured yet / API failed — launcher still works on demand */
    } finally {
      headerUIBusy = false;
    }
  }

  let lastPath = '';
  let placeStop = null;
  function onRoute() {
    if (location.pathname === lastPath) return;
    lastPath = location.pathname;
    // Clear stale inline UI from the previous view.
    document.querySelector('.qbe-badges')?.remove();
    document.querySelector('.qbe-actions')?.remove();
    ensureLauncher();
    placeHeaderUI();
  }

  /** Place the inline header UI, RETRYING UNTIL IT LANDS. Qobuz renders the album
   *  header (and the player surfaces its token) at very different times across
   *  pages, so the old fixed retry window left the badges/buttons missing on
   *  slower-rendering pages (while the on-demand panel always worked). A
   *  MutationObserver plus a bounded poll keep trying until placed, or ~15s.
   *  fetchEntity is cached and maybeHeaderUI is serialised, so repeated attempts
   *  are cheap. */
  function placeHeaderUI() {
    if (placeStop) placeStop(); // cancel a previous route's attempts
    const page = parsePage();
    const placed = () => document.querySelector('.qbe-actions');
    const deadline = Date.now() + 15000; // overall cap (mostly waiting for the token)
    let settledAt = 0; // when the model first became available (cached)
    let debounce = null;
    const attempt = () => {
      if (placed() || Date.now() > deadline) return stop();
      // Once the model is cached the header renders quickly — so if nothing has
      // been placed ~3s after the data is ready, there is simply nothing to place
      // here; stop, rather than churn for 15s.
      if (page && entityCache.has(page.id)) {
        if (!settledAt) settledAt = Date.now();
        else if (Date.now() - settledAt > 3000) return stop();
      }
      maybeHeaderUI();
    };
    // Debounce the (very chatty) SPA mutations so attempt() runs at most ~4×/s.
    const schedule = () => {
      if (debounce) return;
      debounce = setTimeout(() => {
        debounce = null;
        attempt();
      }, 250);
    };
    const obs = new MutationObserver(schedule);
    obs.observe(document.body, { childList: true, subtree: true });
    const poll = setInterval(attempt, 700);
    function stop() {
      obs.disconnect();
      clearInterval(poll);
      if (debounce) clearTimeout(debounce);
      if (placeStop === stop) placeStop = null;
    }
    placeStop = stop;
    attempt();
  }

  function hookHistory(method) {
    const orig = history[method];
    history[method] = function (...args) {
      const r = orig.apply(this, args);
      queueMicrotask(onRoute);
      return r;
    };
  }

  function start() {
    hookHistory('pushState');
    hookHistory('replaceState');
    window.addEventListener('popstate', onRoute);
    setInterval(onRoute, 1500);
    rebuildMenu();
    ensureLauncher();
    onRoute();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
