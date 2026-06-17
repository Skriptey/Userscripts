// ==UserScript==
// @name          ITAM Enhancer
// @namespace     https://github.com/Skriptey/Userscripts
// @version       1.7.1
// @description   iTunes/Apple Music Enhancer — shows audio formats (album + per-track), barcodes (UPC) and per-track ISRCs with one-click copy and a MagicISRC link (resolved via a MusicBrainz barcode lookup), adds inline album-header buttons, a Harmony cross-service lookup, cover-art download (static + animated/motion artwork), synced/word-by-word lyrics download, and per-track ISWC lookup (MusicBrainz + credits.fm) with MusicBrainz seeding — on Apple Music (music.apple.com) and Apple Music Classical (classical.music.apple.com), with a per-track Work column for classical releases.
// @author        Skriptey
// @license       GPL-3.0-or-later
// @match         https://music.apple.com/*
// @match         https://classical.music.apple.com/*
// @exclude-match https://music.apple.com/includes/commerce/fetch-proxy.html
// @exclude-match https://classical.music.apple.com/includes/commerce/fetch-proxy.html
// @run-at        document-idle
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
// @require       https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js
// @connect       amp-api.music.apple.com
// @connect       mzstatic.com
// @connect       itunes.apple.com
// @connect       musicbrainz.org
// @connect       api.credits.fm
// @icon          https://music.apple.com/assets/favicon/favicon-180-f10a76334177ea08c0b3b35b0269fe16.png
// @homepageURL   https://github.com/Skriptey/Userscripts/tree/main/scripts/ITAMenhancer
// @supportURL    https://github.com/Skriptey/Userscripts/issues
// @downloadURL   https://skriptey.github.io/Userscripts/ITAMenhancer/ITAMenhancer.user.js
// @updateURL     https://skriptey.github.io/Userscripts/ITAMenhancer/ITAMenhancer.user.js
// ==/UserScript==

// SPDX-License-Identifier: GPL-3.0-or-later
//
// ATTRIBUTION / PRIOR ART
// -----------------------
// This is an ORIGINAL implementation. No code was copied from the scripts below —
// they are credited as the inspiration for the features and for the (public,
// unprotectable) techniques used. Both are unlicensed (all rights reserved), so
// their code is deliberately NOT reused here:
//   • "Apple Music Formats" by uh wot —
//       https://gist.github.com/uhwot/1b97f5b806fdf1424377ddb86446d912
//       (itself based on bunnykek/AppleMusic-Formats-Extension)
//   • "Apple Music Barcodes/ISRCs" by ToadKing —
//       https://github.com/ToadKing/apple-music-barcode-isrc
// The "Submit to MagicISRC" link points at kepstin's MagicISRC —
//   https://magicisrc.kepstin.ca/
//
// ===========================================================================
//  ITAM Enhancer — how it works
//    (amp-api verified live 2026-06-15; Apple Music Classical 2026-06-17)
// ===========================================================================
//
//  WHERE IT RUNS — two hosts, one catalog:
//    • music.apple.com — the main Apple Music web player.
//    • classical.music.apple.com — Apple Music Classical's web app. It is the
//      same MusicKit/Vite stack reading the SAME catalog: classical album pages
//      are /<cc>/album/<id> (the slug is simply omitted) and resolve through the
//      very same amp-api catalog endpoint with an identical response shape (upc,
//      isrc, audioTraits, artwork, editorialVideo). So token capture, the API
//      call, cover-art and MagicISRC all work UNCHANGED — we only (a) match the
//      extra host and (b) normalise the Harmony link to a music.apple.com URL
//      (Harmony's Apple provider recognises only that host; the catalog id is the
//      same, so it still matches). Classical tracks also carry workName /
//      movementName, surfaced as an optional "Work" column.
//    • itunes.apple.com — deliberately NOT matched, and it needs no match: Apple
//      301-redirects every legacy iTunes music link server-side
//      (/<cc>/album/<slug>/<id>, /<cc>/album/id<id>, …?i=<track>) to
//      music.apple.com BEFORE any page renders, so those links already land where
//      the script runs. The `@connect itunes.apple.com` is unrelated to page
//      matching — it is required because the animated cover-art HLS streams are
//      hosted on mvod.itunes.apple.com (see downloadMotionBlob).
//
//  Apple Music's web player calls Apple's catalog API (amp-api.music.apple.com)
//  using credentials it already holds, and ITAM Enhancer reuses those NATIVE
//  credentials (it never asks you to log in or paste anything):
//
//    • A catalog credential (Authorization: Bearer …) — ALWAYS required. On its
//      own it is enough for public catalog data (formats, UPC, ISRC).
//    • Music-User-Token (Media-User-Token: …) — OPTIONAL; the logged-in user's
//      own session. We send it WHEN AVAILABLE so account/region/library-gated
//      content resolves too. Not logged in → we simply omit it (anonymous catalog
//      is the fallback). It never replaces the catalog credential; sent alongside.
//
//  1. AUTH — getDevToken() returns the catalog credential (obtained from the live
//     player and cached by its own expiry, so it is fetched rarely). getUserToken()
//     reads the Music-User-Token from the live MusicKit instance, falling back to
//     the `media-user-token` cookie; null when logged out.
//  2. DATA — for an album/song/music-video page we GET
//     `https://amp-api.music.apple.com/v1/catalog/<cc>/<type>s/<id>?include=tracks`
//     with `Authorization: Bearer <dev>` (+ `Media-User-Token` if present) and
//     `Origin: https://music.apple.com`, via GM_xmlhttpRequest (cross-origin and
//     lets us set Origin). The single response carries `attributes.audioTraits`
//     (album-level formats), `attributes.upc` (barcode), `relationships.tracks
//     .data[].attributes.isrc`, `attributes.artwork` (cover-art URL template),
//     `attributes.editorialVideo` (motion-artwork HLS streams), plus
//     label/copyright/dates/Mastered-for-iTunes. For albums we request
//     `extend=editorialVideo,audioTraits` so each track ALSO returns its own
//     `attributes.audioTraits` — a track can carry formats the album-level set
//     doesn't (e.g. an Atmos/Spatial track on an otherwise stereo album). The
//     panel surfaces these per-track differences in a "Formats" column.
//  3. UI — every feature is independently toggleable from the userscript manager's
//     menu (GM_registerMenuCommand, persisted via GM_get/setValue):
//       • Inline album-header buttons, anchored after the format badges/title:
//         "Barcode & ISRCs" (opens the panel), "Download cover art" (static
//         highest-res; becomes a dropdown — Static / Square / Vertical / All —
//         when the album has motion artwork), and "Harmony ↗" (opens a Harmony
//         cross-service release lookup for the album, pre-filled with its UPC).
//         Motion artwork is unencrypted fMP4 over HLS: we pick a variant by the
//         L/XL/Max resolution setting, then concatenate init + media segments to
//         a playable .mp4 (no decrypt/transcode). "All" → a ZIP at L, or separate
//         files at XL/Max (the 2160 videos are too large to ZIP in-page).
//       • "Download Lyrics" (logged-in only — lyrics need the Music-User-Token): a
//         dropdown of the tiers available (Word-by-Word / Line-by-Line / Static),
//         parsed from Apple's syllable-lyrics/lyrics TTML into word-LRC / line-LRC /
//         text; an album saves as a ZIP of "<disc> - <track> - <title>" files. The
//         button is hidden when nothing is downloadable.
//       • "Find ISWCs" (explicit click): looks up each track's ISWC from MusicBrainz
//         (+ a credits.fm gap-fill), shows ranked candidates with a confidence/source,
//         and a deep-link that pre-seeds a MusicBrainz edit. Human-confirmed — nothing
//         is written automatically (a planned MB-side companion enhances the seeding).
//       • A details panel (formats, barcode, metadata, a track table with ISRCs
//         and — for albums where a track's formats differ from the album-level
//         set — a per-track "Formats" column, plus an optional "Work" column for
//         classical releases that name a parent work, one-click copy, MagicISRC +
//         Harmony links, "copy as JSON").
//       • Optional inline format badges near the title.
//
//  "Submit to MagicISRC" needs the MusicBrainz release MBID, not just ISRCs (a
//  bare ISRC list opens MagicISRC blank). On explicit click ONLY, we look the
//  MBID up by the album's barcode via the MusicBrainz web service
//  (`GET musicbrainz.org/ws/2/release?query=barcode:<upc>&fmt=json`, with the
//  required descriptive User-Agent), then open
//  `magicisrc.kepstin.ca/?mbid=<mbid>&isrc1=…&isrc2=…` in track order. No UPC or
//  no MB match → a toast pointing at the Harmony button (nothing opened blank).
//     A floating "ITAM ▾" launcher is always present as a fallback (Apple's DOM
//     classes are hashed/volatile, so the panel is the reliable surface). Apple
//     Music is a single-page app, so a route observer re-runs the header logic on
//     every navigation.
//
//  Apple Music's DOM class names are volatile (hashed Svelte classes), so the
//  reliable UI lives in our own panel (mounted on document.body); inline badge
//  placement is best-effort (anchored to the heading whose text matches the
//  album name) and degrades gracefully if the layout changes.
//
//  This script ships verbatim (no build step). Keep these comments accurate when
//  you edit it — see the repo standing task on annotations.
// ===========================================================================

(function () {
  'use strict';

  /* global JSZip */ // provided by the pinned @require (cdnjs jszip 3.10.1)

  // Belt-and-braces guard: the manager's @exclude-match plus an explicit check
  // for Apple Music's commerce iframe so we don't run twice. The pathname test is
  // host-agnostic, so it covers the same iframe on classical.music.apple.com too.
  if (location.pathname === '/includes/commerce/fetch-proxy.html') return;
  if (window.__itamEnhancer_loaded) return;
  window.__itamEnhancer_loaded = true;

  // -------------------------------------------------------------------------
  //  Section 1 — constants & settings
  // -------------------------------------------------------------------------

  const API_BASE = 'https://amp-api.music.apple.com';
  const TOKEN_KEY = 'am_dev_token'; // GM-storage key for the cached {token, exp}

  // Harmony (https://harmony.pulsewidth.org.uk) cross-service release lookup. The
  // album page URL is passed as `url=` and we pre-fill `gtin=` with the album's
  // UPC for a stronger match; each provider listed below is pre-selected (a param
  // being present selects that service). Bandcamp/mora/OTOTOY are left off.
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

  // Entity page types we support (numeric id; the catalog endpoint returns the
  // fields we need). Playlists/artists are intentionally excluded.
  const SUPPORTED_TYPES = new Set(['album', 'song', 'music-video']);

  // audioTraits value → human label. Unknown traits are title-cased as a fallback;
  // "premium" traits get the accent badge, the rest are shown muted.
  const FORMAT_LABELS = {
    lossless: 'Lossless',
    'hi-res-lossless': 'Hi-Res Lossless',
    atmos: 'Dolby Atmos',
    spatial: 'Spatial Audio',
    surround: 'Surround',
    'lossy-stereo': 'Stereo',
  };
  const PREMIUM_TRAITS = new Set(['lossless', 'hi-res-lossless', 'atmos', 'spatial', 'surround']);

  const DEFAULTS = {
    showFormats: true, // FEATURE: audio-format badges (inline + in the panel)
    showBarcodeIsrc: true, // FEATURE: barcode (UPC) + per-track ISRCs (in the panel)
    perTrackFormats: true, // sub-option of showBarcodeIsrc: per-track "Formats" column for tracks whose formats differ from the album-level set
    classicalInfo: true, // FEATURE: classical "Work" column in the track table (from each track's workName; shown only when present — e.g. Apple Music Classical / any classical release)
    autoBadges: true, // sub-option of showFormats: also inject badges inline near the title
    harmonyLookup: true, // FEATURE: "Harmony ↗" header/panel button (album cross-service lookup)
    coverArt: true, // FEATURE: "Download cover art" header/panel button (static + animated)
    downloadLyrics: true, // FEATURE: "Download Lyrics" header/panel button (word-by-word / line / static; logged-in only)
    iswcLookup: true, // FEATURE: "Find ISWCs" — per-track ISWC lookup + MusicBrainz seeding (on explicit click)
    iswcSourceMb: true, // sub-option of iswcLookup: query MusicBrainz works (primary; gives the MB work id for seeding)
    iswcSourceCreditsFm: true, // sub-option of iswcLookup: query credits.fm (gap-filler when MusicBrainz has no ISWC)
    motionRes: 'L', // animated cover-art resolution: 'L' (1080) | 'XL' (2160) | 'Max' (highest)
    locale: '', // optional Apple Music locale (e.g. "en-US"); '' = storefront default
  };
  const settings = loadSettings();

  function loadSettings() {
    const s = { ...DEFAULTS };
    for (const k of Object.keys(DEFAULTS)) {
      try {
        const v = GM_getValue(k, undefined);
        if (v !== undefined && v !== null) s[k] = v;
      } catch {
        /* GM storage unavailable — keep defaults */
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

  // In-memory cache of parsed entities for this page session, keyed by id, so
  // re-opening the panel / re-injecting badges doesn't re-hit the API.
  const entityCache = new Map();

  // -------------------------------------------------------------------------
  //  Section 2 — small utilities
  // -------------------------------------------------------------------------

  const nowSec = () => Math.floor(Date.now() / 1000);

  /** Tiny hyperscript helper. Always uses textContent — never innerHTML — so
   *  API-sourced strings can't become an HTML/JS injection sink. */
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

  /** Create an SVG element (createElement uses the HTML namespace — SVG needs its
   *  own namespace or it renders blank). */
  function svgEl(tag, attrs) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs || {})) if (v != null) node.setAttribute(k, v);
    return node;
  }

  /** This userscript's version, from the manager metadata (falls back to ''). */
  function scriptVersion() {
    try {
      return (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) || '';
    } catch {
      return '';
    }
  }

  /** Milliseconds → "m:ss" (or "h:mm:ss"); '' for missing/zero. */
  function formatDuration(ms) {
    const total = Math.round((Number(ms) || 0) / 1000);
    if (!total) return '';
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${m}:${String(s).padStart(2, '0')}`;
  }

  // Apple logo glyph (simple-icons, viewBox 0 0 814 1000) for the Mastered-for-
  // iTunes badge — nominative use to denote Apple's "Apple Digital Master".
  const APPLE_GLYPH =
    'M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z';

  /** The "Mastered for iTunes" (Apple Digital Master) badge — an SVG Apple glyph +
   *  wordmark; full-strength when mastered, dimmed otherwise. */
  function masteredBadge(isMastered) {
    const svg = svgEl('svg', {
      viewBox: '0 0 814 1000',
      width: '11',
      height: '14',
      'aria-hidden': 'true',
    });
    svg.append(svgEl('path', { d: APPLE_GLYPH, fill: 'currentColor' }));
    return el(
      'span',
      {
        class: `itam-mfit${isMastered ? '' : ' off'}`,
        title: isMastered
          ? 'Apple Digital Master (Mastered for iTunes)'
          : 'Not an Apple Digital Master',
      },
      svg,
      'Mastered for iTunes',
    );
  }

  /** Show a status message. Renders an ON-PAGE toast (always visible) AND fires a
   *  native notification. The on-page toast matters because GM_notification
   *  silently no-ops when notifications aren't granted — which made downloads with
   *  no obvious file (e.g. a single .lrc) look like they "did nothing". */
  function toast(text) {
    try {
      let host = document.getElementById('itam-toasts');
      if (!host) {
        host = el('div', { id: 'itam-toasts', class: 'itam-toasts' });
        (document.body || document.documentElement).appendChild(host);
      }
      const t = el('div', { class: 'itam-toast', text });
      host.appendChild(t);
      requestAnimationFrame(() => t.classList.add('show'));
      setTimeout(() => {
        t.classList.remove('show');
        setTimeout(() => t.remove(), 300);
      }, 4000);
    } catch {
      /* ignore */
    }
    try {
      GM_notification({ title: 'ITAM Enhancer', text, silent: true, timeout: 2500 });
    } catch {
      /* ignore */
    }
  }

  /** Copy text to the clipboard and confirm. */
  function copy(text, label) {
    try {
      GM_setClipboard(String(text ?? ''));
      toast(`${label || 'Copied'} ✓`);
    } catch {
      toast('Copy failed');
    }
  }

  /** Decode a JWT header/payload (base64url JSON), or null. */
  function jwtPart(token, index) {
    try {
      const part = token.split('.')[index].replace(/-/g, '+').replace(/_/g, '/');
      const pad = '='.repeat((4 - (part.length % 4)) % 4);
      return JSON.parse(atob(part + pad));
    } catch {
      return null;
    }
  }
  const jwtHeader = (t) => jwtPart(t, 0);
  const jwtPayload = (t) => jwtPart(t, 1);

  /** Map an audioTraits array to display badges [{label, premium}]. */
  function formatBadges(traits) {
    return (traits || []).map((t) => ({
      label:
        FORMAT_LABELS[t] ||
        t.replace(/(^|[-_])(\w)/g, (_, s, c) => (s ? ' ' : '') + c.toUpperCase()),
      premium: PREMIUM_TRAITS.has(t),
    }));
  }

  /** True when two audioTraits arrays describe DIFFERENT format sets (order- and
   *  duplicate-insensitive). Used to flag tracks whose formats differ from the
   *  album-level set. */
  function traitsDiffer(a, b) {
    const sa = new Set(a || []);
    const sb = new Set(b || []);
    if (sa.size !== sb.size) return true;
    for (const t of sa) if (!sb.has(t)) return true;
    return false;
  }

  /** Build a Harmony release-lookup URL for an Apple Music album page, with our
   *  default providers pre-selected and the UPC pre-filled when known. (Each
   *  present query param selects that provider in Harmony.) */
  function buildHarmonyUrl(appleUrl, gtin) {
    const p = new URLSearchParams();
    p.set('url', appleUrl);
    p.set('gtin', gtin || '');
    p.set('region', '');
    for (const provider of HARMONY_PROVIDERS) p.set(provider, '');
    return `${HARMONY_BASE}/release?${p.toString()}`;
  }

  /** The canonical music.apple.com URL for the current entity. On
   *  classical.music.apple.com (and any future Apple Music host) Harmony's Apple
   *  provider only recognises the music.apple.com host — but the catalog id is
   *  shared, so we rebuild a slugless music.apple.com URL from the parsed page
   *  (`https://music.apple.com/<cc>/<type>/<id>`). Falls back to the current page
   *  URL if the path can't be parsed. */
  function appleMusicCanonicalUrl() {
    const page = parsePage();
    return page
      ? `https://music.apple.com/${page.country}/${page.type}/${page.id}`
      : location.origin + location.pathname;
  }

  /** Open Harmony for the current album page in a new tab. Apple intercepts
   *  in-page link clicks, so the window is opened explicitly. */
  function openHarmony(model) {
    window.open(
      buildHarmonyUrl(appleMusicCanonicalUrl(), model && model.upc),
      '_blank',
      'noopener',
    );
  }

  // --- MagicISRC via a MusicBrainz barcode lookup ---------------------------
  // MagicISRC keys a submission to a MusicBrainz release MBID (a bare ISRC list
  // opens it blank), so we resolve the MBID from the album's barcode (UPC). This
  // runs ONLY on explicit user click — never automatically.

  const MAGICISRC_BASE = 'https://magicisrc.kepstin.ca/';
  const MUSICBRAINZ_BASE = 'https://musicbrainz.org/ws/2';
  // MusicBrainz REQUIRES a descriptive User-Agent and rate-limits ~1 req/sec.
  // GM_info gives the live @version so the UA stays in step with the script.
  const MB_USER_AGENT = `ITAMEnhancer/${(typeof GM_info !== 'undefined' && GM_info?.script?.version) || '1.4.0'} (https://github.com/Skriptey/Userscripts)`;

  /** Look up a MusicBrainz release MBID by barcode (UPC). Resolves to the MBID
   *  string (preferring an Official release), or null when there are no matches.
   *  GM_xmlhttpRequest sets the descriptive User-Agent cross-origin where the
   *  manager allows it (Tampermonkey); others fall back to their default UA,
   *  which MusicBrainz still accepts. Degrades gracefully on any failure. */
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
          if (!releases.length) return resolve(null); // no MB match for this barcode
          const official = releases.find((r) => r.status === 'Official');
          resolve((official || releases[0]).id || null);
        },
        onerror: () => reject(new Error('network error')),
        ontimeout: () => reject(new Error('timeout')),
      });
    });
  }

  /** Build the MagicISRC URL for a release MBID + the album's ISRCs (in track
   *  order): `?mbid=<uuid>&isrc1=<isrc>&isrc2=<isrc>…`. */
  function buildMagicIsrcUrl(mbid, isrcs) {
    const p = new URLSearchParams();
    p.set('mbid', mbid);
    isrcs.forEach((c, i) => p.set(`isrc${i + 1}`, c));
    return `${MAGICISRC_BASE}?${p.toString()}`;
  }

  /** "Submit to MagicISRC" click handler. Resolves the album's MusicBrainz MBID
   *  from its barcode, then opens MagicISRC pre-filled with that MBID + the
   *  album's ISRCs in track order. With no UPC / no MB match, it toasts a clear
   *  pointer to the Harmony button instead of opening MagicISRC blank. Runs only
   *  on explicit user click. */
  async function submitToMagicIsrc(model) {
    const isrcs = model.tracks.map((t) => t.isrc).filter(Boolean);
    if (!isrcs.length) return; // button only shows when there are ISRCs anyway
    if (!model.upc) {
      return toast('No barcode on this release — use the Harmony button to match/add it');
    }
    toast('Looking up MusicBrainz…');
    let mbid;
    try {
      mbid = await lookupMusicBrainzMbid(model.upc);
    } catch (err) {
      return toast(`MusicBrainz lookup failed: ${err.message}`);
    }
    if (!mbid) {
      return toast(
        'No MusicBrainz release found for this barcode — use the Harmony button to match/add it',
      );
    }
    // Apple intercepts in-page link clicks; open the new tab explicitly.
    window.open(buildMagicIsrcUrl(mbid, isrcs), '_blank', 'noopener');
  }

  /** Expand an Apple artwork URL template ("…/{w}x{h}bb.jpg") to its highest
   *  available resolution (the artwork's own native width/height). */
  function maxArtworkUrl(art) {
    if (!art || !art.url) return null;
    const w = art.width || 3000;
    const h = art.height || 3000;
    return art.url
      .replace(/\{w\}/g, w)
      .replace(/\{h\}/g, h)
      .replace(/\{c\}/g, 'bb') // crop-code placeholder, only present in some templates
      .replace(/\{f\}/g, 'jpg'); // format placeholder, only present in some templates
  }

  /** Make a string safe to use as a filename fragment. */
  function safeName(s) {
    return String(s || '')
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Trigger a browser download of a Blob under the given filename. */
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  /** Fetch a binary resource cross-origin (GM_xmlhttpRequest) as a Blob. */
  function fetchBlob(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        responseType: 'blob',
        onload: (res) => {
          if (res.status >= 200 && res.status < 300 && res.response) resolve(res.response);
          else reject(new Error(`HTTP ${res.status}`));
        },
        onerror: () => reject(new Error('network error')),
        ontimeout: () => reject(new Error('timeout')),
      });
    });
  }

  /** Filename suffix per cover-art kind: static "Cover", and the two motion
   *  variants "SquareCover" / "VerticalCover" — so files land as
   *  "<artist> - <album>_<suffix>.<ext>". */
  const coverSuffix = (kind) =>
    kind === 'vertical' ? 'VerticalCover' : kind === 'square' ? 'SquareCover' : 'Cover';

  /** Download the album's highest-resolution cover art as a file named
   *  "<artist> - <album>_Cover.<ext>". */
  async function downloadCoverArt(model) {
    const url = maxArtworkUrl(model && model.artwork);
    if (!url) return toast('No cover art found');
    const extMatch = url.split('?')[0].match(/\.(jpe?g|png|webp|tiff?)$/i);
    const ext = (extMatch ? extMatch[1] : 'jpg').toLowerCase();
    const name = `${safeName(model.artist)} - ${safeName(model.name)}_${coverSuffix('static')}.${ext}`;
    toast('Downloading cover art…');
    try {
      downloadBlob(await fetchBlob(url), name);
      toast('Cover art saved ✓');
    } catch (err) {
      toast(`Cover art failed: ${err.message}`);
    }
  }

  // --- Animated (motion) cover art: HLS → concatenated fMP4 -----------------
  // Apple serves motion artwork as UNENCRYPTED fMP4 over HLS, so downloading is
  // a plain byte-concatenation of the init segment + media segments (no decrypt,
  // no transcode). See parseMaster/pickVariant/parseMedia + downloadMotionBlob.

  /** GET text cross-origin via GM_xmlhttpRequest. */
  function fetchText(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        onload: (r) =>
          r.status >= 200 && r.status < 300
            ? resolve(r.responseText)
            : reject(new Error(`HTTP ${r.status}`)),
        onerror: () => reject(new Error('network error')),
        ontimeout: () => reject(new Error('timeout')),
      });
    });
  }

  /** GET binary cross-origin via GM_xmlhttpRequest as an ArrayBuffer. */
  function fetchArrayBuffer(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        responseType: 'arraybuffer',
        onload: (r) =>
          r.status >= 200 && r.status < 300 && r.response
            ? resolve(r.response)
            : reject(new Error(`HTTP ${r.status}`)),
        onerror: () => reject(new Error('network error')),
        ontimeout: () => reject(new Error('timeout')),
      });
    });
  }

  /** The album's cover-art sources: static JPEG + the two motion HLS streams
   *  (square 1:1, vertical 3:4). Any may be null. */
  function coverSources(model) {
    const ev = model.editorialVideo || {};
    const pick = (...keys) => {
      for (const k of keys) if (ev[k] && ev[k].video) return ev[k].video;
      return null;
    };
    return {
      static: maxArtworkUrl(model.artwork),
      square: pick('motionSquareVideo1x1', 'motionDetailSquare'),
      vertical: pick('motionTallVideo3x4', 'motionDetailTall'),
    };
  }

  /** Parse an HLS master playlist into variants [{w,h,bw,url}]. */
  function parseMaster(text, base) {
    const lines = text.split(/\r?\n/);
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].startsWith('#EXT-X-STREAM-INF')) continue;
      const res = lines[i].match(/RESOLUTION=(\d+)x(\d+)/);
      const bw = lines[i].match(/BANDWIDTH=(\d+)/);
      const uri = (lines[i + 1] || '').trim();
      if (uri && !uri.startsWith('#')) {
        out.push({
          w: res ? +res[1] : 0,
          h: res ? +res[2] : 0,
          bw: bw ? +bw[1] : 0,
          url: new URL(uri, base).href,
        });
      }
    }
    return out;
  }

  /** Pick a variant by resolution preference: L≈1080, XL≈2160, Max=highest. */
  function pickVariant(variants, pref) {
    if (!variants.length) return null;
    if (pref === 'Max') return variants.slice().sort((a, b) => b.w * b.h - a.w * a.h)[0];
    const target = pref === 'XL' ? 2160 : 1080;
    return variants
      .slice()
      .sort((a, b) => Math.abs(a.w - target) - Math.abs(b.w - target) || b.w - a.w)[0];
  }

  /** Parse an HLS media playlist into { init, segments } as absolute URLs. */
  function parseMedia(text, base) {
    const mapM = text.match(/#EXT-X-MAP:URI="([^"]+)"/);
    const segments = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
      .map((u) => new URL(u, base).href);
    return { init: mapM ? new URL(mapM[1], base).href : null, segments };
  }

  /** Download one motion-artwork video as a concatenated fMP4 Blob (highest
   *  variant per `pref`). */
  async function downloadMotionBlob(masterUrl, pref) {
    const masterText = await fetchText(masterUrl);
    let mediaUrl = masterUrl;
    if (masterText.includes('#EXT-X-STREAM-INF')) {
      const chosen = pickVariant(parseMaster(masterText, masterUrl), pref);
      if (chosen) mediaUrl = chosen.url;
    }
    const { init, segments } = parseMedia(await fetchText(mediaUrl), mediaUrl);
    const parts = [];
    if (init) parts.push(new Uint8Array(await fetchArrayBuffer(init)));
    for (const seg of segments) parts.push(new Uint8Array(await fetchArrayBuffer(seg)));
    return new Blob(parts, { type: 'video/mp4' });
  }

  /** Download a single animated cover ('square'|'vertical') at the chosen res. */
  async function downloadMotion(model, kind) {
    const url = coverSources(model)[kind === 'vertical' ? 'vertical' : 'square'];
    if (!url) return toast('Not available for this album');
    toast(`Downloading ${kind} animated cover…`);
    try {
      const blob = await downloadMotionBlob(url, settings.motionRes);
      downloadBlob(
        blob,
        `${safeName(model.artist)} - ${safeName(model.name)}_${coverSuffix(kind)}.mp4`,
      );
      toast(`${kind[0].toUpperCase() + kind.slice(1)} cover saved ✓`);
    } catch (err) {
      toast(`Failed: ${err.message}`);
    }
  }

  /** "Download all": at L → one ZIP; at XL/Max → animated saved as separate
   *  files (the ~360 MB 2160 videos are too large to ZIP safely in-page). */
  async function downloadAllArt(model) {
    const src = coverSources(model);
    const artist = safeName(model.artist);
    const name = safeName(model.name);
    const motions = [
      ['square', src.square],
      ['vertical', src.vertical],
    ].filter(([, u]) => u);
    if (settings.motionRes === 'L') {
      toast('Building cover-art ZIP…');
      try {
        const zip = new JSZip();
        if (src.static) zip.file(`${coverSuffix('static')}.jpg`, await fetchBlob(src.static));
        for (const [kind, url] of motions) {
          zip.file(`${coverSuffix(kind)}.mp4`, await downloadMotionBlob(url, 'L'));
        }
        downloadBlob(await zip.generateAsync({ type: 'blob' }), `${artist} - ${name}_CoverArt.zip`);
        toast('Cover-art ZIP saved ✓');
      } catch (err) {
        toast(`ZIP failed: ${err.message}`);
      }
    } else {
      toast(`Saving separately — ${settings.motionRes} is too large to ZIP…`);
      try {
        if (src.static)
          downloadBlob(
            await fetchBlob(src.static),
            `${artist} - ${name}_${coverSuffix('static')}.jpg`,
          );
        for (const [kind, url] of motions) {
          downloadBlob(
            await downloadMotionBlob(url, settings.motionRes),
            `${artist} - ${name}_${coverSuffix(kind)}.mp4`,
          );
        }
        toast('Cover art saved (separate files) ✓');
      } catch (err) {
        toast(`Failed: ${err.message}`);
      }
    }
  }

  // -------------------------------------------------------------------------
  //  Section 3 — token capture (reuse the player's native tokens)
  // -------------------------------------------------------------------------

  /** Read the live catalog credential from the page's MusicKit instance, if any. */
  function readMusicKitDevToken() {
    try {
      const mk = unsafeWindow.MusicKit;
      const inst = mk && typeof mk.getInstance === 'function' ? mk.getInstance() : null;
      return (inst && inst.developerToken) || null;
    } catch {
      return null; // not configured yet / sandboxed away
    }
  }

  /** Fallback: scrape the catalog credential (a JWT) out of the app bundle, which
   *  is a same-origin `script[crossorigin]`. Prefer the player's own ES256 token. */
  async function scrapeBundleToken() {
    const scriptEl =
      document.querySelector('script[crossorigin][src*="/assets/index"]') ||
      document.querySelector('script[crossorigin][src]');
    if (!scriptEl) return null;
    const src = new URL(scriptEl.getAttribute('src'), location.origin).href;
    let text;
    try {
      text = await (await fetch(src, { credentials: 'omit' })).text();
    } catch {
      return null;
    }
    const candidates = [
      ...text.matchAll(/eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}/g),
    ].map((m) => m[0]);
    for (const t of candidates) {
      const p = jwtPayload(t);
      if (p && (p.iss === 'AMPWebPlay' || jwtHeader(t)?.alg === 'ES256')) return t;
    }
    return candidates[0] || null;
  }

  /** Catalog credential (required): valid cache → live MusicKit → bundle scrape.
   *  Cached keyed by the token's own JWT expiry. */
  async function getDevToken() {
    try {
      const cached = GM_getValue(TOKEN_KEY, null);
      if (cached && cached.token && cached.exp - nowSec() > 300) return cached.token;
    } catch {
      /* ignore */
    }
    let token = readMusicKitDevToken();
    if (!token) token = await scrapeBundleToken();
    if (!token) throw new Error('could not obtain the Apple Music catalog credential');
    try {
      GM_setValue(TOKEN_KEY, { token, exp: jwtPayload(token)?.exp || nowSec() + 3600 });
    } catch {
      /* ignore */
    }
    return token;
  }

  /** Music-User-Token (optional): live MusicKit instance → `media-user-token`
   *  cookie. Returns null when the user isn't logged in (anonymous catalog). */
  function getUserToken() {
    try {
      const inst = unsafeWindow.MusicKit?.getInstance?.();
      if (inst && inst.musicUserToken) return inst.musicUserToken;
    } catch {
      /* not authorised / sandboxed */
    }
    const m = document.cookie.match(/(?:^|;\s*)media-user-token=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }

  // -------------------------------------------------------------------------
  //  Section 4 — Apple Music catalog API
  // -------------------------------------------------------------------------

  /** GET an amp-api path → parsed JSON. GM_xmlhttpRequest lets us set Origin and
   *  bypass page CORS; we add Media-User-Token when the user is logged in. */
  function apiGet(path, devToken, userToken) {
    const headers = { Authorization: `Bearer ${devToken}`, Origin: 'https://music.apple.com' };
    if (userToken) headers['Media-User-Token'] = userToken;
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: API_BASE + path,
        headers,
        onload: (res) => {
          if (res.status < 200 || res.status >= 300) {
            const e = new Error(`API HTTP ${res.status}`);
            e.status = res.status; // let callers (e.g. lyrics) report the code
            return reject(e);
          }
          try {
            resolve(JSON.parse(res.responseText));
          } catch {
            reject(new Error('API returned non-JSON'));
          }
        },
        onerror: () => reject(new Error('network error')),
        ontimeout: () => reject(new Error('timeout')),
      });
    });
  }

  /** Fetch + normalise one entity (album/song/music-video) into a flat model. */
  async function fetchEntity(page) {
    if (entityCache.has(page.id)) return entityCache.get(page.id);
    const devToken = await getDevToken();
    const userToken = getUserToken(); // may be null (logged out)
    const plural = page.type + 's'; // album→albums, song→songs, music-video→music-videos
    const params = new URLSearchParams();
    if (page.type === 'album') {
      params.set('include', 'tracks');
      // editorialVideo → motion-artwork URLs (HLS); audioTraits → each track's
      // own format set (so we can flag tracks that differ from the album-level
      // set). Comma-joined as amp-api expects.
      params.set('extend', 'editorialVideo,audioTraits');
    }
    if (settings.locale) params.set('l', settings.locale);
    const qs = params.toString() ? `?${params}` : '';
    const json = await apiGet(
      `/v1/catalog/${page.country}/${plural}/${page.id}${qs}`,
      devToken,
      userToken,
    );
    const model = parseEntity(json, page.type);
    if (!model) throw new Error('unexpected API response shape');
    model.loggedIn = !!userToken;
    model.country = page.country; // storefront — used to build the lyrics endpoints
    entityCache.set(page.id, model);
    return model;
  }

  /** Turn an amp-api response into { kind, name, artist, …, tracks: [...] }. */
  function parseEntity(json, type) {
    const data = json && Array.isArray(json.data) ? json.data[0] : null;
    if (!data || !data.attributes) return null;
    const a = data.attributes;

    const model = {
      kind: type,
      name: a.name || '',
      artist: a.artistName || '',
      releaseDate: a.releaseDate || '',
      label: a.recordLabel,
      copyright: a.copyright,
      upc: a.upc,
      masteredForItunes: a.isMasteredForItunes,
      audioTraits: a.audioTraits || [], // raw album-level traits (for per-track diff)
      formats: formatBadges(a.audioTraits),
      artwork: a.artwork || null, // { url: "…/{w}x{h}…", width, height, … }
      editorialVideo: a.editorialVideo || null, // motion artwork (HLS) — albums only
      tracks: [],
    };

    if (type === 'album') {
      const trackData = data.relationships?.tracks?.data || [];
      model.tracks = trackData
        .filter((t) => t && t.attributes)
        .map((t) => ({
          id: t.id, // catalog song id — needed to fetch this track's lyrics
          disc: t.attributes.discNumber || 1,
          track: t.attributes.trackNumber || 0,
          name: t.attributes.name || '',
          artist: t.attributes.artistName || '',
          composer: t.attributes.composerName,
          isrc: t.attributes.isrc || '',
          durationMillis: t.attributes.durationInMillis || 0,
          releaseDate: t.attributes.releaseDate || '',
          // Lyrics availability flags (gate the Download Lyrics tiers). Kept RAW —
          // may be undefined if amp-api omits them for album tracks (verify
          // in-browser; lyricsAvailability falls back to best-effort when absent).
          hasLyrics: t.attributes.hasLyrics,
          hasTimeSyncedLyrics: t.attributes.hasTimeSyncedLyrics,
          // Classical metadata: the parent work and the movement within it. Apple
          // populates these for classical releases (e.g. on Apple Music Classical);
          // empty for non-classical tracks. The panel surfaces workName as an
          // optional "Work" column (when classicalInfo is on and any track names a
          // work); movementName is kept for the Copy-as-JSON export — the track
          // Title already shows it inline, so it gets no column of its own.
          workName: t.attributes.workName || '',
          movementName: t.attributes.movementName || '',
          // Per-track formats (present only with extend=audioTraits). A track
          // CAN differ from the album-level set; the panel flags such tracks.
          audioTraits: t.attributes.audioTraits || [],
          formats: formatBadges(t.attributes.audioTraits),
        }));
    } else {
      // song / music-video: the single "track" IS the entity, so it carries the
      // entity's own ISRC and formats.
      model.tracks = [
        {
          id: data.id, // the song / music-video IS the entity; its id fetches its lyrics
          disc: 1,
          track: 1,
          name: a.name || '',
          artist: a.artistName || '',
          isrc: a.isrc || '',
          durationMillis: a.durationInMillis || 0,
          releaseDate: a.releaseDate || '',
          hasLyrics: a.hasLyrics,
          hasTimeSyncedLyrics: a.hasTimeSyncedLyrics,
          workName: a.workName || '',
          movementName: a.movementName || '',
          audioTraits: a.audioTraits || [],
          formats: formatBadges(a.audioTraits),
        },
      ];
    }
    return model;
  }

  // -------------------------------------------------------------------------
  //  Section 4b — lyrics (synced + word-by-word) → LRC / text
  // -------------------------------------------------------------------------
  //
  //  Apple serves lyrics as TTML on two song relationships, BOTH gated behind the
  //  logged-in Music-User-Token (anonymous catalog returns "no related resources"):
  //    • syllable-lyrics — WORD-BY-WORD (Apple Music "Sing"); each <p> line's <span>s
  //      carry per-word begin/end times.
  //    • lyrics          — LINE-SYNCED; each <p> line carries begin/end (no word spans).
  //  We fetch the TTML, parse it to a small {lines:[{begin,end,text,words[]}]} model,
  //  and emit enhanced ("A2") word-LRC, plain line-LRC, or timing-stripped text. An
  //  album downloads as a ZIP of per-track files named "<disc> - <track> - <title>".
  //  NB the endpoint needs a subscriber session, so it can't be reached when logged
  //  out — verify the TTML shape in-browser when editing this section.

  /** Parse a TTML timecode ("1:03.480" | "63.48" | "00:01:03.480" | "1003ms") → seconds. */
  function ttmlTimeToSec(t) {
    if (!t) return 0;
    t = String(t).trim();
    let m = t.match(/^([\d.]+)ms$/i);
    if (m) return parseFloat(m[1]) / 1000;
    m = t.match(/^([\d.]+)s$/i);
    if (m) return parseFloat(m[1]);
    const parts = t.split(':').map(Number);
    if (parts.some((n) => Number.isNaN(n))) return 0;
    return parts.reduce((acc, n) => acc * 60 + n, 0); // h:m:s | m:s | s
  }

  /** Format seconds as an LRC timestamp, e.g. secToLrc(63.48) → "[01:03.48]". */
  function secToLrc(sec, open = '[', close = ']') {
    sec = Math.max(0, sec || 0);
    const mins = Math.floor(sec / 60);
    const secs = (sec - mins * 60).toFixed(2);
    return `${open}${String(mins).padStart(2, '0')}:${secs.padStart(5, '0')}${close}`;
  }

  /** Parse Apple lyrics TTML → { wordTimed, lines:[{begin,end,text,words:[…]}] } or
   *  null. Uses DOMParser (XML); tolerant of the line- and word-timed variants. */
  function parseLyricsTtml(ttml) {
    let doc;
    try {
      doc = new DOMParser().parseFromString(ttml, 'application/xml');
    } catch {
      return null;
    }
    if (!doc || doc.getElementsByTagName('parsererror').length) return null;
    const ps = [...doc.getElementsByTagName('p')];
    if (!ps.length) return null;
    let wordTimed = false;
    let lineTimed = false;
    const lines = ps.map((p) => {
      const words = [...p.getElementsByTagName('span')]
        .filter((sp) => sp.getAttribute('begin'))
        .map((sp) => ({
          begin: ttmlTimeToSec(sp.getAttribute('begin')),
          end: ttmlTimeToSec(sp.getAttribute('end')),
          text: sp.textContent || '',
        }));
      if (words.length) wordTimed = true;
      if (p.getAttribute('begin')) lineTimed = true;
      return {
        begin: ttmlTimeToSec(p.getAttribute('begin')),
        end: ttmlTimeToSec(p.getAttribute('end')),
        text: (p.textContent || '').replace(/\s+/g, ' ').trim(),
        words,
      };
    });
    return { wordTimed, lineTimed, lines };
  }

  /** Enhanced "A2" word-LRC: "[mm:ss.cc]<mm:ss.cc>word<mm:ss.cc>word…" per line.
   *  Lines without per-word timing fall back to a line timestamp + text. */
  function lyricsToWordLrc(parsed) {
    return parsed.lines
      .map((ln) =>
        ln.words.length
          ? secToLrc(ln.begin) + ln.words.map((w) => secToLrc(w.begin, '<', '>') + w.text).join('')
          : secToLrc(ln.begin) + ln.text,
      )
      .join('\n');
  }

  /** Standard line-LRC: "[mm:ss.cc]line". */
  function lyricsToLineLrc(parsed) {
    return parsed.lines.map((ln) => secToLrc(ln.begin) + ln.text).join('\n');
  }

  /** Timing-stripped plain text. */
  function lyricsToPlain(parsed) {
    return parsed.lines.map((ln) => ln.text).join('\n');
  }

  /** GET a song's lyrics TTML for one kind ('syllable-lyrics' | 'lyrics'); null when
   *  unavailable (logged out, or the song lacks that lyric type → amp-api 404). */
  async function fetchLyricsTtml(country, songId, kind, devToken, userToken) {
    const qs = settings.locale ? `?l=${encodeURIComponent(settings.locale)}` : '';
    let json;
    try {
      json = await apiGet(
        `/v1/catalog/${country}/songs/${songId}/${kind}${qs}`,
        devToken,
        userToken,
      );
    } catch (err) {
      // Log the status (NOT the lyrics) so a failing endpoint/auth is diagnosable.
      console.warn(`[ITAM] lyrics ${kind} ${songId}: ${err.status || err.message}`);
      return null;
    }
    const ttml = json && json.data && json.data[0] && json.data[0].attributes?.ttml;
    if (typeof ttml === 'string' && ttml) return ttml;
    console.warn(`[ITAM] lyrics ${kind} ${songId}: 200 but no ttml in response`);
    return null;
  }

  /** Resolve one track's lyrics in the requested tier, AUTOMATICALLY FALLING BACK
   *  to the next-best available format when the track lacks the preferred one:
   *    word  → line → static
   *    line  → static
   *    static
   *  (the preferred format is whatever was picked from the Download Lyrics menu.)
   *  Returns { text, ext, kind } — `kind` is the format actually produced
   *  ('word'|'line'|'static') — or null when the track has no lyrics at all. */
  async function trackLyrics(country, songId, tier, devToken, userToken) {
    // syllable-lyrics carries WORD timing; lyrics carries LINE timing + the text
    // (and is the static source). Only fetch the word endpoint when it's wanted.
    const kinds = tier === 'word' ? ['syllable-lyrics', 'lyrics'] : ['lyrics'];
    let best = null; // richest parse seen (prefer the word-timed one)
    for (const kind of kinds) {
      const ttml = await fetchLyricsTtml(country, songId, kind, devToken, userToken);
      if (!ttml) continue;
      const parsed = parseLyricsTtml(ttml);
      if (!parsed || !parsed.lines.length) continue;
      // Keep the richest parse: a word-timed one always wins; otherwise a
      // line-timed one beats an untimed one (covers a word endpoint that parsed
      // but carried no usable timing, so the line endpoint is still preferred).
      if (
        !best ||
        (parsed.wordTimed && !best.wordTimed) ||
        (!best.wordTimed && !best.lineTimed && parsed.lineTimed)
      )
        best = parsed;
      if (parsed.wordTimed) break; // already the richest form — stop early
    }
    if (!best || !best.lines.length) return null;
    // Step down from the requested tier to whatever the data actually supports.
    if (tier === 'word' && best.wordTimed)
      return { text: lyricsToWordLrc(best), ext: 'lrc', kind: 'word' };
    if (tier !== 'static' && best.lineTimed)
      return { text: lyricsToLineLrc(best), ext: 'lrc', kind: 'line' };
    return { text: lyricsToPlain(best), ext: 'txt', kind: 'static' };
  }

  /** "<disc> - <NN> - <title>" filename stem (track number zero-padded). */
  function lyricsFileStem(t) {
    return `${t.disc || 1} - ${String(t.track || 0).padStart(2, '0')} - ${safeName(t.name) || 'Untitled'}`;
  }

  /** Which lyric tiers can be downloaded now? Requires login; gated by the per-track
   *  hasLyrics/hasTimeSyncedLyrics flags. When those flags are absent (amp-api may omit
   *  them on album tracks), fall back to offering all tiers — the download then skips
   *  tracks that turn out to have no lyrics. */
  function lyricsAvailability(model) {
    if (!model.loggedIn) return { word: false, line: false, static: false };
    const flagsKnown = model.tracks.some(
      (t) => t.hasLyrics !== undefined || t.hasTimeSyncedLyrics !== undefined,
    );
    if (!flagsKnown) return { word: true, line: true, static: true };
    const anySynced = model.tracks.some((t) => t.hasTimeSyncedLyrics);
    const anyLyrics = model.tracks.some((t) => t.hasLyrics || t.hasTimeSyncedLyrics);
    return { word: anySynced, line: anySynced, static: anyLyrics };
  }

  const TIER_RANK = { word: 3, line: 2, static: 1 };

  /** Download the entity's lyrics in `tier` ('word'|'line'|'static'). Album → a ZIP
   *  of per-track files; single song → one file. Each track independently falls
   *  back to the next-best format it has (see trackLyrics), and tracks with no
   *  lyrics are skipped. Per-track failures are isolated, and EVERY outcome ends
   *  in a toast — so a single bad track (or any error) can never fail silently,
   *  which is what made an earlier word-by-word download "do nothing".
   *  Requires a logged-in subscriber session (the endpoints need the user token). */
  async function downloadLyrics(model, tier) {
    const tierLabel = { word: 'word-by-word', line: 'line-by-line', static: 'static' }[tier];
    try {
      const tracks = model.tracks.filter((t) => t.id);
      if (!tracks.length) return toast('No tracks to fetch lyrics for');
      const userToken = getUserToken();
      if (!userToken) return toast('Log in to Apple Music to download lyrics');
      const devToken = await getDevToken();
      toast(`Fetching ${tierLabel} lyrics…`);

      const out = [];
      const fellBack = new Set();
      for (const t of tracks) {
        let lyr = null;
        try {
          lyr = await trackLyrics(model.country, t.id, tier, devToken, userToken);
        } catch (err) {
          // Isolate a bad track so it can't abort the whole batch.
          console.warn('[ITAM] lyrics failed for track', t.name, err);
        }
        if (lyr) {
          out.push({ t, ...lyr });
          if ((TIER_RANK[lyr.kind] || 0) < (TIER_RANK[tier] || 0)) fellBack.add(lyr.kind);
        }
      }
      if (!out.length) return toast('No lyrics returned for this release (see console for status)');
      const note = fellBack.size ? ` (some fell back to ${[...fellBack].sort().join(' / ')})` : '';

      if (model.kind !== 'album' || out.length === 1) {
        const r = out[0];
        downloadBlob(
          new Blob([r.text], { type: 'text/plain;charset=utf-8' }),
          `${lyricsFileStem(r.t)}.${r.ext}`,
        );
        return toast(`Lyrics saved ✓${note}`);
      }
      const zip = new JSZip();
      for (const r of out) zip.file(`${lyricsFileStem(r.t)}.${r.ext}`, r.text);
      const tag = tierLabel.replace(/[^a-z]/gi, '');
      downloadBlob(
        await zip.generateAsync({ type: 'blob' }),
        `${safeName(model.artist)} - ${safeName(model.name)}_Lyrics_${tag}.zip`,
      );
      toast(`Lyrics ZIP saved (${out.length} of ${tracks.length} tracks)${note} ✓`);
    } catch (err) {
      toast(`Lyrics failed: ${err.message}`);
    }
  }

  // -------------------------------------------------------------------------
  //  Section 4c — ISWC lookup (MusicBrainz + credits.fm) → MusicBrainz seeding
  // -------------------------------------------------------------------------
  //
  //  Apple exposes writers (composerName) but NO ISWC. On explicit click we look each
  //  track's ISWC up from two free sources and present RANKED CANDIDATES the user
  //  confirms, plus a deep-link that pre-seeds a MusicBrainz edit (the planned Phase-2
  //  MB-side companion enhances the seeding). Nothing is ever written automatically.
  //    • MusicBrainz — GET /ws/2/work?query=work:"<title>" AND artist:"<writer>"&fmt=json
  //      → works with `score` (0–100), `id` (the MB work MBID, used for seeding) and an
  //      `iswcs` array (present only when MB already knows one). @connect musicbrainz.org
  //      + descriptive UA, ≤1 req/sec (so an album is looked up sequentially).
  //    • credits.fm — GET api.credits.fm/v1/search?q=<title> → songs.items[{iswc,title}]
  //      (CORS-open; aggregates CISAC/MLC/MB). A gap-filler when MB has no ISWC; the index
  //      is noisy, so we title-match. credits.fm/MLC/CISAC ISWCs are HINTS to verify, not
  //      facts (CC-BY) — never machine-imported.
  //  Confidence = source agreement + MB score + a writer/title match. Title-only matching
  //  is unreliable, so a human always confirms before seeding. (The lookup endpoints are
  //  verifiable; the overlay UI needs an in-browser check when editing.)

  const CREDITSFM_BASE = 'https://api.credits.fm/v1';

  /** Normalise an ISWC for display: "T-DDD.DDD.DDD-D" (or '' if it isn't one). */
  function normIswc(s) {
    const m = String(s || '')
      .toUpperCase()
      .replace(/[^0-9T]/g, '')
      .match(/^T?(\d{10})$/);
    if (!m) return '';
    const d = m[1];
    return `T-${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  /** Digits-only ISWC key for dedupe/compare. */
  const iswcKey = (s) =>
    String(s || '')
      .toUpperCase()
      .replace(/[^0-9]/g, '');

  /** Title reduced for matching: drop (feat. …)/[Remastered]/" - 2013 Mix", lower-case. */
  function normTitle(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
      .replace(/\s*-\s*.*$/, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  /** Surnames from a free-text composer credit ("A B, C D & E F" → ["B","D","F"]). */
  function writerSurnames(composer) {
    return String(composer || '')
      .split(/,|&|\/| and /i)
      .map((n) => n.trim().split(/\s+/).pop())
      .filter((n) => n && n.length > 1);
  }

  /** Lucene-escape a value for a MusicBrainz query. */
  function mbEscape(s) {
    return String(s || '').replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, '\\$&');
  }

  /** Search MusicBrainz works by title (+ optional writer surname). Resolves to
   *  candidates [{ iswc, iswcKey, mbid, score, title }] (iswc '' when MB has none).
   *  Never rejects — resolves [] on any error (best-effort lookup). */
  function mbWorkSearch(title, surname) {
    let q = `work:"${mbEscape(title)}"`;
    if (surname) q += ` AND artist:"${mbEscape(surname)}"`;
    const url = `${MUSICBRAINZ_BASE}/work?query=${encodeURIComponent(q)}&fmt=json&limit=5`;
    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        headers: { 'User-Agent': MB_USER_AGENT, Accept: 'application/json' },
        onload: (res) => {
          let data;
          try {
            data = JSON.parse(res.responseText);
          } catch {
            return resolve([]);
          }
          const works = Array.isArray(data.works) ? data.works : [];
          resolve(
            works.map((w) => {
              const raw = (Array.isArray(w.iswcs) && w.iswcs[0]) || '';
              return {
                iswc: normIswc(raw),
                iswcKey: iswcKey(raw),
                mbid: w.id || '',
                score: +w.score || 0,
                title: w.title || '',
              };
            }),
          );
        },
        onerror: () => resolve([]),
        ontimeout: () => resolve([]),
      });
    });
  }

  /** Search credits.fm for ISWC candidates by title. Resolves to [{ iswc, iswcKey, title }].
   *  (q is lower-cased to avoid the API's case-redirect.) */
  function creditsFmSearch(title) {
    const url = `${CREDITSFM_BASE}/search?q=${encodeURIComponent(String(title).toLowerCase())}`;
    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        headers: { Accept: 'application/json' },
        onload: (res) => {
          let data;
          try {
            data = JSON.parse(res.responseText);
          } catch {
            return resolve([]);
          }
          const items = (data.songs && data.songs.items) || [];
          resolve(
            items
              .filter((it) => it.iswc)
              .map((it) => ({
                iswc: normIswc(it.iswc),
                iswcKey: iswcKey(it.iswc),
                title: it.title || '',
              })),
          );
        },
        onerror: () => resolve([]),
        ontimeout: () => resolve([]),
      });
    });
  }

  /** Look one track's ISWC up across the enabled sources. Returns
   *  { title, iswc, mbid, sources:[…], confidence:'high'|'medium'|'low'|'none' }. */
  async function lookupTrackIswc(track) {
    const title = track.name || '';
    const surnames = writerSurnames(track.composer);
    const nt = normTitle(title);

    const mb = settings.iswcSourceMb ? await mbWorkSearch(title, surnames[0]) : [];
    const mbBest =
      mb.filter((c) => c.iswcKey).sort((a, b) => b.score - a.score)[0] ||
      mb.slice().sort((a, b) => b.score - a.score)[0] ||
      null;

    // Only spend a credits.fm call when MusicBrainz didn't already supply an ISWC.
    let cf = [];
    if (settings.iswcSourceCreditsFm && (!mbBest || !mbBest.iswcKey)) {
      cf = (await creditsFmSearch(title)).filter((c) => {
        const ct = normTitle(c.title);
        return ct === nt || ct.includes(nt) || nt.includes(ct);
      });
    }

    // Merge candidates by ISWC key (source agreement is the strongest signal).
    const byKey = new Map();
    const add = (iswc, key, src, score) => {
      if (!key) return;
      const e = byKey.get(key) || { iswc, sources: new Set(), score: 0 };
      e.sources.add(src);
      e.score = Math.max(e.score, score || 0);
      byKey.set(key, e);
    };
    mb.forEach((c) => add(c.iswc, c.iswcKey, 'MusicBrainz', c.score));
    cf.forEach((c) => add(c.iswc, c.iswcKey, 'credits.fm', 70));

    const best = [...byKey.values()].sort(
      (a, b) => b.sources.size - a.sources.size || b.score - a.score,
    )[0];

    let confidence = 'none';
    if (best) {
      const corroborated = best.sources.size >= 2;
      const strongMb = best.sources.has('MusicBrainz') && best.score >= 90;
      if (corroborated || (strongMb && surnames.length)) confidence = 'high';
      else if (best.score >= 80 || best.sources.has('MusicBrainz')) confidence = 'medium';
      else confidence = 'low';
    }
    return {
      title,
      writers: track.composer || '', // free-text writer credit, passed to the MB seeder
      iswc: best ? best.iswc : '',
      mbid: mbBest ? mbBest.mbid : '',
      sources: best ? [...best.sources] : [],
      confidence,
    };
  }

  /** Deep-link that pre-seeds a MusicBrainz edit for a track's ISWC: an existing work →
   *  its edit form with the ISWC seeded; otherwise the Add-Work form seeded with title +
   *  ISWC. MusicBrainz seeds form inputs from query params named like the field. */
  function mbSeedUrl(rec) {
    const p = new URLSearchParams();
    if (rec.iswc) p.set('edit-work.iswcs.0', rec.iswc);
    // ITAM markers — read by the optional MB-side companion (MB ISWC Seeder) to surface
    // the ISWC + writers on the edit page; MusicBrainz ignores unknown query params.
    p.set('itam', '1');
    if (rec.iswc) p.set('itam-iswc', rec.iswc);
    if (rec.title) p.set('itam-title', rec.title);
    if (rec.writers) p.set('itam-writers', rec.writers);
    if (rec.mbid) return `https://musicbrainz.org/work/${rec.mbid}/edit?${p}`;
    p.set('edit-work.name', rec.title || '');
    return `https://musicbrainz.org/work/create?${p}`;
  }

  /** Open the ISWC results overlay and look each track up on demand. Sequential
   *  because MusicBrainz rate-limits to ~1 req/sec; the table fills in as it goes. */
  async function findIswcs(model) {
    const tracks = model.tracks.filter((t) => t.name);
    if (!tracks.length) return toast('No tracks to look up');
    document.querySelector('.itam-overlay')?.remove();
    const panel = el('div', { class: 'itam-panel' });
    const overlay = el('div', { class: 'itam-overlay' }, panel);
    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    panel.append(el('button', { class: 'itam-close', text: '×', onclick: close, title: 'Close' }));
    panel.append(el('h2', { text: 'ISWC lookup' }));
    panel.append(el('h3', { text: `${model.artist || ''} — ${model.name || ''}` }));
    const count = el('span', { text: `0/${tracks.length}` });
    const status = el('div', { class: 'itam-row' }, el('b', { text: 'Looking up… ' }), count);
    panel.append(status);
    const tbody = el('tbody');
    const head = el('tr');
    ['#', 'Title', 'ISWC', 'Confidence', 'Source', ''].forEach((h) =>
      head.append(el('th', { text: h })),
    );
    panel.append(el('table', { class: 'itam-table' }, el('thead', {}, head), tbody));
    document.body.append(overlay);

    const found = [];
    for (let i = 0; i < tracks.length; i++) {
      const t = tracks[i];
      const rec = await lookupTrackIswc(t); // sequential: MusicBrainz is ~1 req/sec
      if (rec.iswc) found.push(rec.iswc);
      const tr = el('tr');
      tr.append(el('td', { text: t.track ? `${t.disc}.${t.track}` : String(i + 1) }));
      tr.append(el('td', { text: t.name }));
      tr.append(
        el('td', {
          class: 'itam-mono itam-isrc',
          text: rec.iswc || '—',
          title: rec.iswc ? 'Click to copy' : '',
          onclick: () => rec.iswc && copy(rec.iswc, 'ISWC copied'),
        }),
      );
      tr.append(el('td', { text: rec.confidence === 'none' ? '—' : rec.confidence }));
      tr.append(el('td', { text: rec.sources.join(', ') || '—' }));
      const seedTd = el('td');
      if (rec.iswc || rec.mbid) {
        const url = mbSeedUrl(rec);
        const a = el('a', {
          class: 'itam-btn',
          text: 'Seed MB ↗',
          href: url,
          target: '_blank',
          rel: 'noopener',
          title: rec.mbid
            ? 'Seed the ISWC onto the existing MusicBrainz work'
            : 'Seed a new MusicBrainz work',
        });
        a.addEventListener('click', (e) => {
          e.preventDefault();
          window.open(url, '_blank', 'noopener');
        });
        seedTd.append(a);
      }
      tr.append(seedTd);
      tbody.append(tr);
      count.textContent = `${i + 1}/${tracks.length}`;
    }
    status.firstChild.textContent = 'Done — ';
    if (found.length) {
      panel.append(
        el(
          'div',
          { class: 'itam-actions' },
          el('button', {
            class: 'itam-btn',
            text: `Copy all ISWCs (${found.length})`,
            onclick: () => copy(found.join('\n'), `${found.length} ISWCs copied`),
          }),
        ),
      );
    }
    panel.append(
      el('div', {
        class: 'itam-foot',
        text: 'Candidates from MusicBrainz + credits.fm — confirm the writers match before seeding. credits.fm data is CC-BY; treat ISWCs as hints to verify, not facts to import.',
      }),
    );
  }

  /** "Find ISWCs" button. Returns null when the feature is off or there's nothing
   *  to look up. */
  function iswcControl(model, btnClass) {
    if (!settings.iswcLookup || !model.tracks.some((t) => t.name)) return null;
    return el('button', {
      class: btnClass,
      text: 'Find ISWCs',
      title: "Look up each track's ISWC (MusicBrainz + credits.fm) and seed MusicBrainz",
      onclick: () => findIswcs(model),
    });
  }

  // -------------------------------------------------------------------------
  //  Section 5 — page detection
  // -------------------------------------------------------------------------

  /** Parse the current Apple Music URL into { country, type, id } or null. */
  function parsePage() {
    const parts = location.pathname.split('/').filter(Boolean); // [cc, type, slug, id]
    const country = parts[0];
    const type = parts[1];
    const id = parts.reverse().find((p) => /^\d+$/.test(p)); // last numeric segment
    if (!country || !type || !id || !SUPPORTED_TYPES.has(type)) return null;
    return { country, type, id };
  }

  // -------------------------------------------------------------------------
  //  Section 6 — styling
  // -------------------------------------------------------------------------

  GM_addStyle(`
    .itam-launch { position:fixed; right:16px; bottom:16px; z-index:2147483646;
      background:#fa2d48; color:#fff; border:0; border-radius:999px; padding:9px 14px;
      font:600 13px system-ui,-apple-system,sans-serif; cursor:pointer;
      box-shadow:0 3px 12px rgba(0,0,0,.35); }
    .itam-launch:hover { filter:brightness(1.08); }
    .itam-launch:disabled { opacity:.6; cursor:default; }
    .itam-badges { display:inline-flex; flex-wrap:wrap; gap:6px; margin:8px 0; vertical-align:middle; }
    .itam-badge { font:600 11px/1.3 system-ui,sans-serif; padding:3px 8px; border-radius:6px;
      background:rgba(127,127,127,.2); color:inherit; }
    .itam-badge.premium { background:#fa2d48; color:#fff; }
    /* Compact badges for the per-track "Formats" table column. */
    .itam-badges-sm { display:flex; flex-wrap:wrap; gap:4px; }
    .itam-badges-sm .itam-badge { font-size:10px; padding:2px 6px; border-radius:5px; }
    .itam-inline-actions { display:flex; flex-wrap:wrap; gap:8px; margin:10px 0; align-items:center; }
    .itam-chip { display:inline-flex; align-items:center; gap:5px; cursor:pointer;
      background:rgba(127,127,127,.16); color:inherit; border:1px solid rgba(127,127,127,.28);
      border-radius:8px; padding:6px 12px; font:600 12px/1 system-ui,-apple-system,sans-serif; }
    .itam-chip:hover { background:#fa2d48; color:#fff; border-color:#fa2d48; }
    .itam-chip[disabled] { opacity:.6; cursor:default; pointer-events:none; }
    .itam-dd { position:relative; display:inline-block; }
    .itam-dd-menu { display:none; position:absolute; z-index:2147483647; top:calc(100% + 4px); left:0;
      min-width:184px; background:#1c1c1e; color:#f2f2f7; border:1px solid #3a3a3c; border-radius:10px;
      padding:4px; box-shadow:0 12px 34px rgba(0,0,0,.5); }
    .itam-dd.open .itam-dd-menu { display:block; }
    .itam-dd-item { display:block; width:100%; text-align:left; background:none; border:0; color:inherit;
      padding:7px 11px; border-radius:7px; cursor:pointer; white-space:nowrap;
      font:13px system-ui,-apple-system,sans-serif; }
    .itam-dd-item:hover { background:#fa2d48; color:#fff; }
    .itam-overlay { position:fixed; inset:0; z-index:2147483647; background:rgba(0,0,0,.55);
      display:flex; align-items:flex-start; justify-content:center; padding:5vh 12px; }
    /* Width grows with the viewport (up to a cap) and shrinks on narrow screens;
       container-type lets the track table hide columns responsively (below). */
    .itam-panel { width:min(1760px,94vw); max-height:90vh; overflow:auto; container-type:inline-size;
      background:#1c1c1e; color:#f2f2f7; border:1px solid #3a3a3c; border-radius:14px;
      padding:18px 20px; font:14px/1.5 system-ui,-apple-system,sans-serif;
      box-shadow:0 18px 50px rgba(0,0,0,.6); }
    .itam-panel h2 { margin:0 0 2px; font-size:20px; }
    .itam-panel h3 { margin:0 0 12px; font-size:14px; font-weight:500; color:#aeaeb2; }
    .itam-row { margin:6px 0; }
    .itam-row b { color:#aeaeb2; font-weight:600; }
    .itam-mono { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; user-select:all; }
    .itam-actions { display:flex; flex-wrap:wrap; gap:8px; margin:12px 0; }
    .itam-btn { background:#2c2c2e; color:#f2f2f7; border:1px solid #48484a; border-radius:8px;
      padding:6px 11px; font:13px system-ui,sans-serif; cursor:pointer; text-decoration:none; }
    .itam-btn:hover { background:#3a3a3c; }
    .itam-btn.accent { background:#fa2d48; border-color:#fa2d48; color:#fff; }
    .itam-table { width:100%; border-collapse:collapse; margin-top:8px; font-size:13px; }
    .itam-table th, .itam-table td { text-align:left; padding:5px 8px; border-bottom:1px solid #2c2c2e; vertical-align:top; }
    .itam-table th { position:sticky; top:0; background:#1c1c1e; color:#aeaeb2; }
    .itam-isrc { cursor:pointer; }
    .itam-isrc:hover { color:#fa2d48; }
    .itam-close { float:right; background:none; border:0; color:#aeaeb2; font-size:22px; cursor:pointer; line-height:1; }
    .itam-foot { margin-top:10px; font-size:11px; color:#8e8e93; }
    .itam-col-len, .itam-table th.itam-col-len { text-align:right; white-space:nowrap; }
    .itam-mfit { display:inline-flex; align-items:center; gap:6px; padding:3px 9px; border-radius:6px;
      border:1px solid currentColor; font:600 12px/1 system-ui,sans-serif; }
    .itam-mfit svg { display:block; }
    .itam-mfit.off { opacity:.4; }
    /* Hide the Composer column when the panel is too narrow to fit it. */
    @container (max-width: 620px) { .itam-col-composer { display:none; } }
    /* On-page status toasts (visible even when GM_notification isn't granted). */
    .itam-toasts { position:fixed; left:50%; bottom:24px; transform:translateX(-50%);
      z-index:2147483647; display:flex; flex-direction:column; gap:8px; align-items:center;
      pointer-events:none; }
    .itam-toast { background:#1c1c1e; color:#f2f2f7; border:1px solid #48484a; border-radius:10px;
      padding:9px 14px; font:600 13px system-ui,sans-serif; box-shadow:0 8px 24px rgba(0,0,0,.5);
      max-width:80vw; opacity:0; transform:translateY(8px); transition:opacity .25s, transform .25s; }
    .itam-toast.show { opacity:1; transform:translateY(0); }
    @media (prefers-color-scheme: light) {
      .itam-panel { background:#fff; color:#1c1c1e; border-color:#d1d1d6; }
      .itam-dd-menu { background:#fff; color:#1c1c1e; border-color:#d1d1d6; }
      .itam-panel h3 { color:#6c6c70; }
      .itam-row b { color:#6c6c70; }
      .itam-btn { background:#f2f2f7; color:#1c1c1e; border-color:#d1d1d6; }
      .itam-btn:hover { background:#e5e5ea; }
      .itam-table th { background:#fff; color:#6c6c70; }
      .itam-table th, .itam-table td { border-bottom-color:#e5e5ea; }
    }
  `);

  // -------------------------------------------------------------------------
  //  Section 7 — UI: format badges + details panel
  // -------------------------------------------------------------------------

  function renderBadges(formats) {
    const wrap = el('div', { class: 'itam-badges' });
    for (const f of formats) {
      wrap.append(el('span', { class: `itam-badge${f.premium ? ' premium' : ''}`, text: f.label }));
    }
    return wrap;
  }

  /** Compact format badges for the per-track "Formats" table column. */
  function renderBadgesSm(formats) {
    const wrap = el('div', { class: 'itam-badges-sm' });
    for (const f of formats) {
      wrap.append(el('span', { class: `itam-badge${f.premium ? ' premium' : ''}`, text: f.label }));
    }
    return wrap;
  }

  /** Invoke a control's action, surfacing any error — including from a rejected
   *  async action — as a toast, so a failed download can never be silent. */
  function runAction(fn) {
    try {
      Promise.resolve(fn()).catch((err) => toast(`Failed: ${err.message}`));
    } catch (err) {
      toast(`Failed: ${err.message}`);
    }
  }

  /** Generic action control: a single button when there's one option, else a
   *  dropdown (▾) listing them. `opts` is [[label, fn], …]; returns null if empty.
   *  `btnClass` styles the trigger for the header (`itam-chip`) or panel (`itam-btn`).
   *  Shared by the cover-art and lyrics controls. */
  function ddControl(btnClass, label, title, opts) {
    if (!opts.length) return null;
    if (opts.length === 1) {
      return el('button', {
        class: btnClass,
        text: label,
        title,
        onclick: () => runAction(opts[0][1]),
      });
    }
    const wrap = el('div', { class: 'itam-dd' });
    const trigger = el('button', { class: btnClass, text: `${label} ▾`, title });
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      wrap.classList.toggle('open');
    });
    const menu = el('div', { class: 'itam-dd-menu' });
    for (const [lbl, fn] of opts) {
      menu.append(
        el('button', {
          class: 'itam-dd-item',
          text: lbl,
          onclick: (e) => {
            e.stopPropagation();
            wrap.classList.remove('open');
            runAction(fn);
          },
        }),
      );
    }
    wrap.append(trigger, menu);
    return wrap;
  }

  /** Build the cover-art control: a single "Download cover art" button when only
   *  static art exists, or a dropdown (Static / Square / Vertical / All) when the
   *  album also has motion artwork. Returns null if there's no art. */
  function coverArtControl(model, btnClass) {
    const src = coverSources(model);
    const opts = [];
    if (src.static) opts.push(['Static cover art', () => downloadCoverArt(model)]);
    if (src.square) opts.push(['Square animated', () => downloadMotion(model, 'square')]);
    if (src.vertical) opts.push(['Vertical animated', () => downloadMotion(model, 'vertical')]);
    if (src.square || src.vertical) opts.push(['All cover art', () => downloadAllArt(model)]);
    return ddControl(btnClass, 'Download cover art', 'Static + animated (motion) cover art', opts);
  }

  /** Build the "Download Lyrics" control — a dropdown of the tiers actually available
   *  (Word-by-Word / Line-by-Line / Static). Returns null when nothing is downloadable
   *  (not logged in, or the release has no lyrics) so the button is simply not shown. */
  function lyricsControl(model, btnClass) {
    const avail = lyricsAvailability(model);
    const opts = [];
    if (avail.word) opts.push(['Word-by-Word Lyrics', () => downloadLyrics(model, 'word')]);
    if (avail.line) opts.push(['Line-by-Line Lyrics', () => downloadLyrics(model, 'line')]);
    if (avail.static) opts.push(['Static Lyrics', () => downloadLyrics(model, 'static')]);
    return ddControl(btnClass, 'Download Lyrics', 'Synced / word-by-word lyrics', opts);
  }

  /** Find the album-title heading (robust to Apple's hashed class names): the
   *  heading whose text matches the entity name, else the first non-empty heading
   *  near the top. */
  function findTitleAnchor(name) {
    const all = [...document.querySelectorAll('h1, h2, [role="heading"]')];
    const main = document.querySelector('main');
    // Scope the title match to <main> so a nav/sidebar/shelf heading can't win.
    const scoped = main ? [...main.querySelectorAll('h1, h2, [role="heading"]')] : all;
    // Shorter, case-insensitive needle — robust to edition suffixes, trailing
    // whitespace and minor title differences between the amp-api name and the
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

  /** Best-effort: inject format badges next to the album title. */
  function injectBadges(model) {
    if (!settings.showFormats || !settings.autoBadges || !model.formats.length) return;
    if (document.querySelector('.itam-badges')) return; // already shown for this view
    const anchor = findTitleAnchor(model.name);
    if (!anchor) return; // couldn't place inline — the panel still lists formats
    anchor.insertAdjacentElement('afterend', renderBadges(model.formats));
  }

  /** Inject the inline album-header action row, placed after the badges (or the
   *  title). Buttons are gated by their feature toggles (Harmony is album-only);
   *  each reuses the already-fetched model so it acts instantly. */
  function injectActions(model, page) {
    const isAlbum = page && page.type === 'album';
    const wantBarcode = settings.showBarcodeIsrc;
    const wantHarmony = settings.harmonyLookup && isAlbum;
    if (
      !wantBarcode &&
      !settings.coverArt &&
      !wantHarmony &&
      !settings.downloadLyrics &&
      !settings.iswcLookup
    )
      return;
    if (document.querySelector('.itam-inline-actions')) return; // already shown
    const anchor = findTitleAnchor(model.name);
    if (!anchor) return;

    const row = el('div', { class: 'itam-inline-actions' });
    if (wantBarcode) {
      row.append(
        el('button', {
          class: 'itam-chip',
          text: 'Barcode & ISRCs',
          title: 'Show barcode (UPC) and per-track ISRCs',
          onclick: () => openPanel(model),
        }),
      );
    }
    if (settings.coverArt) {
      const ctrl = coverArtControl(model, 'itam-chip'); // dropdown if motion art exists
      if (ctrl) row.append(ctrl);
    }
    if (settings.downloadLyrics) {
      const ctrl = lyricsControl(model, 'itam-chip'); // null unless logged in + lyrics exist
      if (ctrl) row.append(ctrl);
    }
    if (settings.iswcLookup) {
      const ctrl = iswcControl(model, 'itam-chip');
      if (ctrl) row.append(ctrl);
    }
    if (wantHarmony) {
      row.append(
        el('button', {
          class: 'itam-chip',
          text: 'Harmony ↗',
          title: 'Look up this release across services on Harmony',
          onclick: () => openHarmony(model),
        }),
      );
    }
    if (!row.children.length) return; // nothing applied (e.g. album exposes no art)
    (document.querySelector('.itam-badges') || anchor).insertAdjacentElement('afterend', row);
  }

  /** Open the details panel for a parsed entity model. */
  function openPanel(model) {
    document.querySelector('.itam-overlay')?.remove();

    const panel = el('div', { class: 'itam-panel' });
    const overlay = el('div', { class: 'itam-overlay' }, panel);

    const close = () => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    document.addEventListener('keydown', onKey);

    panel.append(
      el('button', { class: 'itam-close', text: '×', onclick: close, title: 'Close (Esc)' }),
    );
    panel.append(el('h2', { text: model.name || 'Unknown' }));
    panel.append(el('h3', { text: model.artist || '' }));

    if (settings.showFormats && model.formats.length) {
      panel.append(
        el(
          'div',
          { class: 'itam-row' },
          el('b', { text: 'Formats: ' }),
          renderBadges(model.formats),
        ),
      );
    }

    const fact = (label, value) =>
      value == null || value === ''
        ? null
        : el(
            'div',
            { class: 'itam-row' },
            el('b', { text: `${label}: ` }),
            el('span', { class: 'itam-mono', text: String(value) }),
          );
    if (settings.showBarcodeIsrc) panel.append(fact('Barcode (UPC)', model.upc));
    panel.append(fact('Label', model.label));
    panel.append(fact('Released', model.releaseDate));
    panel.append(fact('Copyright', model.copyright));
    if (model.masteredForItunes != null) {
      panel.append(el('div', { class: 'itam-row' }, masteredBadge(model.masteredForItunes)));
    }

    // --- action buttons (barcode/ISRC actions only when that feature is on) --
    const actions = el('div', { class: 'itam-actions' });
    if (settings.showBarcodeIsrc) {
      const isrcs = model.tracks.map((t) => t.isrc).filter(Boolean);
      if (model.upc) {
        actions.append(
          el('button', {
            class: 'itam-btn',
            text: 'Copy barcode',
            onclick: () => copy(model.upc, 'Barcode copied'),
          }),
        );
      }
      if (isrcs.length) {
        actions.append(
          el('button', {
            class: 'itam-btn',
            text: 'Copy all ISRCs',
            onclick: () => copy(isrcs.join('\n'), `${isrcs.length} ISRCs copied`),
          }),
        );
        // MagicISRC needs the MusicBrainz MBID, resolved on click from the UPC
        // (see submitToMagicIsrc), so the final URL isn't known up front — the
        // href is a placeholder and the click handler always opens the tab itself.
        const magic = el('a', {
          class: 'itam-btn accent',
          text: 'Submit to MagicISRC ↗',
          href: '#',
          title: 'Resolve the MusicBrainz release by barcode, then open MagicISRC',
        });
        magic.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          submitToMagicIsrc(model);
        });
        actions.append(magic);
      }
    }
    if (settings.coverArt) {
      const ctrl = coverArtControl(model, 'itam-btn'); // dropdown if motion art exists
      if (ctrl) actions.append(ctrl);
    }
    if (settings.downloadLyrics) {
      const ctrl = lyricsControl(model, 'itam-btn'); // null unless logged in + lyrics exist
      if (ctrl) actions.append(ctrl);
    }
    if (settings.iswcLookup) {
      const ctrl = iswcControl(model, 'itam-btn');
      if (ctrl) actions.append(ctrl);
    }
    if (settings.harmonyLookup && model.kind === 'album') {
      const harmony = el('a', {
        class: 'itam-btn',
        text: 'Look up in Harmony ↗',
        href: buildHarmonyUrl(appleMusicCanonicalUrl(), model.upc),
        target: '_blank',
        rel: 'noopener',
      });
      // Apple intercepts in-page link clicks; open the new tab explicitly.
      harmony.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openHarmony(model);
      });
      actions.append(harmony);
    }
    actions.append(
      el('button', {
        class: 'itam-btn',
        text: 'Copy as JSON',
        onclick: () => copy(JSON.stringify(model, null, 2), 'JSON copied'),
      }),
    );
    panel.append(actions);

    // --- track table with ISRCs (only when that feature is on) -----------
    if (settings.showBarcodeIsrc && model.tracks.length) {
      const multiDisc = model.tracks.some((t) => t.disc !== 1);
      const hasComposer = model.tracks.some((t) => t.composer);
      // Per-track "Formats" column: shown only when the toggle is on AND at least
      // one track's format set differs from the album-level set. Each cell is
      // blank unless that track differs, so the column stays clean.
      const showFormatsCol =
        settings.perTrackFormats &&
        model.tracks.some((t) => traitsDiffer(t.audioTraits, model.audioTraits));
      // "Work" column (classical): shown only when the toggle is on AND at least
      // one track names its parent work. Cells are blank for tracks without one,
      // so non-classical releases never grow the column.
      const showWorkCol = settings.classicalInfo && model.tracks.some((t) => t.workName);
      // A track length column is always shown; Composer carries a class so it can
      // be hidden responsively (via a container query) when the panel is narrow.
      const table = el('table', { class: 'itam-table' });
      const headRow = el('tr');
      const cols = [
        { t: '#' },
        { t: 'Title' },
        ...(showWorkCol ? [{ t: 'Work' }] : []),
        { t: 'Artist' },
        ...(hasComposer ? [{ t: 'Composer', cls: 'itam-col-composer' }] : []),
        { t: 'ISRC' },
        { t: 'Length', cls: 'itam-col-len' },
        ...(showFormatsCol ? [{ t: 'Formats' }] : []),
      ];
      cols.forEach((c) =>
        headRow.append(el('th', c.cls ? { text: c.t, class: c.cls } : { text: c.t })),
      );
      table.append(el('thead', {}, headRow));
      const tbody = el('tbody');
      for (const t of model.tracks) {
        const tr = el('tr');
        tr.append(el('td', { text: multiDisc ? `${t.disc}.${t.track}` : String(t.track || '') }));
        tr.append(el('td', { text: t.name }));
        // Work cell — blank for tracks that don't name a parent work (single-
        // movement pieces, or non-classical tracks).
        if (showWorkCol) tr.append(el('td', { text: t.workName || '' }));
        tr.append(el('td', { text: t.artist }));
        if (hasComposer)
          tr.append(el('td', { class: 'itam-col-composer', text: t.composer || '' }));
        tr.append(
          el('td', {
            class: 'itam-mono itam-isrc',
            text: t.isrc || '—',
            title: t.isrc ? 'Click to copy' : '',
            onclick: () => t.isrc && copy(t.isrc, 'ISRC copied'),
          }),
        );
        tr.append(
          el('td', {
            class: 'itam-mono itam-col-len',
            text: formatDuration(t.durationMillis) || '—',
          }),
        );
        // Render this track's badges only when it actually differs (blank cell
        // when identical to the album-level set, so matching rows stay quiet).
        if (showFormatsCol) {
          const differs = traitsDiffer(t.audioTraits, model.audioTraits);
          tr.append(el('td', {}, differs ? renderBadgesSm(t.formats) : null));
        }
        tbody.append(tr);
      }
      table.append(tbody);
      panel.append(table);
    }

    panel.append(
      el('div', {
        class: 'itam-foot',
        text: `Session: ${model.loggedIn ? 'logged in (user token sent)' : 'anonymous (catalog only)'} · data from Apple Music`,
      }),
    );
    panel.append(el('div', { class: 'itam-foot', text: `ITAM Enhancer v${scriptVersion()}` }));

    document.body.append(overlay);
  }

  // -------------------------------------------------------------------------
  //  Section 8 — settings menu (live-updating labels)
  // -------------------------------------------------------------------------
  //
  //  LIVE-UPDATING LABELS — userscript-manager menus historically showed a STATIC
  //  caption, so flipping a setting left its "…: on/off" label stale until the page
  //  reloaded. Modern Tampermonkey and Violentmonkey fix this: re-registering a
  //  command with the same `id` updates its caption in place (TM), and VM re-renders
  //  its menu when commands change. We exploit that by rebuilding every command from
  //  one declarative list (buildMenu) whenever a setting changes, so labels track
  //  state live. `autoClose:false` (TM) keeps the menu open after a click so the
  //  flip is visible immediately. Managers without GM_unregisterMenuCommand (e.g.
  //  classic Greasemonkey) degrade gracefully — commands register once and labels
  //  refresh on the next page load, exactly as before. NB the on-page UI itself is
  //  injected at load, so applying a toggle to what's ALREADY rendered still needs a
  //  reload; it's the menu label that updates instantly.

  const canRefreshMenu = typeof GM_unregisterMenuCommand === 'function';
  let menuCmdIds = []; // ids of the currently-registered commands, for teardown
  let menuBuilt = false;

  /** (Re)register one command and return its id. Passing the options object
   *  (stable `id` + `autoClose:false`) is what lets Tampermonkey update a caption
   *  in place and keep the menu open after a click; managers that reject the object
   *  fall back to a plain registration (still works — just no live caption refresh). */
  function addMenuCommand(id, label, onClick) {
    try {
      return GM_registerMenuCommand(label, onClick, { id, autoClose: false });
    } catch {
      return GM_registerMenuCommand(label, onClick) ?? id;
    }
  }

  /** Rebuild the whole menu so every label reflects the current settings. When the
   *  manager can remove commands we tear the previous set down first (so nothing
   *  duplicates); when it can't, we build exactly once and let labels refresh on the
   *  next reload. */
  function rebuildMenu() {
    if (canRefreshMenu) {
      for (const id of menuCmdIds) {
        try {
          GM_unregisterMenuCommand(id);
        } catch {
          /* ignore */
        }
      }
    } else if (menuBuilt) {
      return; // can't unregister → don't pile up duplicate commands
    }
    menuCmdIds = buildMenu();
    menuBuilt = true;
  }

  /** Flip a boolean setting, repaint the menu so its label updates live, and confirm
   *  with a toast. The badges/columns/buttons are injected at page load, so a reload
   *  is still needed to apply the change to what's already on screen. */
  function toggleSetting(key, label, dependsOn) {
    saveSetting(key, !settings[key]);
    rebuildMenu(); // live label refresh
    toast(
      `${label} ${settings[key] ? 'on' : 'off'} — reload to apply${dependsOn ? ` (needs "${dependsOn}")` : ''}`,
    );
  }

  /** Register every command from the CURRENT settings and return their ids (so the
   *  next rebuild can tear them down). Labels are computed here, so each rebuild
   *  re-evaluates them against the latest settings — that's what keeps them live. */
  function buildMenu() {
    const on = (v) => (v ? 'on' : 'off');
    return [
      addMenuCommand('showFormats', `Show audio formats: ${on(settings.showFormats)}`, () =>
        toggleSetting('showFormats', 'Audio formats'),
      ),
      addMenuCommand(
        'showBarcodeIsrc',
        `Show barcodes (UPC) & ISRCs: ${on(settings.showBarcodeIsrc)}`,
        () => toggleSetting('showBarcodeIsrc', 'Barcodes & ISRCs'),
      ),
      addMenuCommand(
        'perTrackFormats',
        `Per-track formats column: ${on(settings.perTrackFormats)}`,
        () => toggleSetting('perTrackFormats', 'Per-track formats', 'Show barcodes (UPC) & ISRCs'),
      ),
      addMenuCommand('classicalInfo', `Classical Work column: ${on(settings.classicalInfo)}`, () =>
        toggleSetting('classicalInfo', 'Classical Work column', 'Show barcodes (UPC) & ISRCs'),
      ),
      addMenuCommand('autoBadges', `Inline format badges: ${on(settings.autoBadges)}`, () =>
        toggleSetting('autoBadges', 'Inline badges', 'Show audio formats'),
      ),
      addMenuCommand(
        'harmonyLookup',
        `Integrate Harmony lookup: ${on(settings.harmonyLookup)}`,
        () => toggleSetting('harmonyLookup', 'Harmony lookup'),
      ),
      addMenuCommand('coverArt', `Download cover art button: ${on(settings.coverArt)}`, () =>
        toggleSetting('coverArt', 'Cover-art button'),
      ),
      addMenuCommand(
        'downloadLyrics',
        `Download Lyrics button: ${on(settings.downloadLyrics)}`,
        () => toggleSetting('downloadLyrics', 'Download Lyrics button'),
      ),
      addMenuCommand('iswcLookup', `Find ISWCs button: ${on(settings.iswcLookup)}`, () =>
        toggleSetting('iswcLookup', 'Find ISWCs button'),
      ),
      addMenuCommand(
        'iswcSourceMb',
        `ISWC source · MusicBrainz: ${on(settings.iswcSourceMb)}`,
        () => toggleSetting('iswcSourceMb', 'ISWC source MusicBrainz', 'Find ISWCs'),
      ),
      addMenuCommand(
        'iswcSourceCreditsFm',
        `ISWC source · credits.fm: ${on(settings.iswcSourceCreditsFm)}`,
        () => toggleSetting('iswcSourceCreditsFm', 'ISWC source credits.fm', 'Find ISWCs'),
      ),
      // Prompt items: the label now refreshes live once you choose, so the new value
      // shows without reopening the menu (this is what used to "look dead").
      addMenuCommand('motionRes', `Animated cover-art resolution: ${settings.motionRes}`, () => {
        const v = window.prompt(
          'Animated cover-art resolution — enter L (1080), XL (2160), or Max (highest):',
          settings.motionRes,
        );
        if (v === null) return; // cancelled
        const choice = { l: 'L', xl: 'XL', max: 'Max' }[v.trim().toLowerCase()];
        if (!choice) return; // invalid input — ignore, keep current
        saveSetting('motionRes', choice);
        rebuildMenu();
        toast(`Resolution: ${choice} — L=1080, XL=2160, Max=highest (≫ size at XL/Max)`);
      }),
      addMenuCommand(
        'locale',
        `Locale override (current: ${settings.locale || 'storefront default'})`,
        () => {
          const v = window.prompt(
            'Apple Music locale (e.g. en-US, ja-JP) — blank = storefront default:',
            settings.locale,
          );
          if (v === null) return;
          saveSetting('locale', v.trim());
          rebuildMenu();
          toast(`Locale: ${settings.locale || 'storefront default'} — reload to apply`);
        },
      ),
      addMenuCommand('clearToken', 'Clear cached Apple Music token', () => {
        try {
          GM_setValue(TOKEN_KEY, null);
        } catch {
          /* ignore */
        }
        toast('Token cache cleared');
      }),
    ];
  }

  /** Build the menu for the first time; later refreshes go through rebuildMenu(). */
  function registerMenu() {
    rebuildMenu();
  }

  // -------------------------------------------------------------------------
  //  Section 9 — bootstrap (launcher + SPA-aware badge injection)
  // -------------------------------------------------------------------------

  /** Ensure the floating launcher exists; clicking it loads + opens the panel. */
  function ensureLauncher() {
    if (document.getElementById('itam-launch')) return;
    const btn = el('button', {
      id: 'itam-launch',
      class: 'itam-launch',
      text: 'ITAM ▾',
      title: 'ITAM Enhancer — formats, barcode & ISRCs',
    });
    btn.addEventListener('click', async () => {
      const page = parsePage();
      if (!page) return toast('Open an album, song, or music-video page first.');
      btn.disabled = true;
      const original = btn.textContent;
      btn.textContent = 'ITAM …';
      try {
        openPanel(await fetchEntity(page));
      } catch (err) {
        toast(`Failed: ${err.message}`);
      } finally {
        btn.disabled = false;
        btn.textContent = original;
      }
    });
    document.body.appendChild(btn);
  }

  /** On a supported page, fetch (cached) the entity and inject the inline header
   *  UI: format badges (albums) + the action row. Best-effort — the floating
   *  launcher still works on demand if nothing can be placed. */
  let headerUIBusy = false; // serialise attempts so only one fetchEntity runs at a time
  async function maybeHeaderUI() {
    if (headerUIBusy) return;
    const page = parsePage();
    if (!page) return;
    const wantBadges = settings.showFormats && settings.autoBadges && page.type === 'album';
    const wantActions =
      settings.showBarcodeIsrc ||
      settings.coverArt ||
      settings.downloadLyrics ||
      settings.iswcLookup ||
      (settings.harmonyLookup && page.type === 'album');
    if (!wantBadges && !wantActions) return;
    headerUIBusy = true;
    try {
      const model = await fetchEntity(page);
      if (page.type === 'album') injectBadges(model);
      injectActions(model, page);
    } catch {
      /* token/API not ready or failed — launcher still works on demand */
    } finally {
      headerUIBusy = false;
    }
  }

  /** Run on initial load and on every SPA route change. */
  let lastPath = '';
  let placeStop = null;
  function onRoute() {
    if (location.pathname === lastPath) return;
    lastPath = location.pathname;
    // Clear stale inline UI from the previous view.
    document.querySelector('.itam-badges')?.remove();
    document.querySelector('.itam-inline-actions')?.remove();
    ensureLauncher();
    placeHeaderUI();
  }

  /** Place the inline header UI, RETRYING UNTIL IT LANDS. Apple Music renders the
   *  album header (and resolves the MusicKit token) at very different times across
   *  albums — ones with an editorial synopsis or many tracks render notably later —
   *  so the old fixed ~5s retry window left the badges/buttons missing on those
   *  (while the on-demand panel always worked). A MutationObserver plus a bounded
   *  poll keep trying until placed, or ~30s. fetchEntity is cached and
   *  maybeHeaderUI is serialised, so repeated attempts are cheap. */
  function placeHeaderUI() {
    if (placeStop) placeStop(); // cancel a previous route's attempts
    const placed = () =>
      document.querySelector('.itam-inline-actions') || document.querySelector('.itam-badges');
    const startedAt = Date.now();
    let everPlaced = false;
    let debounce = null;
    const attempt = () => {
      // maybeHeaderUI is idempotent — it (re-)injects only when the badges/actions
      // are MISSING. So this both places them late AND re-places them if Apple
      // Music's React re-render wipes them — the cause of the inconsistent
      // appearance (the inline UI would vanish on a re-render and never return).
      maybeHeaderUI();
      if (placed()) everPlaced = true;
      // Give up only if nothing has EVER placed after 30s — i.e. there is
      // genuinely nothing to place here (e.g. a logged-out song page). Once it has
      // placed, keep watching for the route's lifetime so a later wipe is
      // re-injected; the observer is torn down on the next route change (placeStop).
      else if (!everPlaced && Date.now() - startedAt > 30000) stop();
    };
    // Debounce the (very chatty) SPA mutations so attempt() runs at most ~3×/s.
    const schedule = () => {
      if (debounce) return;
      debounce = setTimeout(() => {
        debounce = null;
        attempt();
      }, 350);
    };
    const obs = new MutationObserver(schedule);
    obs.observe(document.body, { childList: true, subtree: true });
    const poll = setInterval(attempt, 1200);
    function stop() {
      obs.disconnect();
      clearInterval(poll);
      if (debounce) clearTimeout(debounce);
      if (placeStop === stop) placeStop = null;
    }
    placeStop = stop;
    attempt();
  }

  // Apple Music navigates via the History API; observe pushState/replaceState
  // and popstate, with a low-frequency poll as a safety net.
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

  // Close any open cover-art dropdown when clicking elsewhere on the page.
  document.addEventListener('click', () => {
    document.querySelectorAll('.itam-dd.open').forEach((d) => d.classList.remove('open'));
  });

  registerMenu();
  ensureLauncher();
  onRoute();
})();
