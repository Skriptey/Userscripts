// ==UserScript==
// @name          Spotify Enhancer
// @namespace     https://github.com/Skriptey/Userscripts
// @version       1.0.0
// @description   Spotify Enhancer — on open.spotify.com album & track pages, surfaces the barcode (UPC) and per-track ISRCs with one-click copy and a MagicISRC link, plus label/copyright info, a Harmony cross-service lookup, and cover-art download. A Spotify-flavoured sibling of ITAM Enhancer (reuses the web player's own access token).
// @author        Skriptey
// @license       GPL-3.0-or-later
// @match         https://open.spotify.com/*
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
// @connect       api.spotify.com
// @connect       i.scdn.co
// @connect       musicbrainz.org
// @icon          https://open.spotify.com/favicon.ico
// @homepageURL   https://github.com/Skriptey/Userscripts/tree/main/scripts/spotify-enhancer
// @supportURL    https://github.com/Skriptey/Userscripts/issues
// @downloadURL   https://skriptey.github.io/Userscripts/spotify-enhancer/spotify-enhancer.user.js
// @updateURL     https://skriptey.github.io/Userscripts/spotify-enhancer/spotify-enhancer.user.js
// ==/UserScript==

// SPDX-License-Identifier: GPL-3.0-or-later
//
// ATTRIBUTION / PRIOR ART
// -----------------------
// Original implementation, no code copied. The Spotify sibling of this repo's ITAM
// Enhancer (Apple Music); reuses the body-mounted panel, the MagicISRC-via-MusicBrainz-
// barcode flow, and the Harmony handoff.
//
// ===========================================================================
//  Spotify Enhancer — how it works
// ===========================================================================
//
//  ⚠️ NOT yet verified against the live API in-browser (the Spotify Web API is
//  CORS-closed and login-gated, so it can't be exercised headlessly). The DESIGN
//  below follows the documented behaviour; expect to test/tune the token capture and
//  field mapping on a logged-in open.spotify.com session.
//
//  Spotify's Web API (api.spotify.com) needs a Bearer token and does NOT send CORS
//  headers, so a userscript must (a) obtain a token and (b) call it via
//  GM_xmlhttpRequest. Spotify's token endpoint is TOTP-gated (a moving target we
//  deliberately do NOT re-derive); instead we REUSE the token the logged-in web player
//  has already minted — by hooking the page's own fetch()/XMLHttpRequest at
//  document-start and sniffing the `authorization: Bearer …` header off its outgoing
//  requests (and the `client-token`, kept for any future internal-endpoint use). This
//  is the most churn-resistant capture method (ride the player rather than mint our
//  own). The token is held in memory only; it is re-captured whenever the player makes
//  a request (which it does constantly), so no storage is needed.
//
//    • DATA — GET /v1/albums/<id> (external_ids.upc, label, copyrights, release_date,
//      images, simplified tracks) and GET /v1/tracks?ids=<batch> for per-track
//      external_ids.isrc (the album's simplified tracks omit ISRC). /v1/tracks/<id>
//      for track pages.
//    • COVER — images[0] (up to 640px on the public API) from i.scdn.co.
//    • MagicISRC — resolves the MusicBrainz release MBID from the barcode (the one
//      MusicBrainz call; @connect musicbrainz.org), then opens MagicISRC.
//    • Harmony — opens a Harmony cross-service lookup for the Spotify album URL + UPC.
//
//  SCOPE: Spotify's Web API exposes NO audio-format/quality data, so there are no
//  quality badges. Songwriter CREDITS and Canvas videos live only on Spotify's
//  INTERNAL endpoints (api-partner GraphQL / spclient) which churn and need the
//  client-token — planned follow-ups, off by default.
//
//  This script ships verbatim (no build step). Keep these comments accurate when you
//  edit it — see the repo standing task on annotations.
// ===========================================================================

(function () {
  'use strict';

  if (window.__spotifyEnhancer_loaded) return;
  window.__spotifyEnhancer_loaded = true;

  // -------------------------------------------------------------------------
  //  Section 1 — token capture (hook the player's own fetch/XHR, at document-start)
  // -------------------------------------------------------------------------

  let bearer = null; // the player's access token, re-captured from its own requests
  let clientToken = null; // kept for any future internal-endpoint (api-partner) use

  /** Pull `authorization`/`client-token` out of a request's headers, whatever shape. */
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
    const auth = read('authorization');
    if (auth && /^bearer /i.test(auth)) bearer = auth.replace(/^bearer /i, '').trim();
    const ct = read('client-token');
    if (ct) clientToken = ct;
  }

  (function hookTokens() {
    const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    try {
      const origFetch = w.fetch;
      if (origFetch) {
        w.fetch = function (input, init) {
          try {
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
      const origSet = w.XMLHttpRequest.prototype.setRequestHeader;
      w.XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
        try {
          if (/^authorization$/i.test(name) && /^bearer /i.test(value))
            bearer = value.replace(/^bearer /i, '').trim();
          else if (/^client-token$/i.test(name)) clientToken = value;
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

  const API = 'https://api.spotify.com/v1';

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
  const MB_USER_AGENT = `SpotifyEnhancer/${(typeof GM_info !== 'undefined' && GM_info?.script?.version) || '1.0.0'} (https://github.com/Skriptey/Userscripts)`;

  const DEFAULTS = {
    showBarcodeIsrc: true, // FEATURE: barcode (UPC) + per-track ISRCs (panel + button)
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
      GM_notification({ title: 'Spotify Enhancer', text, silent: true, timeout: 2500 });
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
      buildHarmonyUrl(`https://open.spotify.com/album/${model.id}`, model.upc),
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

  /** Download the album's cover art (binary fetched cross-origin via GM_xmlhttpRequest). */
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
  //  Section 4 — Spotify Web API (Bearer reused from the player; CORS-closed → GM_xhr)
  // -------------------------------------------------------------------------

  /** GET an api.spotify.com path → parsed JSON, using the captured player Bearer. */
  function apiGet(path) {
    if (!bearer)
      return Promise.reject(
        new Error('no Spotify token captured yet — interact with the page, then retry'),
      );
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: `${API}${path}`,
        headers: { Authorization: `Bearer ${bearer}` },
        onload: (res) => {
          if (res.status === 401)
            return reject(new Error('Spotify token expired — interact with the page, then retry'));
          if (res.status < 200 || res.status >= 300)
            return reject(new Error(`Spotify API HTTP ${res.status}`));
          try {
            resolve(JSON.parse(res.responseText));
          } catch {
            reject(new Error('Spotify returned non-JSON'));
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
    if (page.type === 'album') {
      const a = await apiGet(`/albums/${page.id}`);
      model = parseAlbum(a);
      // The album's simplified tracks omit ISRC — fetch full tracks in batches of 50.
      const ids = (a.tracks && a.tracks.items ? a.tracks.items : [])
        .map((t) => t.id)
        .filter(Boolean);
      const isrcById = new Map();
      for (let i = 0; i < ids.length; i += 50) {
        const batch = ids.slice(i, i + 50);
        try {
          const full = await apiGet(`/tracks?ids=${batch.join(',')}`);
          for (const t of (full && full.tracks) || [])
            if (t) isrcById.set(t.id, (t.external_ids && t.external_ids.isrc) || '');
        } catch {
          /* keep ISRCs we have */
        }
      }
      model.tracks.forEach((t) => {
        if (isrcById.has(t.id)) t.isrc = isrcById.get(t.id);
      });
    } else {
      model = parseTrack(await apiGet(`/tracks/${page.id}`));
    }
    entityCache.set(page.id, model);
    return model;
  }

  function artistNames(arr) {
    return (arr || [])
      .map((a) => a.name)
      .filter(Boolean)
      .join(', ');
  }
  function bestImage(images) {
    return (
      (images && images.length
        ? images.slice().sort((a, b) => (b.width || 0) - (a.width || 0))[0].url
        : '') || ''
    );
  }

  function parseAlbum(a) {
    return {
      kind: 'album',
      id: a.id,
      name: a.name || '',
      artist: artistNames(a.artists),
      upc: (a.external_ids && a.external_ids.upc) || '',
      label: a.label || '',
      copyright: (a.copyrights || []).map((c) => c.text).join(' · '),
      releaseDate: a.release_date || '',
      cover: bestImage(a.images),
      tracks: (a.tracks && a.tracks.items ? a.tracks.items : []).map((t) => ({
        id: t.id,
        disc: t.disc_number || 1,
        track: t.track_number || 0,
        name: t.name || '',
        artist: artistNames(t.artists),
        isrc: (t.external_ids && t.external_ids.isrc) || '',
      })),
    };
  }

  function parseTrack(t) {
    return {
      kind: 'track',
      id: t.id,
      name: t.name || '',
      artist: artistNames(t.artists),
      upc: '',
      label: '',
      copyright: '',
      releaseDate: (t.album && t.album.release_date) || '',
      cover: bestImage(t.album && t.album.images),
      tracks: [
        {
          id: t.id,
          disc: t.disc_number || 1,
          track: t.track_number || 1,
          name: t.name || '',
          artist: artistNames(t.artists),
          isrc: (t.external_ids && t.external_ids.isrc) || '',
        },
      ],
    };
  }

  // -------------------------------------------------------------------------
  //  Section 5 — page detection
  // -------------------------------------------------------------------------

  /** Parse the current Spotify URL into { type, id } or null. Handles
   *  open.spotify.com/album/<22-char base62>, /track/<id>, and /intl-xx/album/<id>. */
  function parsePage() {
    const m = location.pathname.match(/\/(album|track)\/([A-Za-z0-9]{22})/);
    return m ? { type: m[1], id: m[2] } : null;
  }

  // -------------------------------------------------------------------------
  //  Section 6 — styling
  // -------------------------------------------------------------------------

  GM_addStyle(`
    .spe-launch { position:fixed; right:16px; bottom:16px; z-index:2147483646;
      background:#1db954; color:#000; border:0; border-radius:999px; padding:9px 14px;
      font:700 13px system-ui,-apple-system,sans-serif; cursor:pointer; box-shadow:0 3px 12px rgba(0,0,0,.4); }
    .spe-launch:hover { filter:brightness(1.06); }
    .spe-actions { display:flex; flex-wrap:wrap; gap:8px; margin:10px 0; align-items:center; }
    .spe-chip, .spe-btn { cursor:pointer; background:rgba(127,127,127,.16); color:inherit;
      border:1px solid rgba(127,127,127,.3); border-radius:8px; padding:6px 12px;
      font:600 12px/1 system-ui,-apple-system,sans-serif; text-decoration:none; }
    .spe-chip:hover, .spe-btn:hover { background:#1db954; color:#000; border-color:#1db954; }
    .spe-btn.accent { background:#1db954; color:#000; border-color:#1db954; }
    .spe-overlay { position:fixed; inset:0; z-index:2147483647; background:rgba(0,0,0,.6);
      display:flex; align-items:flex-start; justify-content:center; padding:5vh 12px; }
    .spe-panel { width:760px; max-width:96vw; max-height:90vh; overflow:auto; background:#121212;
      color:#eee; border:1px solid #282828; border-radius:14px; padding:18px 20px;
      font:14px/1.5 system-ui,-apple-system,sans-serif; box-shadow:0 18px 50px rgba(0,0,0,.7); }
    .spe-panel h2 { margin:0 0 2px; font-size:20px; } .spe-panel h3 { margin:0 0 12px; font-size:14px; color:#9a9a9a; font-weight:500; }
    .spe-row { margin:6px 0; } .spe-row b { color:#9a9a9a; font-weight:600; }
    .spe-mono { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; user-select:all; }
    .spe-table { width:100%; border-collapse:collapse; margin-top:8px; font-size:13px; }
    .spe-table th, .spe-table td { text-align:left; padding:5px 8px; border-bottom:1px solid #232323; vertical-align:top; }
    .spe-table th { position:sticky; top:0; background:#121212; color:#9a9a9a; }
    .spe-isrc { cursor:pointer; } .spe-isrc:hover { color:#1db954; }
    .spe-close { float:right; background:none; border:0; color:#9a9a9a; font-size:22px; cursor:pointer; line-height:1; }
    .spe-foot { margin-top:10px; font-size:11px; color:#777; }
    @media (prefers-color-scheme: light) {
      .spe-panel { background:#fff; color:#1a1a1a; border-color:#ddd; }
      .spe-table th { background:#fff; color:#666; } .spe-table th, .spe-table td { border-bottom-color:#eee; }
      .spe-panel h3, .spe-row b, .spe-foot { color:#666; }
    }
  `);

  // -------------------------------------------------------------------------
  //  Section 7 — UI (header buttons + panel)
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
    if (document.querySelector('.spe-actions')) return;
    const anchor = findTitleAnchor(model.name);
    if (!anchor) return;
    const row = el('div', { class: 'spe-actions' });
    if (settings.showBarcodeIsrc)
      row.append(
        el('button', {
          class: 'spe-chip',
          text: 'Barcode & ISRCs',
          onclick: () => openPanel(model),
        }),
      );
    if (settings.coverArt)
      row.append(
        el('button', {
          class: 'spe-chip',
          text: 'Download cover art',
          onclick: () => downloadCoverArt(model),
        }),
      );
    if (settings.harmonyLookup && model.kind === 'album')
      row.append(
        el('button', { class: 'spe-chip', text: 'Harmony ↗', onclick: () => openHarmony(model) }),
      );
    if (!row.children.length) return;
    anchor.insertAdjacentElement('afterend', row);
  }

  function openPanel(model) {
    document.querySelector('.spe-overlay')?.remove();
    const panel = el('div', { class: 'spe-panel' });
    const overlay = el('div', { class: 'spe-overlay' }, panel);
    const close = () => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
    };
    const onKey = (e) => e.key === 'Escape' && close();
    overlay.addEventListener('click', (e) => e.target === overlay && close());
    document.addEventListener('keydown', onKey);

    panel.append(
      el('button', { class: 'spe-close', text: '×', onclick: close, title: 'Close (Esc)' }),
    );
    panel.append(el('h2', { text: model.name || 'Unknown' }));
    panel.append(el('h3', { text: model.artist || '' }));

    const fact = (label, value) =>
      value == null || value === ''
        ? null
        : el(
            'div',
            { class: 'spe-row' },
            el('b', { text: `${label}: ` }),
            el('span', { class: 'spe-mono', text: String(value) }),
          );
    if (settings.showBarcodeIsrc) panel.append(fact('Barcode (UPC)', model.upc));
    panel.append(fact('Label', model.label));
    panel.append(fact('Released', model.releaseDate));
    panel.append(fact('Copyright', model.copyright));

    // --- action buttons ---
    const actions = el('div', { class: 'spe-actions' });
    if (settings.showBarcodeIsrc) {
      const isrcs = model.tracks.map((t) => t.isrc).filter(Boolean);
      if (model.upc)
        actions.append(
          el('button', {
            class: 'spe-btn',
            text: 'Copy barcode',
            onclick: () => copy(model.upc, 'Barcode copied'),
          }),
        );
      if (isrcs.length) {
        actions.append(
          el('button', {
            class: 'spe-btn',
            text: 'Copy all ISRCs',
            onclick: () => copy(isrcs.join('\n'), `${isrcs.length} ISRCs copied`),
          }),
        );
        actions.append(
          el('button', {
            class: 'spe-btn accent',
            text: 'Submit to MagicISRC ↗',
            onclick: () => submitToMagicIsrc(model),
          }),
        );
      }
    }
    if (settings.coverArt)
      actions.append(
        el('button', {
          class: 'spe-btn',
          text: 'Download cover art',
          onclick: () => downloadCoverArt(model),
        }),
      );
    if (settings.harmonyLookup && model.kind === 'album')
      actions.append(
        el('button', {
          class: 'spe-btn',
          text: 'Look up in Harmony ↗',
          onclick: () => openHarmony(model),
        }),
      );
    actions.append(
      el('button', {
        class: 'spe-btn',
        text: 'Copy as JSON',
        onclick: () => copy(JSON.stringify(model, null, 2), 'JSON copied'),
      }),
    );
    panel.append(actions);

    // --- track table ---
    if (settings.showBarcodeIsrc && model.tracks.length) {
      const multiDisc = model.tracks.some((t) => t.disc !== 1);
      const table = el('table', { class: 'spe-table' });
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
            class: 'spe-mono spe-isrc',
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
        class: 'spe-foot',
        text: 'Data from Spotify (reusing the web player token) · ISRC/UPC for MusicBrainz & MagicISRC',
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
      addCmd('showBarcodeIsrc', `Show barcode (UPC) & ISRCs: ${on(settings.showBarcodeIsrc)}`, () =>
        toggle('showBarcodeIsrc', 'Barcode & ISRCs'),
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
    if (!document.body || document.getElementById('spe-launch')) return;
    const btn = el('button', {
      id: 'spe-launch',
      class: 'spe-launch',
      text: 'Spotify ▾',
      title: 'Spotify Enhancer',
    });
    btn.addEventListener('click', async () => {
      const page = parsePage();
      if (!page) return toast('Open an album or track page first.');
      btn.disabled = true;
      const orig = btn.textContent;
      btn.textContent = 'Spotify …';
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
      /* token not captured yet / API failed — launcher still works on demand */
    }
  }

  let lastPath = '';
  function onRoute() {
    if (location.pathname === lastPath) return;
    lastPath = location.pathname;
    document.querySelector('.spe-actions')?.remove();
    ensureLauncher();
    let tries = 0;
    const tick = setInterval(() => {
      maybeHeaderUI();
      if (document.querySelector('.spe-actions') || ++tries > 12) clearInterval(tick);
    }, 700);
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
