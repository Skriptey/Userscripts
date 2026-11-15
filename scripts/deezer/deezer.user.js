// ==UserScript==
// @name          Deezer Enhancer
// @namespace     https://github.com/Skriptey/Userscripts
// @version       1.1.0
// @description   Deezer Enhancer — on deezer.com album & track pages, surfaces the barcode (UPC) and per-track ISRCs with one-click copy and a MagicISRC link, plus label/release info, contributors, a Harmony cross-service lookup, high-resolution cover-art download and (opt-in) lyrics download. Optional internal-data layer adds lossless badges and full credits. A Deezer-flavoured sibling of ITAM Enhancer.
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
// Original implementation, except that the file/ZIP/LRC writers and the lyrics
// download dropdown (Section 2b and the dropdown helpers) are copied from this
// repo's own ITAM Enhancer (Apple Music), same licence. The Deezer sibling of ITAM
// Enhancer; reuses the same body-mounted panel, the MagicISRC-via-MusicBrainz-
// barcode flow, and the Harmony handoff.
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
//      call, hence @connect musicbrainz.org), then open MagicISRC. The barcode is
//      normalised to a bare digit string (normaliseGtin) before it is queried, since
//      MusicBrainz's Lucene `barcode:` search only matches digits-only values.
//    • Harmony — opens a Harmony cross-service lookup for the Deezer album URL + UPC.
//      The UPC is normalised to a bare digit string first (normaliseGtin): Harmony's
//      ?gtin= hard-errors on anything but a plain {8,12,13,14}-digit numeral, which a
//      human-formatted barcode (spaces/hyphens) would trip — this is defensive here
//      since Deezer's API usually returns clean digits, but the helper is shared
//      verbatim with the sibling scripts that do see human-formatted barcodes.
//
//  SCOPE: the catalog data above uses only the public API, whose `contributors`
//  are mainly performers, not full songwriter credits. Lossless/quality flags and
//  full credits live on Deezer's INTERNAL API — see LAYER 2 below (opt-in).
//
//  LAYER 2 — gw-light, Deezer's internal website API (OFF by default)
//  ---------------------------------------------------------------------------
//  Menu toggle "Deezer internal data (gw-light, needs login)". It is INTERNAL AND
//  UNDOCUMENTED, so it may change or break without warning; the script then quietly
//  falls back to the public data. It is opt-in, uses only the user's OWN session
//  (same-origin page fetch to www.deezer.com/ajax/gw-light.php, cookies travel
//  automatically), and is READ-ONLY: gwCall refuses any method not on the fixed
//  GW_METHODS allow-list (getUserData, song.getListByAlbum, song.getData), so a
//  later edit cannot accidentally call something that changes the account.
//    • WHAT IT ADDS — per-track format flags (FLAC / MP3 320 / MP3 128 / 360 RA from
//      the FILESIZE_* fields, shown as badges; premium sizes read 0 when logged out
//      or free, which shows a muted "log in to see quality" badge instead of a wrong
//      "MP3 only"), full credits from SNG_CONTRIBUTORS (songwriters, producers…),
//      and LYRICS_ID (hides the Download Lyrics button when no track has lyrics).
//    • NEVER TOUCHES STREAMING DATA — pickGwSong copies NAMED fields from a fixed
//      list; it never copies the song object, so TRACK_TOKEN, MD5_ORIGIN, MEDIA*,
//      RIGHTS and anything from USER are dropped. The CSRF `checkForm` token is kept
//      in memory only; `results` are never logged (only error KEYS are).
//    • ONE retry on an invalid-token reply, then give up; any failure leaves the
//      public data untouched. Sub-toggles: "Lossless / quality badges" and "Full
//      credits" (both on once the layer is enabled).
//
//  LYRICS — how it works (off by default; menu toggle "Download Lyrics button")
//  ---------------------------------------------------------------------------
//    • TOKEN — lyrics come from Deezer's GraphQL endpoint (pipe.deezer.com), which
//      wants a short-lived JWT (a signed login token) as `Authorization: Bearer`.
//      The script gets it from `auth.deezer.com/login/renew` with a plain page
//      fetch (credentials: 'include'), so the browser sends the user's OWN Deezer
//      cookies. If the user is logged out AND has switched on "Lyrics when logged
//      out (anonymous token)", it falls back to `auth.deezer.com/login/anonymous`.
//      That anonymous route is UNOFFICIAL: it is a separate, off-by-default toggle
//      and switching it on shows a warning that support is not guaranteed.
//      The token lives in memory only (about 5 minutes), is never saved with
//      GM_setValue, never logged, and is only ever sent to pipe.deezer.com.
//    • REQUEST — one POST per track: `GetLyrics(trackId)`; the single reply carries
//      all three tiers: word-by-word (`synchronizedWordByWordLines`), line-by-line
//      (`synchronizedLines`) and plain `text`. Both sides are page fetches with a
//      15 second limit (fetchJson); no @connect is needed because Deezer allows its
//      own player origin. At most 4 tracks are fetched at once (rate limiting).
//    • TIERS — the menu picks Word-by-Word, Line-by-Line or Static. Each track falls
//      back word → line → static to what it really has. A timed tier whose last line
//      ends more than 2 seconds after the track's length is treated as broken and
//      skipped. Deezer's word entries carry NO spaces, so parseDeezerLyrics adds a
//      trailing space to every word but the last in a line; the shared writers
//      (copied from ITAM) then produce enhanced "A2" LRC: [mm:ss.xx]<mm:ss.xx>word …
//    • OUTPUT — .lrc (word or line) or .txt per track, named
//      "<disc> - <NN> - <title>"; more than one file becomes a store-only ZIP. If
//      "Word-by-Word also saves raw .json" is on, the untouched word-timing data is
//      saved next to each word .lrc.
//    • PRIVACY — lyric text goes only into downloaded files, never into the page,
//      the console or "Copy as JSON". Lyrics are licensed content: personal use only.
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
    downloadLyrics: false, // FEATURE: Download Lyrics dropdown (OFF by default — opt in)
    lyricsAnonymous: false, // FEATURE: logged-out lyrics via Deezer's anonymous token (unofficial, OFF)
    lyricsRawJson: false, // FEATURE: Word-by-Word also saves the raw word-timing .json (OFF)
    gwEnrich: false, // FEATURE (master): Deezer internal "gw-light" data layer — OFF, opt-in
    gwLossless: true, // FEATURE: lossless/quality badges (only acts when gwEnrich is on)
    gwCredits: true, // FEATURE: full songwriter/producer credits (only acts when gwEnrich is on)
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

  // --- Network helpers (every request has a 15 s time limit) ------------------

  /** How long any network call may take before we give up on it. */
  const REQUEST_TIMEOUT_MS = 15000;

  /**
   * Promise wrapper around GM_xmlhttpRequest that REALLY enforces a time limit.
   *
   * WHY THIS EXISTS: GM_xmlhttpRequest only fires `ontimeout` when the request is
   * given a `timeout` value in milliseconds. An earlier version of this script had
   * an `ontimeout` handler but no `timeout:` value, so a stalled MusicBrainz call
   * could hang forever and the handler was dead code. Here `timeout` is always set,
   * and all three failure paths (timeout, network error, abort) reject the promise.
   * Each rejection carries `err.status` ('timeout' | 'network' | 'abort') so callers
   * can tell them apart.
   *
   * @param {object} opts - the GM_xmlhttpRequest options (method, url, headers, …).
   * @param {number} [ms] - time limit in milliseconds.
   * @returns {Promise<object>} resolves with the GM response (any HTTP status).
   */
  function gmRequest(opts, ms = REQUEST_TIMEOUT_MS) {
    const fail = (message, status) => Object.assign(new Error(message), { status });
    return new Promise((resolve, reject) => {
      try {
        GM_xmlhttpRequest({
          ...opts,
          timeout: ms,
          onload: resolve,
          onerror: () => reject(fail('network error', 'network')),
          ontimeout: () => reject(fail('timeout', 'timeout')),
          onabort: () => reject(fail('aborted', 'abort')),
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * fetch() + JSON with a time limit (plain page fetch, so the browser's own
   * cookies and CORS rules apply — used for Deezer's own hosts).
   *
   * fetch() has no timeout option, so an AbortController cancels it when the timer
   * fires. The timer also covers reading the response body. Errors carry
   * `err.status`: the HTTP status number, or 'timeout' / 'network'.
   *
   * @param {string} url
   * @param {RequestInit} [init] - fetch options (method, headers, body, credentials…).
   * @param {number} [ms] - time limit in milliseconds.
   * @returns {Promise<any>} the parsed JSON body.
   */
  async function fetchJson(url, init = {}, ms = REQUEST_TIMEOUT_MS) {
    const ctrl = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, ms);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
      return await res.json();
    } catch (err) {
      if (timedOut) throw Object.assign(new Error('timeout'), { status: 'timeout' });
      if (err && err.status === undefined && err.name === 'TypeError') err.status = 'network';
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  // --- Harmony --------------------------------------------------------------

  /**
   * Normalise a human-formatted barcode into the bare digit string ("GTIN")
   * that machine consumers accept, or '' when the value cannot plausibly be one.
   *
   * WHY THIS EXISTS: Deezer's `upc` field is usually clean, but it is sourced
   * from label/distributor metadata and can occasionally carry the same
   * formatting quirks as other catalogues (spaces, hyphens, or a placeholder
   * like ''), and this helper is shared verbatim across all six Harmony-linked
   * scripts in this repo for consistency (see discogs-enhancer, where Discogs
   * stores barcodes exactly as printed on the release, e.g. "4 943674 060023",
   * which is the case that originally broke Harmony). Harmony's /release
   * endpoint validates ?gtin= with /^\d+$/ plus a length gate of {8, 12, 13,
   * 14} and hard-errors on anything else ("GTIN '…' contains invalid
   * non-numeric characters") — it only .trim()s the value, it never strips
   * interior spaces or hyphens (verified in kellnerd/harmony utils/gtin.ts +
   * server/state.ts). Likewise MusicBrainz's Lucene `barcode:` search only
   * matches the bare digit string. So before a barcode leaves this script for
   * a machine consumer we:
   *
   *   1. map fullwidth digits (U+FF10–U+FF19, seen on Japanese releases) to
   *      ASCII, then bail out to '' if any OTHER Unicode decimal digit family
   *      (Arabic-Indic, Devanagari, …) is present — mixing digit families
   *      could otherwise silently DROP a digit in step 2 while still passing
   *      the length gate, producing a wrong-but-valid-length code;
   *   2. strip every non-ASCII-digit character: spaces, hyphens, dots, NBSP
   *      U+00A0, narrow NBSP U+202F, figure space U+2007, tabs, '>' scanner
   *      arrows … everything;
   *   3. length-gate to the valid GTIN lengths {8, 12, 13, 14} (EAN-8, UPC-A,
   *      EAN-13, GTIN-14). Anything else — a catalogue number, 'none' (no
   *      digits), or two barcodes mashed into one field — returns '' so
   *      callers send NOTHING rather than junk (Harmony treats an
   *      empty/absent gtin as harmless and still does the URL-based lookup).
   *      NOTE: this gate is stricter than MusicBrainz needs — MB's barcode
   *      field holds digits of ANY length as printed, so a clean but
   *      non-GTIN-length numeric barcode (e.g. 11 digits) that could
   *      previously reach the MusicBrainz query verbatim now short-circuits
   *      to no lookup instead. Accepted trade-off for a single shared helper;
   *      such barcodes are rare in practice.
   *
   * Leading zeros are preserved (string ops only, never Number()): Harmony
   * accepts a UPC-12 as-is and a zero-padded EAN-13 equally, but an 11-digit
   * string with a lost leading zero would be rejected. We deliberately do NOT
   * validate the check digit: a mistyped source barcode with a valid length
   * should reach Harmony verbatim so the user sees its precise "Checksum of
   * GTIN '…' is invalid" feedback instead of a silent no-op here.
   *
   * NOTE: intentionally NOT applied to the panel display, the "Copy barcode"
   * button, or the JSON export — those keep the source service's raw
   * formatting (fidelity to what the page shows); normalisation happens only
   * where the value flows out to a machine consumer (Harmony URL,
   * MusicBrainz barcode query).
   *
   * @param {string|number|null|undefined} value - Raw barcode/UPC/GTIN as
   *   provided by the source service (may be human-formatted or junk).
   * @returns {string} Bare ASCII digits of a plausible GTIN, or '' if none.
   */
  function normaliseGtin(value) {
    if (value === null || value === undefined) return '';
    // 1. fullwidth digits → ASCII (fixed charcode offset 0xFEE0)
    const mapped = String(value).replace(/[０-９]/g, (d) =>
      String.fromCharCode(d.charCodeAt(0) - 0xfee0),
    );
    // 2. any OTHER Unicode decimal-digit family left after the fullwidth
    //    mapping would be silently dropped by the ASCII-only strip below —
    //    bail out rather than risk a truncated-but-valid-length wrong code.
    if (/\p{Nd}/u.test(mapped.replace(/[0-9]/g, ''))) return '';
    // 3. drop everything that is not an ASCII digit
    const digits = mapped.replace(/[^0-9]/g, '');
    // 4. only plausible GTIN lengths pass (EAN-8 / UPC-A / EAN-13 / GTIN-14)
    return [8, 12, 13, 14].includes(digits.length) ? digits : '';
  }

  /**
   * Build a Harmony release-lookup URL for a Deezer album page, with every
   * known provider pre-selected (empty value = "enable, don't pin an ID").
   * The gtin is passed through normaliseGtin() first — Harmony hard-errors on
   * a human-formatted barcode, and an empty result is harmless (Harmony skips
   * the GTIN lookup and still resolves the release from the URL alone).
   */
  function buildHarmonyUrl(url, gtin) {
    const p = new URLSearchParams();
    p.set('url', url);
    p.set('gtin', normaliseGtin(gtin));
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
  // The barcode is normalised to a bare digit string before it is queried —
  // Deezer's upc is usually clean, but this keeps the shared helper's
  // guarantee that Lucene never sees a spaced/hyphenated value (which it
  // would tokenise and fail to match), and a value that isn't a plausible
  // GTIN resolves to null without a network round-trip.
  function lookupMusicBrainzMbid(upc) {
    upc = normaliseGtin(upc);
    if (!upc) return Promise.resolve(null); // no plausible GTIN → same as 'no MB match'
    const url = `${MUSICBRAINZ_BASE}/release?query=barcode:${encodeURIComponent(upc)}&fmt=json`;
    return gmRequest({
      method: 'GET',
      url,
      headers: { 'User-Agent': MB_USER_AGENT, Accept: 'application/json' },
    }).then((res) => {
      if (res.status < 200 || res.status >= 300) throw new Error(`MusicBrainz HTTP ${res.status}`);
      let data;
      try {
        data = JSON.parse(res.responseText);
      } catch {
        throw new Error('MusicBrainz returned non-JSON');
      }
      const releases = Array.isArray(data.releases) ? data.releases : [];
      if (!releases.length) return null;
      const official = releases.find((r) => r.status === 'Official');
      return (official || releases[0]).id || null;
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
    // Test the NORMALISED value: a placeholder like 'none' or a non-GTIN-length
    // value should report "no barcode" immediately rather than trigger a doomed
    // MusicBrainz round-trip (lookupMusicBrainzMbid normalises internally too;
    // normalisation is idempotent, so passing the raw model.upc below is fine).
    if (!normaliseGtin(model.upc))
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
      downloadBlob(blob, `${safeName(model.artist)} - ${safeName(model.name)}_Cover.jpg`);
      toast('Cover art saved ✓');
    } catch (err) {
      toast(`Cover art failed: ${err.message}`);
    }
  }

  // -------------------------------------------------------------------------
  //  Section 2b — files, ZIP and LRC writers (copied verbatim from ITAM Enhancer)
  // -------------------------------------------------------------------------
  //
  //  There is no build step, so shared code is COPIED between scripts. These pieces
  //  are kept identical to scripts/ITAMenhancer/ITAMenhancer.user.js (only the CSS
  //  class prefix differs) so drift between the two is easy to spot. The ZIP writer
  //  is hand-rolled on purpose: JSZip hung under strict page environments, whereas
  //  this synchronous writer has no dependency and cannot stall.

  /** Trigger a browser download of a Blob under the given filename. */
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  // CRC-32 (IEEE) — precomputed table for the ZIP writer below.
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  /** Build a ZIP (STORE — no compression) from [{name, text}|{name, bytes}]
   *  SYNCHRONOUSLY → Blob. We hand-roll this instead of JSZip because JSZip's
   *  generateAsync HANGS under Apple Music's environment (it never resolves, which
   *  made a lyrics download "zip … then time out → dozens of individual files" that
   *  the browser then throttles). A sync writer can't hang, needs no dependency, and
   *  STORE is ideal here (text/already-compressed media don't benefit from DEFLATE). */
  function buildStoreZip(files) {
    const enc = new TextEncoder();
    const chunks = []; // body: local headers + data, in order
    const central = []; // central-directory records, filled as we go
    let offset = 0;
    const u16 = (n) => [n & 0xff, (n >> 8) & 0xff];
    const u32 = (n) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff];
    for (const f of files) {
      const nameBytes = enc.encode(f.name);
      const data = f.bytes || enc.encode(f.text || '');
      const crc = crc32(data);
      const size = data.length;
      // Local file header (sig, ver 2.0, flags 0, STORE, time 0, date 1980-01-01).
      const lfh = [
        ...u32(0x04034b50),
        ...u16(20),
        ...u16(0),
        ...u16(0),
        ...u16(0),
        ...u16(0x21),
        ...u32(crc),
        ...u32(size),
        ...u32(size),
        ...u16(nameBytes.length),
        ...u16(0),
      ];
      chunks.push(new Uint8Array(lfh), nameBytes, data);
      central.push({ nameBytes, crc, size, offset });
      offset += lfh.length + nameBytes.length + size;
    }
    const cdStart = offset;
    let cdSize = 0;
    for (const e of central) {
      const cdh = [
        ...u32(0x02014b50),
        ...u16(20),
        ...u16(20),
        ...u16(0),
        ...u16(0),
        ...u16(0),
        ...u16(0x21),
        ...u32(e.crc),
        ...u32(e.size),
        ...u32(e.size),
        ...u16(e.nameBytes.length),
        ...u16(0),
        ...u16(0),
        ...u16(0),
        ...u16(0),
        ...u32(0),
        ...u32(e.offset),
      ];
      chunks.push(new Uint8Array(cdh), e.nameBytes);
      cdSize += cdh.length + e.nameBytes.length;
    }
    chunks.push(
      new Uint8Array([
        ...u32(0x06054b50),
        ...u16(0),
        ...u16(0),
        ...u16(central.length),
        ...u16(central.length),
        ...u32(cdSize),
        ...u32(cdStart),
        ...u16(0),
      ]),
    );
    return new Blob(chunks, { type: 'application/zip' });
  }

  /** Run `fn(item, index)` over `items` with at most `limit` running at once,
   *  keeping results in input order. Used for the per-track lyrics requests: a 30-track
   *  album fired all at once is the kind of burst Deezer's network edge answers with
   *  403/429, so only a few run side by side. `fn` should not throw (catch inside). */
  async function pool(items, limit, fn) {
    const results = new Array(items.length);
    let next = 0;
    const worker = async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i], i);
      }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
  }

  /** Format seconds as an LRC timestamp, e.g. secToLrc(63.48) → "[01:03.48]". */
  function secToLrc(sec, open = '[', close = ']') {
    sec = Math.max(0, sec || 0);
    const mins = Math.floor(sec / 60);
    const secs = (sec - mins * 60).toFixed(2);
    return `${open}${String(mins).padStart(2, '0')}:${secs.padStart(5, '0')}${close}`;
  }

  // The shared lyrics model all writers below read (times in SECONDS):
  //   { wordTimed, lineTimed, lines: [{ begin, end, text, words: [{ begin, end, text }] }] }
  // Word texts must already carry their trailing space (Deezer's raw words have none;
  // see parseDeezerLyrics), because lyricsToWordLrc glues word texts together.

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

  /** "<disc> - <NN> - <title>" filename stem (track number zero-padded). */
  function lyricsFileStem(t) {
    return `${t.disc || 1} - ${String(t.track || 0).padStart(2, '0')} - ${safeName(t.name) || 'Untitled'}`;
  }

  const TIER_RANK = { word: 3, line: 2, static: 1 };

  // -------------------------------------------------------------------------
  //  Section 3 — Deezer public API
  // -------------------------------------------------------------------------

  /** GET a Deezer API path → parsed JSON (plain fetch; api.deezer.com is CORS-open
   *  for the deezer.com origin). Deezer signals errors in the body, not the status. */
  async function apiGet(path) {
    const data = await fetchJson(`${API}${path}`);
    if (data && data.error) throw new Error(data.error.message || 'Deezer API error');
    return data;
  }

  async function fetchEntity(page) {
    if (entityCache.has(page.id)) return entityCache.get(page.id);
    // gw-light (opt-in) runs IN PARALLEL with the public calls, so a slow internal
    // API cannot delay the public data; its failure just means "no extra data".
    const gwPromise = settings.gwEnrich ? gwSongsFor(page) : Promise.resolve(null);
    let model;
    if (page.type === 'album') {
      const a = await apiGet(`/album/${page.id}`);
      const tracks = await apiGet(`/album/${page.id}/tracks?limit=200`);
      model = parseAlbum(a, (tracks && tracks.data) || []);
    } else {
      model = parseTrack(await apiGet(`/track/${page.id}`));
    }
    const songs = await gwPromise;
    if (songs && songs.length) {
      try {
        mergeGw(model, songs);
      } catch (err) {
        console.log(`[Deezer] gw-light merge skipped (${err.message}); public data only`);
      }
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
        id: t.id,
        duration: Number(t.duration) || 0, // seconds; used to sanity-check lyric timing
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
          id: t.id,
          duration: Number(t.duration) || 0, // seconds; used to sanity-check lyric timing
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
  //  Section 3b — Deezer lyrics (auth.deezer.com + pipe.deezer.com GraphQL)
  // -------------------------------------------------------------------------

  const AUTH_RENEW_URL = 'https://auth.deezer.com/login/renew?jo=p&rto=c&i=c';
  const AUTH_ANON_URL = 'https://auth.deezer.com/login/anonymous?jo=p&rto=c&i=c';
  const PIPE_URL = 'https://pipe.deezer.com/api';
  const JWT_TTL_MS = 5 * 60 * 1000; // re-use a token for ~5 minutes
  const LYRICS_CONCURRENCY = 4; // tracks fetched side by side
  const LYRICS_SLACK_SEC = 2; // timing may overrun the track length by this much

  /** The one GraphQL query we send. Kept in a single constant because Deezer may
   *  change its schema; if lyrics suddenly fail with a GraphQL validation error,
   *  this string is the place to fix. `milliseconds`/`duration`/`start`/`end` are
   *  all in MILLISECONDS; `lrcTimestamp` is display text we ignore. */
  const LYRICS_QUERY =
    'query GetLyrics($trackId: String!) { track(trackId: $trackId) { id lyrics { id text ' +
    'copyright writers synchronizedLines { lrcTimestamp line milliseconds duration } ' +
    'synchronizedWordByWordLines { start end words { start end word } } } } }';

  /** Shown when the user switches the anonymous-token toggle on. */
  const ANON_WARNING =
    'Lyrics for logged-out users use an anonymous Deezer token. This is unofficial: ' +
    'Deezer has not documented it, it may stop working at any time, and support is not guaranteed. ' +
    'Lyrics are licensed content, for personal use only.';

  // The login token. Memory only — never persisted, never logged.
  let jwtState = { jwt: null, expires: 0, anonymous: false };
  let jwtInflight = null; // one token request at a time, shared by all tracks

  /** Get a fresh token: logged-in first, anonymous only if the user allowed it. */
  async function mintJwt() {
    let jwt = null;
    let anonymous = false;
    try {
      // Plain page fetch on purpose: the user's own cookies must travel with it,
      // which GM_xmlhttpRequest cannot be trusted to do. POST with an empty body.
      const data = await fetchJson(AUTH_RENEW_URL, { method: 'POST', credentials: 'include' });
      jwt = (data && data.jwt) || null;
    } catch (err) {
      console.log(`[Deezer] lyrics login/renew: ${err.status || err.message}`);
    }
    if (!jwt && settings.lyricsAnonymous) {
      try {
        const data = await fetchJson(AUTH_ANON_URL, { credentials: 'omit' });
        jwt = (data && data.jwt) || null;
        anonymous = !!jwt;
      } catch (err) {
        console.log(`[Deezer] lyrics login/anonymous: ${err.status || err.message}`);
      }
    }
    if (!jwt) throw Object.assign(new Error('login required'), { status: 'login' });
    jwtState = { jwt, expires: Date.now() + JWT_TTL_MS, anonymous };
    return jwt;
  }

  /** Token for the lyrics calls. Pass the token that just got rejected as `staleJwt`
   *  to force a replacement — unless another track already replaced it, in which
   *  case the newer one is returned without another request. */
  function getLyricsJwt(staleJwt) {
    if (jwtState.jwt && jwtState.jwt !== staleJwt && Date.now() < jwtState.expires)
      return Promise.resolve(jwtState.jwt);
    if (!jwtInflight)
      jwtInflight = mintJwt().finally(() => {
        jwtInflight = null;
      });
    return jwtInflight;
  }

  /** Forget the cached token (e.g. when the anonymous toggle changes). */
  function resetLyricsJwt() {
    jwtState = { jwt: null, expires: 0, anonymous: false };
  }

  /** The error "types" in a GraphQL reply. Deezer puts them in `type` or in
   *  `extensions.type` depending on the error, so both are read. */
  function graphqlErrorTypes(body) {
    const out = [];
    for (const e of (body && body.errors) || []) {
      if (e && e.type) out.push(String(e.type));
      if (e && e.extensions && e.extensions.type) out.push(String(e.extensions.type));
    }
    return out;
  }

  /**
   * Fetch one track's lyrics object from pipe.deezer.com.
   * Returns the raw `lyrics` object, or null when the track simply has none
   * (LyricsNotFoundError / TrackNotFoundError / `lyrics: null`). An expired or
   * invalid token is replaced once and the call retried once. Anything else
   * throws; `err.status` holds the HTTP status, 'timeout' or 'network' if known.
   */
  async function fetchDeezerLyrics(trackId) {
    let jwt = await getLyricsJwt();
    for (let attempt = 0; ; attempt++) {
      let body;
      try {
        body = await fetchJson(PIPE_URL, {
          method: 'POST',
          credentials: 'omit',
          headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            operationName: 'GetLyrics',
            variables: { trackId: String(trackId) },
            query: LYRICS_QUERY,
          }),
        });
      } catch (err) {
        if (err.status === 401 && attempt === 0) {
          jwt = await getLyricsJwt(jwt);
          continue;
        }
        throw err;
      }
      const lyrics = body && body.data && body.data.track && body.data.track.lyrics;
      const types = graphqlErrorTypes(body);
      if (lyrics) return lyrics;
      if (types.some((t) => t === 'LyricsNotFoundError' || t === 'TrackNotFoundError')) return null;
      if (types.some((t) => t === 'JwtTokenExpiredError' || t === 'JwtTokenInvalidError')) {
        if (attempt === 0) {
          jwt = await getLyricsJwt(jwt);
          continue;
        }
        throw Object.assign(new Error('login token rejected'), { status: 'token' });
      }
      if (body && body.errors && body.errors.length)
        throw new Error(`GraphQL error (${types.join(',') || 'unknown'})`);
      return null; // no errors, no lyrics → none
    }
  }

  /** Milliseconds (number or numeric string) → seconds. */
  const msToSec = (v) => (Number(v) || 0) / 1000;

  /** The last timed line ends more than a couple of seconds after the track's own
   *  length → the timing belongs to another version; don't trust that tier. */
  function timingOverruns(model, durationSec) {
    if (!model || !(durationSec > 0)) return false;
    const end = model.lines.reduce((m, l) => Math.max(m, l.end || l.begin || 0), 0);
    return end > durationSec + LYRICS_SLACK_SEC;
  }

  /**
   * Turn Deezer's `lyrics` object into the shared model, one per tier:
   *   { word, line, static }  — each a model {wordTimed,lineTimed,lines} or null.
   * `durationSec` (the track length) enables the overrun sanity check.
   */
  function parseDeezerLyrics(raw, durationSec) {
    const out = { word: null, line: null, static: null };
    if (!raw) return out;

    // WORD tier. Words arrive without spaces: trim each, drop empties, then add a
    // trailing space to every word except the last of the line.
    if (Array.isArray(raw.synchronizedWordByWordLines)) {
      const lines = [];
      for (const ln of raw.synchronizedWordByWordLines) {
        const words = [];
        for (const w of (ln && ln.words) || []) {
          const text = String((w && w.word) ?? '').trim();
          if (text) words.push({ begin: msToSec(w.start), end: msToSec(w.end), text });
        }
        if (!words.length) continue;
        words.forEach((w, i) => {
          if (i < words.length - 1) w.text += ' ';
        });
        lines.push({
          begin: words[0].begin,
          end: words[words.length - 1].end,
          text: words
            .map((w) => w.text)
            .join('')
            .trim(),
          words,
        });
      }
      if (lines.length) out.word = { wordTimed: true, lineTimed: true, lines };
    }

    // LINE tier: use milliseconds + duration (lrcTimestamp is display text only).
    if (Array.isArray(raw.synchronizedLines)) {
      const lines = [];
      for (const ln of raw.synchronizedLines) {
        const text = String((ln && ln.line) ?? '').trim();
        if (!text) continue;
        const begin = msToSec(ln.milliseconds);
        lines.push({ begin, end: begin + msToSec(ln.duration), text, words: [] });
      }
      lines.sort((a, b) => a.begin - b.begin);
      if (lines.length) out.line = { wordTimed: false, lineTimed: true, lines };
    }

    if (timingOverruns(out.word, durationSec)) out.word = null;
    if (timingOverruns(out.line, durationSec)) out.line = null;

    // STATIC tier: the plain text; if absent, reuse the best timed tier's text.
    let texts = [];
    if (typeof raw.text === 'string' && raw.text.trim())
      texts = raw.text
        .trim()
        .split(/\r?\n/)
        .map((x) => x.trim());
    else if (out.line || out.word) texts = (out.line || out.word).lines.map((l) => l.text);
    if (texts.length)
      out.static = {
        wordTimed: false,
        lineTimed: false,
        lines: texts.map((text) => ({ begin: 0, end: 0, text, words: [] })),
      };
    return out;
  }

  /**
   * Resolve one track's lyrics in the requested tier, FALLING BACK to the best
   * format the track really has: word → line → static. Returns
   * { text, ext, kind, rawWords } (`kind` = what was produced, `rawWords` = the
   * untouched word-timing array when the raw .json option wants it) or null when
   * the track has no lyrics.
   */
  async function trackLyrics(t, tier) {
    const raw = await fetchDeezerLyrics(t.id);
    if (!raw) return null;
    const parsed = parseDeezerLyrics(raw, t.duration);
    if (tier === 'word' && parsed.word)
      return {
        text: lyricsToWordLrc(parsed.word),
        ext: 'lrc',
        kind: 'word',
        rawWords: settings.lyricsRawJson ? raw.synchronizedWordByWordLines : null,
      };
    if (tier !== 'static' && parsed.line)
      return { text: lyricsToLineLrc(parsed.line), ext: 'lrc', kind: 'line', rawWords: null };
    if (parsed.static)
      return { text: lyricsToPlain(parsed.static), ext: 'txt', kind: 'static', rawWords: null };
    return null;
  }

  /**
   * Download the entity's lyrics in `tier` ('word'|'line'|'static'). Several files
   * (an album, or one word-synced song with its raw .json) become a ZIP; a lone
   * file downloads directly. Each track falls back independently (see trackLyrics),
   * tracks with no lyrics are skipped, one failing track never stops the rest, and
   * EVERY outcome ends in a toast. Logs hold counts and ids only — never lyric text
   * and never the token.
   */
  async function downloadLyrics(model, tier) {
    const tierLabel = { word: 'word-by-word', line: 'line-by-line', static: 'static' }[tier];
    try {
      const tracks = model.tracks.filter((t) => t.id);
      if (!tracks.length) return toast('No tracks to fetch lyrics for');
      // Get the token up front so a logged-out user gets one clear message.
      try {
        await getLyricsJwt();
      } catch (err) {
        if (err.status === 'login')
          return toast(
            settings.lyricsAnonymous
              ? 'Could not get a Deezer lyrics token (logged out and the anonymous route failed)'
              : 'Log in to Deezer to download lyrics',
          );
        throw err;
      }
      toast(`Fetching ${tierLabel} lyrics…${jwtState.anonymous ? ' (anonymous, unofficial)' : ''}`);

      let none = 0;
      let failed = 0;
      let rateLimited = false;
      const settled = await pool(tracks, LYRICS_CONCURRENCY, async (t) => {
        try {
          const lyr = await trackLyrics(t, tier);
          if (!lyr) {
            none++;
            return null;
          }
          return { t, ...lyr };
        } catch (err) {
          failed++;
          if (err.status === 403 || err.status === 429) rateLimited = true;
          console.warn(`[Deezer] lyrics ${t.id}: ${err.status || err.message}`);
          return null;
        }
      });
      const out = settled.filter(Boolean);
      const limitNote = rateLimited ? ' Deezer is rate-limiting — try again shortly.' : '';
      if (!out.length) {
        if (failed && !none) return toast(`Lyrics failed for all ${failed} track(s).${limitNote}`);
        return toast(`No lyrics returned for this release (see console for status).${limitNote}`);
      }
      const fellBack = new Set();
      for (const r of out)
        if ((TIER_RANK[r.kind] || 0) < (TIER_RANK[tier] || 0)) fellBack.add(r.kind);
      const note =
        (fellBack.size ? ` (some fell back to ${[...fellBack].sort().join(' / ')})` : '') +
        (failed ? ` — ${failed} failed.${limitNote}` : '');

      // Counts only — never lyrics — so a word→line downgrade is observable.
      const tally = out.reduce((m, r) => ((m[r.kind] = (m[r.kind] || 0) + 1), m), {});
      console.log(
        `[Deezer] lyrics: ${out.length}/${tracks.length} tracks — ` +
          `word=${tally.word || 0} line=${tally.line || 0} static=${tally.static || 0}`,
      );

      const files = [];
      for (const r of out) {
        const stem = lyricsFileStem(r.t);
        files.push({ name: `${stem}.${r.ext}`, text: r.text });
        if (tier === 'word' && r.kind === 'word' && r.rawWords)
          files.push({ name: `${stem}.json`, text: JSON.stringify(r.rawWords, null, 2) });
      }
      const saveFile = (f) =>
        downloadBlob(new Blob([f.text], { type: 'text/plain;charset=utf-8' }), f.name);

      if (files.length === 1) {
        saveFile(files[0]);
        return toast(`Lyrics saved ✓${note}`);
      }
      const tag = tierLabel.replace(/[^a-z]/gi, '');
      let blob;
      try {
        blob = buildStoreZip(files);
      } catch (zipErr) {
        // The synchronous builder should not throw; last resort is single files.
        console.warn(`[Deezer] lyrics: ZIP build failed (${zipErr.message}); saving singly`);
        for (const f of files) saveFile(f);
        return toast(`Lyrics saved as ${files.length} files${note}`);
      }
      console.log(`[Deezer] lyrics: zip ready (${blob.size} bytes), saving`);
      downloadBlob(blob, `${safeName(model.artist)} - ${safeName(model.name)}_Lyrics_${tag}.zip`);
      toast(`Lyrics ZIP saved (${out.length} of ${tracks.length} tracks)${note} ✓`);
    } catch (err) {
      toast(`Lyrics failed: ${err.message}`);
    }
  }

  // -------------------------------------------------------------------------
  //  Section 3c — Deezer gw-light (internal website API, opt-in, read-only)
  // -------------------------------------------------------------------------

  const GW_URL = 'https://www.deezer.com/ajax/gw-light.php';

  /** The ONLY gw-light methods this script may call — all read-only. gwCall refuses
   *  anything else, so a later edit cannot make a call that changes the account. */
  const GW_METHODS = new Set(['deezer.getUserData', 'song.getListByAlbum', 'song.getData']);

  // The CSRF token ("checkForm"). Memory only — never persisted, never logged.
  let gwToken = null;
  let gwTokenInflight = null;

  /** Human labels for the SNG_CONTRIBUTORS role keys we know. Unknown keys are shown
   *  as Title Case (see gwRoleLabel). */
  const GW_ROLE_LABELS = {
    main_artist: 'Main artist',
    featuring: 'Featuring',
    author: 'Lyricist',
    composer: 'Composer',
    producer: 'Producer',
    mixer: 'Mixer',
    engineer: 'Engineer',
    'music publisher': 'Music publisher',
    publisher: 'Publisher',
  };
  function gwRoleLabel(role) {
    if (GW_ROLE_LABELS[role]) return GW_ROLE_LABELS[role];
    return String(role)
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  /** The key names in a gw-light `error` field ([] / {} means no error). Only the
   *  KEYS are used (they are short codes like GATEWAY_ERROR), never the values. */
  function gwErrorKeys(body) {
    const e = body && body.error;
    if (Array.isArray(e)) return e.length ? ['error'] : [];
    if (e && typeof e === 'object') return Object.keys(e);
    return [];
  }

  /** One raw gw-light POST. Same-origin page fetch so the user's cookies travel. */
  function gwRaw(method, token, args) {
    if (!GW_METHODS.has(method)) throw new Error(`gw-light method not allowed: ${method}`);
    const q = new URLSearchParams({
      method,
      input: '3',
      api_version: '1.0',
      api_token: token,
    });
    return fetchJson(`${GW_URL}?${q.toString()}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args || {}),
    });
  }

  /** Get (or refresh) the checkForm token via getUserData. It comes back even when
   *  logged out. Only `results.checkForm` is read — nothing else from `results`. */
  function getGwToken(force) {
    if (gwToken && !force) return Promise.resolve(gwToken);
    if (!gwTokenInflight)
      gwTokenInflight = gwRaw('deezer.getUserData', 'null', {})
        .then((body) => {
          const token = body && body.results && body.results.checkForm;
          if (!token || gwErrorKeys(body).length) throw new Error('gw-light: no token');
          gwToken = String(token);
          return gwToken;
        })
        .finally(() => {
          gwTokenInflight = null;
        });
    return gwTokenInflight;
  }

  /**
   * Call an allow-listed gw-light method; returns `results`. An invalid-token reply
   * gets a fresh token ONCE and one retry; any other error throws with only the
   * error KEYS in the message.
   */
  async function gwCall(method, args) {
    if (!GW_METHODS.has(method)) throw new Error(`gw-light method not allowed: ${method}`);
    let token = await getGwToken();
    for (let attempt = 0; ; attempt++) {
      const body = await gwRaw(method, token, args);
      const keys = gwErrorKeys(body);
      if (!keys.length) return (body && body.results) || null;
      const badToken = keys.includes('GATEWAY_ERROR') || keys.includes('VALID_TOKEN_REQUIRED');
      if (badToken && attempt === 0) {
        token = await getGwToken(true);
        continue;
      }
      throw new Error(`gw-light error (${keys.join(',')})`);
    }
  }

  /** All songs of an album (one call). */
  async function fetchGwAlbum(albumId) {
    const r = await gwCall('song.getListByAlbum', { ALB_ID: String(albumId), nb: -1 });
    return (r && Array.isArray(r.data) ? r.data : []).filter(Boolean);
  }
  /** One song (track pages). */
  async function fetchGwTrack(trackId) {
    const r = await gwCall('song.getData', { SNG_ID: String(trackId) });
    return r && typeof r === 'object' ? [r] : [];
  }

  /**
   * Pick ONLY the fields we use from one gw-light song, by NAME from a fixed list.
   * It builds a new object; it never copies the song or deletes from it, so streaming
   * data (TRACK_TOKEN, MD5_ORIGIN, MEDIA*, RIGHTS, …) can never leak through.
   * FILESIZE_* arrive as strings; above zero means "that format exists".
   */
  function pickGwSong(song) {
    if (!song || song.SNG_ID == null) return null;
    const positive = (v) => Number(v) > 0;
    const credits = [];
    const c = song.SNG_CONTRIBUTORS;
    if (c && typeof c === 'object' && !Array.isArray(c)) {
      for (const role of Object.keys(c)) {
        const names = (Array.isArray(c[role]) ? c[role] : []).filter(
          (n) => typeof n === 'string' && n.trim(),
        );
        if (names.length) credits.push({ role: gwRoleLabel(role), names });
      }
    }
    return {
      id: String(song.SNG_ID),
      quality: {
        flac: positive(song.FILESIZE_FLAC),
        mp3_320: positive(song.FILESIZE_MP3_320),
        mp3_128: positive(song.FILESIZE_MP3_128),
        ra360:
          positive(song.FILESIZE_MP4_RA1) ||
          positive(song.FILESIZE_MP4_RA2) ||
          positive(song.FILESIZE_MP4_RA3),
      },
      credits,
      // LYRICS_ID is 0 or absent when the song has no lyrics (inferred; check live).
      hasLyrics: 'LYRICS_ID' in song ? Number(song.LYRICS_ID) > 0 : undefined,
    };
  }

  /** Merge picked gw-light songs into a public model (mutates `model`, which is a
   *  fresh object from parseAlbum/parseTrack). Adds per-track `quality`, `credits`,
   *  `hasLyrics`, and album-wide `gwQuality` (formats ANY track has) and `gwCredits`
   *  (role → names merged over all tracks, no duplicates). */
  function mergeGw(model, songs) {
    const byId = new Map();
    for (const s of songs) {
      const picked = pickGwSong(s);
      if (picked) byId.set(picked.id, picked);
    }
    const union = { flac: false, mp3_320: false, mp3_128: false, ra360: false };
    const roles = new Map();
    let matched = 0;
    for (const t of model.tracks) {
      const g = byId.get(String(t.id));
      if (!g) continue;
      matched++;
      t.quality = g.quality;
      t.credits = g.credits;
      if (g.hasLyrics !== undefined) t.hasLyrics = g.hasLyrics;
      for (const k of Object.keys(union)) union[k] = union[k] || g.quality[k];
      for (const c of g.credits) {
        const set = roles.get(c.role) || new Set();
        c.names.forEach((n) => set.add(n));
        roles.set(c.role, set);
      }
    }
    if (!matched) throw new Error('gw-light: no tracks matched');
    model.gw = true;
    model.gwQuality = union;
    model.gwCredits = [...roles.entries()].map(([role, set]) => ({ role, names: [...set] }));
  }

  /** gw-light for a page, never throwing: returns the songs or null on any failure
   *  (the public data then shows as before). Logs the failure reason only. */
  async function gwSongsFor(page) {
    try {
      return page.type === 'album' ? await fetchGwAlbum(page.id) : await fetchGwTrack(page.id);
    } catch (err) {
      console.log(`[Deezer] gw-light unavailable (${err.status || err.message}); public data only`);
      return null;
    }
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
    .dze-dd { position:relative; display:inline-block; }
    .dze-dd-menu { display:none; position:absolute; z-index:2147483647; top:calc(100% + 4px); left:0;
      min-width:184px; background:#16161d; color:#f2f2f7; border:1px solid #2a2a33; border-radius:10px;
      padding:4px; box-shadow:0 12px 34px rgba(0,0,0,.5); }
    .dze-dd.open .dze-dd-menu { display:block; }
    .dze-dd-item { display:block; width:100%; text-align:left; background:none; border:0; color:inherit;
      padding:7px 11px; border-radius:7px; cursor:pointer; white-space:nowrap;
      font:13px system-ui,-apple-system,sans-serif; }
    .dze-dd-item:hover { background:#a238ff; color:#fff; }
    .dze-notice { position:fixed; top:16px; left:50%; transform:translateX(-50%); z-index:2147483647;
      width:520px; max-width:92vw; background:#3a2a00; color:#ffe9b0; border:1px solid #a27b00;
      border-radius:10px; padding:10px 14px; font:13px/1.45 system-ui,-apple-system,sans-serif;
      box-shadow:0 8px 24px rgba(0,0,0,.5); }
    .dze-notice .dze-close { color:#ffe9b0; }
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
    .dze-badge { display:inline-block; margin:0 4px 2px 0; padding:2px 7px; border-radius:999px; font-size:11px;
      font-weight:600; background:rgba(127,127,127,.2); }
    .dze-badge.hi { background:#a238ff; color:#fff; }
    .dze-badge.muted { background:none; border:1px dashed rgba(127,127,127,.5); color:#9a9aaa; font-weight:500; }
    .dze-link { cursor:pointer; margin-left:8px; font-size:11px; color:#a238ff; text-decoration:underline; }
    .dze-credrow td { background:rgba(127,127,127,.08); font-size:12px; }
    .dze-foot { margin-top:10px; font-size:11px; color:#777; }
    @media (prefers-color-scheme: light) {
      .dze-panel { background:#fff; color:#1a1a1a; border-color:#ddd; }
      .dze-dd-menu { background:#fff; color:#1a1a1a; border-color:#ddd; }
      .dze-table th { background:#fff; color:#666; } .dze-table th, .dze-table td { border-bottom-color:#eee; }
      .dze-panel h3, .dze-row b, .dze-foot { color:#666; }
    }
  `);

  // -------------------------------------------------------------------------
  //  Section 6 — UI (header buttons + panel)
  // -------------------------------------------------------------------------

  /** Find the album-title heading (robust to Deezer's volatile class names): the
   *  heading whose text matches the entity name, else the first non-empty heading
   *  near the top. */
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
   *  `btnClass` styles the trigger for the header (`dze-chip`) or panel (`dze-btn`).
   *  Shared by the lyrics control (and any other multi-choice action). */
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
    const wrap = el('div', { class: 'dze-dd' });
    const trigger = el('button', { class: btnClass, text: `${label} ▾`, title });
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      wrap.classList.toggle('open');
    });
    const menu = el('div', { class: 'dze-dd-menu' });
    for (const [lbl, fn] of opts) {
      menu.append(
        el('button', {
          class: 'dze-dd-item',
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

  /** Format badges for a quality object (see pickGwSong). `emptyLabel` shows when no
   *  format is known to exist: with all sizes at 0 we cannot tell, so we say so
   *  instead of showing a misleading "MP3 only". */
  function gwBadgeNodes(q, emptyLabel) {
    const defs = [
      ['flac', 'Lossless (FLAC)', true],
      ['mp3_320', 'MP3 320', false],
      ['mp3_128', 'MP3 128', false],
      ['ra360', '360 Reality Audio', false],
    ];
    const nodes = defs
      .filter(([k]) => q && q[k])
      .map(([, label, hi]) => el('span', { class: `dze-badge${hi ? ' hi' : ''}`, text: label }));
    if (!nodes.length && emptyLabel)
      nodes.push(el('span', { class: 'dze-badge muted', text: emptyLabel }));
    return nodes;
  }

  /** Show a visible on-page warning box (used when the user opts in to something
   *  unofficial). Built with textContent only; closes on click and after 25 s. */
  function showNotice(text) {
    document.querySelector('.dze-notice')?.remove();
    const box = el(
      'div',
      { class: 'dze-notice', role: 'alert' },
      el('button', { class: 'dze-close', text: '×', title: 'Close', onclick: () => box.remove() }),
      el('b', { text: 'Deezer Enhancer — please note' }),
      el('div', { text }),
    );
    document.body.append(box);
    setTimeout(() => box.remove(), 25000);
  }

  /** Does it make sense to offer lyrics for this release? When the gw-light layer
   *  supplied LYRICS_ID flags (t.hasLyrics true/false), offer lyrics only if at least
   *  one track has them. Without that data (gw-light off or failed) always offer —
   *  the download itself skips tracks that turn out to have none. The flag is an
   *  inference (LYRICS_ID 0/absent = no lyrics), so it only hides the BUTTON; it
   *  never filters which tracks are requested. */
  function lyricsOffered(model) {
    const flags = model.tracks.filter((t) => t.hasLyrics !== undefined);
    if (!model.gw || !flags.length) return true;
    return flags.some((t) => t.hasLyrics);
  }

  /** Build the "Download Lyrics" dropdown (Word-by-Word / Line-by-Line / Static).
   *  Returns null when the feature is switched off or the release has no lyrics. */
  function lyricsControl(model, btnClass) {
    if (!settings.downloadLyrics || !lyricsOffered(model)) return null;
    const opts = [
      ['Word-by-Word Lyrics', () => downloadLyrics(model, 'word')],
      ['Line-by-Line Lyrics', () => downloadLyrics(model, 'line')],
      ['Static Lyrics', () => downloadLyrics(model, 'static')],
    ];
    return ddControl(btnClass, 'Download Lyrics', 'Word-by-word / synced / plain lyrics', opts);
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
    const lyrChip = lyricsControl(model, 'dze-chip');
    if (lyrChip) row.append(lyrChip);
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
    const showQuality = settings.gwEnrich && settings.gwLossless && model.gw;
    if (showQuality)
      panel.append(
        el(
          'div',
          { class: 'dze-row' },
          el('b', { text: 'Quality: ' }),
          ...gwBadgeNodes(model.gwQuality, 'log in to see quality'),
        ),
      );

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
    const lyrBtn = lyricsControl(model, 'dze-btn');
    if (lyrBtn) actions.append(lyrBtn);
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
      const heads = ['#', 'Title', 'Artist', 'ISRC'];
      if (showQuality) heads.push('Quality');
      heads.forEach((h) => head.append(el('th', { text: h })));
      table.append(el('thead', {}, head));
      const tbody = el('tbody');
      for (const t of model.tracks) {
        const tr = el('tr');
        tr.append(el('td', { text: multiDisc ? `${t.disc}.${t.track}` : String(t.track || '') }));
        const titleTd = el('td', { text: t.name });
        // Per-track credits (gw-light): a "Credits" link that expands a row below.
        const showTrackCredits =
          settings.gwEnrich && settings.gwCredits && t.credits && t.credits.length;
        let credTr = null;
        if (showTrackCredits) {
          credTr = el('tr', { class: 'dze-credrow', hidden: '' });
          const credTd = el('td', { colspan: String(heads.length) });
          for (const c of t.credits)
            credTd.append(
              el(
                'div',
                {},
                el('b', { text: `${c.role}: ` }),
                el('span', { text: c.names.join(', ') }),
              ),
            );
          credTr.append(credTd);
          titleTd.append(
            el('span', {
              class: 'dze-link',
              text: 'Credits',
              onclick: () => credTr.toggleAttribute('hidden'),
            }),
          );
        }
        tr.append(titleTd);
        tr.append(el('td', { text: t.artist }));
        tr.append(
          el('td', {
            class: 'dze-mono dze-isrc',
            text: t.isrc || '—',
            title: t.isrc ? 'Click to copy' : '',
            onclick: () => t.isrc && copy(t.isrc, 'ISRC copied'),
          }),
        );
        if (showQuality) {
          const qTd = el('td');
          const nodes = t.quality ? gwBadgeNodes(t.quality, '—') : [];
          if (nodes.length) qTd.append(...nodes);
          else qTd.textContent = '—';
          tr.append(qTd);
        }
        tbody.append(tr);
        if (credTr) tbody.append(credTr);
      }
      table.append(tbody);
      panel.append(table);
    }

    // --- contributors / credits ---
    // With gw-light credits on, the full album-wide "Credits" block REPLACES the
    // public "Contributors" block (which is mostly performers). If gw-light failed
    // (model.gw unset) the public contributors show as before.
    const fullCredits =
      settings.gwEnrich && settings.gwCredits && model.gw && model.gwCredits.length;
    if (settings.showCredits && (fullCredits || (model.credits && model.credits.length))) {
      panel.append(
        el('h3', { text: fullCredits ? 'Credits' : 'Contributors', style: { marginTop: '14px' } }),
      );
      for (const c of fullCredits ? model.gwCredits : model.credits)
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
        text:
          'Data from Deezer (public API) · ISRC/UPC for MusicBrainz & MagicISRC' +
          (model.gw ? ' · Extra data from Deezer internal API' : '') +
          (settings.downloadLyrics ? ' · Lyrics © their owners, via Deezer, for personal use' : ''),
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
  function toggle(key, label, reload = true) {
    saveSetting(key, !settings[key]);
    rebuildMenu();
    toast(`${label} ${settings[key] ? 'on' : 'off'}${reload ? ' — reload to apply' : ''}`);
  }
  function buildMenu() {
    const on = (v) => (v ? 'on' : 'off');
    const gwNeed = settings.gwEnrich ? '' : ' (needs gw-light)';
    const need = settings.downloadLyrics ? '' : ' (needs Download Lyrics)'; // dependent toggles
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
      addCmd(
        'gwEnrich',
        `Deezer internal data (gw-light, needs login): ${on(settings.gwEnrich)}`,
        () => {
          toggle('gwEnrich', 'Deezer internal data');
          entityCache.clear(); // models were built with the old setting
          gwToken = null;
          if (settings.gwEnrich)
            showNotice(
              'Deezer internal data uses an undocumented Deezer website API with your own login session. ' +
                'It is read-only and may stop working at any time; if it does, the public data is shown instead.',
            );
        },
      ),
      addCmd('gwLossless', `Lossless / quality badges${gwNeed}: ${on(settings.gwLossless)}`, () =>
        toggle('gwLossless', 'Quality badges', false),
      ),
      addCmd(
        'gwCredits',
        `Full credits (songwriters, producers)${gwNeed}: ${on(settings.gwCredits)}`,
        () => toggle('gwCredits', 'Full credits', false),
      ),
      addCmd('downloadLyrics', `Download Lyrics button: ${on(settings.downloadLyrics)}`, () =>
        toggle('downloadLyrics', 'Download Lyrics button'),
      ),
      addCmd(
        'lyricsAnonymous',
        `Lyrics when logged out (anonymous token, unofficial)${need}: ${on(settings.lyricsAnonymous)}`,
        () => {
          toggle('lyricsAnonymous', 'Lyrics when logged out', false);
          resetLyricsJwt();
          if (settings.lyricsAnonymous) showNotice(ANON_WARNING);
        },
      ),
      addCmd(
        'lyricsRawJson',
        `Word-by-Word also saves raw .json${need}: ${on(settings.lyricsRawJson)}`,
        () => toggle('lyricsRawJson', 'Raw word-timing .json', false),
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

  let headerUIBusy = false; // serialise attempts so only one fetchEntity runs at a time
  async function maybeHeaderUI() {
    if (headerUIBusy) return;
    const page = parsePage();
    if (!page) return;
    headerUIBusy = true;
    try {
      injectHeaderUI(await fetchEntity(page));
    } catch {
      /* API not ready / failed — launcher still works on demand */
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
    document.querySelector('.dze-actions')?.remove();
    ensureLauncher();
    placeHeaderUI();
  }

  /** Place the inline header UI, RETRYING UNTIL IT LANDS. Deezer renders the
   *  album header at very different times across pages (ones with many tracks or
   *  rich metadata render notably later), so the old fixed ~5s retry window left
   *  the buttons missing on those (while the on-demand panel always worked). A
   *  MutationObserver plus a bounded poll keep trying until placed, or ~15s.
   *  fetchEntity is cached and maybeHeaderUI is serialised, so repeated attempts
   *  are cheap. */
  function placeHeaderUI() {
    if (placeStop) placeStop(); // cancel a previous route's attempts
    const page = parsePage();
    const placed = () => document.querySelector('.dze-actions');
    const deadline = Date.now() + 15000; // overall cap
    let settledAt = 0; // when the model first became available (cached)
    let debounce = null;
    const attempt = () => {
      if (placed() || Date.now() > deadline) return stop();
      // Once the model is cached the header renders quickly — so if nothing has
      // been placed ~3s after the data is ready, there is simply nothing to place
      // here; stop, rather than churn for the full deadline.
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
  hookHistory('pushState');
  hookHistory('replaceState');
  window.addEventListener('popstate', onRoute);
  setInterval(onRoute, 1500);

  // Close any open dropdown (e.g. Download Lyrics) when clicking elsewhere on the page.
  document.addEventListener('click', () => {
    document.querySelectorAll('.dze-dd.open').forEach((d) => d.classList.remove('open'));
  });

  rebuildMenu();
  ensureLauncher();
  onRoute();
})();
