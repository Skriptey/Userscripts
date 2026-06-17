// ==UserScript==
// @name         BunkrDL — Bunkr bulk downloader
// @namespace    https://github.com/Skriptey/Userscripts
// @version      1.6.1
// @description  Adds rate-limited bulk-download controls (by media type, bundled into size-capped ZIPs) to Bunkr albums and balbums.st listing pages.
// @author       Skriptey
// @license      GPL-3.0-or-later
// @match        https://balbums.st/*
// @match        https://www.balbums.st/*
// @match        https://bunkr.cr/*
// @match        https://bunkr.ru/*
// @match        https://bunkr.si/*
// @match        https://bunkr.ws/*
// @match        https://bunkr.fi/*
// @match        https://bunkr.ph/*
// @match        https://bunkr.pk/*
// @match        https://bunkr.ps/*
// @match        https://bunkr.ac/*
// @match        https://bunkr.ci/*
// @match        https://bunkr.sk/*
// @match        https://bunkr.media/*
// @match        https://bunkr.site/*
// @match        https://bunkr.black/*
// @match        https://bunkr.red/*
// @match        https://bunkr.su/*
// @include      /^https?:\/\/(?:[^\/.]+\.)*bunkrr?\.[a-z]{2,}\/(?:a|f|v|i|d)\/[^\/?#]+/
// @run-at       document-idle
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_notification
// @grant        GM_addStyle
// @grant        GM_download
// @grant        GM_deleteValue
// @grant        GM_listValues
// @connect      balbums.st
// @connect      bunkr.cr
// @connect      bunkr.ru
// @connect      bunkr.su
// @connect      bunkr.ac
// @connect      bunkr.ci
// @connect      bunkr.fi
// @connect      bunkr.ph
// @connect      bunkr.pk
// @connect      bunkr.ps
// @connect      bunkr.si
// @connect      bunkr.sk
// @connect      bunkr.ws
// @connect      bunkr.black
// @connect      bunkr.red
// @connect      bunkr.media
// @connect      bunkr.site
// @connect      bunkr.ax
// @connect      bunkr.cat
// @connect      bunkr.la
// @connect      bunkr.is
// @connect      bunkr.to
// @connect      cdn.cr
// @connect      dl.bunkr.cr
// @connect      glb-apisign.cdn.cr
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js
// @homepageURL  https://github.com/Skriptey/Userscripts/tree/main/scripts/BunkrDL
// @supportURL   https://github.com/Skriptey/Userscripts/issues
// @downloadURL  https://skriptey.github.io/Userscripts/BunkrDL/BunkrDL.user.js
// @updateURL    https://skriptey.github.io/Userscripts/BunkrDL/BunkrDL.user.js
// ==/UserScript==

// SPDX-License-Identifier: GPL-3.0-or-later
/* global JSZip */

// ===========================================================================
//  BunkrDL — Bunkr bulk downloader
// ===========================================================================
//
//  WHAT THIS SCRIPT DOES
//  ---------------------
//  • On a Bunkr ALBUM page (https://<any-bunkr-domain>/a/<id>) it adds a
//    "Bulk Download ▾" dropdown next to the page's "Advanced Filters" control
//    (or, if that control can't be found, a floating button bottom-right).
//    The dropdown offers: Images / Videos / Audio / Archives / All. Each file
//    card in the grid also gets a "⬇ Download" button for just that one file.
//  • On balbums.st listing pages (search, /live, /topalbums, /topvideos,
//    /topfiles, /topimages) it adds a small "⬇ Download ▾" dropdown under each
//    album card. Picking a type fetches that album from Bunkr and downloads it.
//  • On a single Bunkr file page (/f/ /v/ /i/ /d/) it adds a download button that
//    fetches just that one file directly (no ZIP).
//
//  HOW DOWNLOADING WORKS (re-verified live 2026-06-16 against bunkr.cr — an
//  839 MiB file downloaded end-to-end, HTTP 200; Bunkr changes this often)
//  -------------------------------------------------------------------
//  This is a FOUR-step resolver. The old single-call apidl.bunkr.ru + XOR path
//  (and its get.bunkrr.su Referer) is DEAD — see resolveFileUrl() for details.
//
//  1. ENUMERATE the album. The COMPLETE file manifest lives only on an album's
//     *advanced view* (`?advanced=1`), as a JS array
//     `window.albumFiles = [ {slug, original, name, size, extension, thumbnail,
//     timestamp}, ... ]`. *** The numeric "id" field is GONE from albumFiles
//     now *** — only `slug` is stable, so the numeric file id is read per file
//     in step 2. The default album page only renders a paginated subset, so
//     BunkrDL fetches the `?advanced=1` HTML in the background (this IS the
//     "Advanced View" step — done without navigating you away) and parses the
//     array. Sorting by size is then done internally (largest-first), so the
//     site's "Size" button isn't needed. See fetchAlbum() + parseAlbumFiles().
//  2. READ each file's numeric id + resolver host. Fetch the file page
//     `https://<albumHost>/f/<slug>` and read its primary download button:
//        href="https://dl.bunkr.<tld>/file/<NUMERIC_ID>"  (and data-file-id=…)
//     Take BOTH the resolver host (e.g. dl.bunkr.cr) AND the numeric id from
//     that href. Do NOT assume dl.<currentDomain> — dl.bunkr.fi, say, does not
//     resolve. data-file-id is the id fallback. See resolveItemId(). The
//     `<albumHost>` is the ALBUM's own Bunkr origin (threaded through as
//     `album.base`), NOT the current page — so the cross-origin balbums.st card
//     flow fetches `/f/<slug>` on the right Bunkr host, not on balbums.st.
//  3. RESOLVE the media path. POST {"id":"<NUMERIC_ID as string>"} (numeric
//     returns HTTP 400) with Content-Type: application/json to the resolver host
//     `https://<resolverHost>/api/_001_v2`. The response is now UNENCRYPTED —
//     no XOR, no SECRET_KEY, no base64:
//        { mediafiles:"https://<sub>.cdn.cr", original:"<name>",
//          path:"/storage/media/<uuid>.<ext>" }
//     rawUrl = mediafiles + path. See resolveFileUrl().
//  4. SIGN the path. GET
//     `https://glb-apisign.cdn.cr/sign?path=<encodeURIComponent(rawUrl pathname)>`
//     (no cookies). Response: { token, ex }. The final URL is rawUrl plus the
//     query params n=<original filename>, token=<token>, ex=<ex>. The signature
//     authorises the GET — *** no Referer is needed *** and the UNSIGNED url
//     returns 403. Media lives on a rotating *.cdn.cr subdomain. See signUrl().
//
//  Then we download each signed URL with GM_xmlhttpRequest (cross-origin, with
//  progress), rate-limited with backoff on HTTP 429/503, optionally in parallel
//  (concurrency setting). Each download is size-verified against the manifest
//  (truncated files retry), then bundled into ZIPs capped at a configurable size
//  (default 1 GiB), named "<AlbumName>_1.zip", "<AlbumName>_2.zip", … Completed
//  files are remembered so an interrupted album resumes, and filenames are
//  decoded (Bunkr uses "+" and %20 for spaces). The progress panel shows ZIP-build
//  progress — a percentage plus a compositor "sheen" that keeps moving while JSZip
//  packs, so a live build is visually distinct from a frozen one — and surfaces a
//  ZIP that fails to build (e.g. the tab hitting a memory limit) as "❌ <name>: …"
//  rather than letting it stall silently.
//
//  NO-ZIP "Download All" — with ZIP bundling off, each file saves individually.
//  Saving and fetching are DECOUPLED: the fetch workers hand finished blobs to a
//  save queue and immediately fetch the next file, while a single background
//  drainer (drainSaves) saves one file at a time. So a slow "where to save?"
//  dialog — or GM_download waiting on the manager — no longer stalls the queue;
//  the rest keep downloading in the background. Un-saved blobs held in memory are
//  bounded by the max-ZIP-size knob (a worker pauses fetching when that cap is
//  reached), and a file's resume "done" mark is committed only once it's saved.
//
//  @connect set — the two FIXED hosts, resolver dl.bunkr.cr and signer
//  glb-apisign.cdn.cr, are listed EXPLICITLY (belt-and-braces for any manager
//  that doesn't match @connect subdomains); they're also covered as subdomains of
//  the already-listed bunkr.<tld> / cdn.cr. The media host is a ROTATING *.cdn.cr
//  subdomain that can't be enumerated, so it always relies on the cdn.cr entry +
//  subdomain matching (Tampermonkey, Violentmonkey and Greasemonkey all do this).
//  Album HTML is on the various bunkr TLDs, and balbums.st serves its cards. If
//  Bunkr moves media to a brand-new CDN domain, downloads fail and the failure is
//  surfaced — a red "❌ <message>" in the progress panel and a "[BunkrDL] … failed"
//  console line naming the blocked host — so it can be added here (and reported).
//  See scripts/BunkrDL/README.md → "Security & permissions".
//
//  TARGETING — Bunkr spans ~20 rotating TLDs, which a @match pattern can't
//  wildcard, so the @include regex is the real Bunkr matcher (every TLD +
//  subdomain, album /a/ and file /f//v//i//d/ pages). The explicit @match lines
//  are a fallback for managers that down-rank @include; boot() path-checks
//  before injecting, so matching a whole domain is harmless. (This note lives
//  OUTSIDE the metadata block on purpose — a "// @…" line inside it would be
//  parsed as a real directive.)
//
//  CONFIGURATION — open your userscript manager's menu for BunkrDL to set the
//  max ZIP size, request delay/jitter, retries, parallel downloads, oversize-file
//  behaviour, ZIP vs individual mode, compression, pre-flight confirmation, size
//  verification, resume, and GM_download saving; plus "Clear resume data".
//  Settings persist via GM storage and apply immediately; toggle/cycle items
//  change on a single click, and the menu re-registers itself so each
//  "(current: …)" label refreshes when you reopen the menu (registerMenu /
//  refreshMenu — userscript managers can't repaint a menu label in place).
//
//  This script ships verbatim (no build step). Keep the comments accurate when
//  you edit it — see the repo standing task on annotations.
// ===========================================================================

(function () {
  'use strict';

  // -------------------------------------------------------------------------
  //  Section 0 — guard against double injection
  // -------------------------------------------------------------------------
  // Userscript managers can occasionally run a script twice (e.g. bfcache,
  // SPA-ish navigations). A window flag keeps us idempotent.
  if (window.__bunkrDL_loaded) return;
  window.__bunkrDL_loaded = true;

  // -------------------------------------------------------------------------
  //  Section 1 — constants & settings
  // -------------------------------------------------------------------------

  const MIB = 1024 * 1024;

  // Default, user-overridable settings (persisted via GM_setValue/GM_getValue).
  const DEFAULTS = {
    maxZipMB: 1024, // target maximum size of each generated ZIP, in MiB
    delayMs: 1500, // base pause between files (rate limiting)
    jitterMs: 750, // random extra 0..jitterMs added to each pause (looks less robotic)
    maxRetries: 4, // attempts per file before giving up
    backoffBaseMs: 5000, // first backoff wait after a rate-limit response
    backoffMaxMs: 120000, // cap on backoff wait
    oversize: 'ask', // a single file bigger than the ZIP cap: 'ask' | 'extend' | 'skip'
    compression: 'STORE', // 'STORE' (fast, no recompress — best for media) or 'DEFLATE'
    zip: true, // true = bundle into ZIPs; false = save each file individually
    concurrency: 1, // parallel downloads (1 = sequential; higher = faster but more ban risk)
    confirm: true, // show a pre-flight summary + confirmation before a job starts
    verifySize: true, // re-download files whose byte size is short of the manifest size
    resume: true, // remember completed files so an interrupted album can resume
    useGmDownload: false, // save via GM_download (manager handles saving, no per-file dialog) instead of an <a> click — recommended for no-ZIP "Download All"
  };

  // The resolver API path (appended to each file's own dl.bunkr.<tld> host — the
  // host is read per file from the file page's download button, NOT hardcoded,
  // because the right resolver host varies by TLD; see resolveItemId). And the
  // signing endpoint, which mints the short-lived token that authorises the CDN
  // GET. Both are fixed paths; only the resolver *host* rotates.
  const RESOLVER_API_PATH = '/api/_001_v2';
  const SIGN_ENDPOINT = 'https://glb-apisign.cdn.cr/sign';

  // Live settings object, merged from storage on top of the defaults.
  const settings = loadSettings();

  /** Read persisted settings, falling back to DEFAULTS for any missing key. */
  function loadSettings() {
    const s = { ...DEFAULTS };
    for (const key of Object.keys(DEFAULTS)) {
      try {
        const v = GM_getValue(key, undefined);
        if (v !== undefined && v !== null && v !== '') s[key] = v;
      } catch {
        /* GM storage unavailable — stick with defaults */
      }
    }
    return s;
  }

  /** Persist one setting and update the in-memory copy. */
  function saveSetting(key, value) {
    settings[key] = value;
    try {
      GM_setValue(key, value);
    } catch {
      /* ignore */
    }
  }

  // File-type → extension map. Used to filter which files a menu option grabs.
  const EXT = {
    images: [
      'jpg',
      'jpeg',
      'png',
      'gif',
      'webp',
      'avif',
      'bmp',
      'tif',
      'tiff',
      'heic',
      'heif',
      'jfif',
      'svg',
      'ico',
    ],
    videos: [
      'mp4',
      'mkv',
      'webm',
      'mov',
      'avi',
      'm4v',
      'ts',
      'm2ts',
      'mpg',
      'mpeg',
      'wmv',
      'flv',
      '3gp',
      'ogv',
    ],
    audio: ['mp3', 'm4a', 'flac', 'wav', 'ogg', 'oga', 'opus', 'aac', 'wma', 'aiff', 'aif'],
    archives: ['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'zst', 'cbz', 'cbr', 'iso'],
  };

  // The five dropdown options. `key` drives filtering; 'all' means everything.
  const CATEGORIES = [
    { key: 'images', label: 'Download Images' },
    { key: 'videos', label: 'Download Videos' },
    { key: 'audio', label: 'Download Audio' },
    { key: 'archives', label: 'Download Archives' },
    { key: 'all', label: 'Download All' },
  ];

  // -------------------------------------------------------------------------
  //  Section 2 — small utilities
  // -------------------------------------------------------------------------

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /** Base pause with jitter, used between files for polite rate limiting. */
  const politePause = () => sleep(settings.delayMs + Math.floor(Math.random() * settings.jitterMs));

  /** Human-readable byte size, e.g. 1536000000 → "1.43 GiB". */
  function formatBytes(n) {
    if (!n || n < 0) return '0 B';
    const u = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
    let i = 0;
    while (n >= 1024 && i < u.length - 1) {
      n /= 1024;
      i++;
    }
    return `${n.toFixed(i ? 2 : 0)} ${u[i]}`;
  }

  /** Turn a Bunkr-style encoded filename into a readable one. Bunkr uses "+" for
   *  spaces and may percent-encode characters (e.g. "%20", "%28"), both in URLs
   *  and in stored names. Decode both so ZIP entries and saved files read
   *  naturally — e.g. "My+File%20(1).mp4" → "My File (1).mp4". */
  function decodeFileName(name) {
    const s = String(name || '').replace(/\+/g, ' '); // "+" → space (Bunkr convention)
    try {
      return decodeURIComponent(s); // "%20" → space, "%28" → "(", etc.
    } catch {
      return s.replace(/%20/gi, ' '); // malformed % escape — at least fix spaces
    }
  }

  /** Lower-cased file extension (no dot), or '' if none. */
  function extOf(name) {
    const m = /\.([a-z0-9]+)(?:$|\?)/i.exec(name || '');
    return m ? m[1].toLowerCase() : '';
  }

  /** Which CATEGORIES.key a filename belongs to ('images'|'videos'|...|'other'). */
  function categoryOf(name) {
    const e = extOf(name);
    for (const key of Object.keys(EXT)) if (EXT[key].includes(e)) return key;
    return 'other';
  }

  /** True if a file should be included for the chosen menu option. */
  function fileMatchesCategory(name, chosen) {
    return chosen === 'all' || categoryOf(name) === chosen;
  }

  /** Strip characters that are illegal in filenames on common OSes. Keeps dots
   *  (album names like "TravelVids.xyz" rely on them). */
  function sanitizeFilename(name) {
    return (
      String(name || '')
        .replace(/[<>:"/\\|?*]/g, '_') // strip path-illegal characters (incl. backslash)
        .replace(/\s+/g, ' ')
        .replace(/^\.+/, '') // no leading dots (hidden files)
        .trim()
        .slice(0, 180) || 'bunkr-album'
    );
  }

  /** Decode HTML entities in og:title (which is attribute-escaped). Pure string
   *  work — no DOM/innerHTML, so there's no XSS sink (the title is only used for
   *  filenames + textContent anyway). Bunkr occasionally double-encodes, so we
   *  run the pass twice. Handles named (&amp; &lt; &gt; &quot; &apos; &nbsp;) and
   *  numeric (&#39; &#x27;) entities; unknown entities are left untouched. */
  function htmlUnescape(str) {
    const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
    const pass = (s) =>
      s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g, (m, e) => {
        if (e[0] === '#') {
          const cp =
            e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
          return Number.isFinite(cp) && cp > 0 ? String.fromCodePoint(cp) : m;
        }
        return Object.prototype.hasOwnProperty.call(named, e) ? named[e] : m;
      });
    return pass(pass(String(str || '')));
  }

  /** Decode a JS/JSON string literal value (handles \uXXXX, \", \\, \/ …). */
  function decodeJsString(raw) {
    if (raw == null) return '';
    const s = String(raw);
    // Double-quoted? JSON.parse handles all standard escapes for us.
    if (s.startsWith('"') && s.endsWith('"')) {
      try {
        return JSON.parse(s);
      } catch {
        /* fall through to manual */
      }
    }
    // Single-quoted or bare — strip quotes and unescape the common cases.
    return s
      .replace(/^['"]|['"]$/g, '')
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\(["'/\\])/g, '$1')
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t');
  }

  // -------------------------------------------------------------------------
  //  Section 3 — album manifest parsing
  // -------------------------------------------------------------------------
  //  A "manifest item" is { name (filename), slug, size, timestamp }. NOTE: the
  //  numeric file id is NO LONGER in window.albumFiles — it's read per file from
  //  the file page in resolveItemId(). The album loop keys resume/progress on the
  //  stable `slug` instead.

  /**
   * Pull the file objects out of a `window.albumFiles = [ ... ]` blob of HTML/JS
   * text. Tolerant of unquoted keys and trailing commas, so it works whether the
   * array is strict JSON or loose JS. Returns [] if nothing parseable is found.
   * @param {string} html  full page HTML (current document or a cross-origin fetch)
   */
  function parseAlbumFiles(html) {
    if (!html) return [];

    // Isolate the array literal. `window.albumFiles` is the last statement in its
    // <script>, so we slice from the opening "[" to the closing "</script>".
    const start = html.indexOf('window.albumFiles');
    if (start === -1) return [];
    const open = html.indexOf('[', start);
    const close = html.indexOf('</script>', open);
    if (open === -1) return [];
    let arrText = html.slice(open, close === -1 ? undefined : close);
    const lastBracket = arrText.lastIndexOf(']'); // drop any trailing `;` etc.
    if (lastBracket !== -1) arrText = arrText.slice(0, lastBracket + 1);

    // Normalise one already-decoded record into our manifest shape (or null).
    // The stable identity is now `slug` (the numeric id is gone from albumFiles),
    // so a record without a slug is unusable for resolution and is dropped.
    const toItem = (o) => {
      const slug = String(o.slug || '');
      const name = decodeFileName(o.name); // "+"/"%20" → spaces, etc.
      if (!slug || !name) return null;
      return {
        slug,
        name,
        size: Number(o.size) || 0,
        timestamp: Number(o.timestamp) || 0,
      };
    };

    // Tier 1 — try to JSON-parse the whole array after quoting bare keys and
    // dropping trailing commas. Also copes with nested objects, should Bunkr add
    // any. The displayed filename is `original`; `name` is the storage UUID.
    try {
      const normalized = arrText
        .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')
        .replace(/,(\s*[}\]])/g, '$1');
      const parsed = JSON.parse(normalized);
      if (Array.isArray(parsed)) {
        const items = parsed
          .map((o) =>
            toItem({
              name: o.original ?? o.name,
              slug: o.slug,
              size: o.size,
              timestamp: o.timestamp,
            }),
          )
          .filter(Boolean);
        if (items.length) return items;
      }
    } catch {
      /* fall through to the tolerant per-object scan below */
    }

    // Tier 2 — tolerant scan: each record is a flat `{ ... }` block (no nesting),
    // so we can match and field-extract one object at a time.
    const items = [];
    for (const block of arrText.match(/\{[^{}]*\}/g) || []) {
      const item = toItem({
        name: decodeJsString(readRaw(block, 'original')) || decodeJsString(readRaw(block, 'name')),
        slug: decodeJsString(readRaw(block, 'slug')),
        size: readField(block, 'size'),
        timestamp: readField(block, 'timestamp'),
      });
      if (item) items.push(item);
    }
    return items;
  }

  /** Return the raw (still-quoted) value text for a key inside one object block. */
  function readRaw(block, key) {
    const re = new RegExp(
      // optional quotes around the key, then "key" : value
      '["\']?' +
        key +
        '["\']?\\s*:\\s*("(?:\\\\.|[^"\\\\])*"|\'(?:\\\\.|[^\'\\\\])*\'|true|false|null|-?\\d+(?:\\.\\d+)?)',
    );
    const m = re.exec(block);
    return m ? m[1] : null;
  }

  /** Read a numeric/bare field (strips quotes), or null. */
  function readField(block, key) {
    const raw = readRaw(block, key);
    if (raw == null) return null;
    return raw.replace(/^['"]|['"]$/g, '');
  }

  /** Extract the album display name from a page's og:title meta tag. */
  function parseAlbumTitle(html) {
    const m = /property=["']og:title["']\s+content=["']([^"']*)["']/i.exec(html || '');
    return m ? htmlUnescape(m[1]).trim() : '';
  }

  /** Stable per-album key for resume storage — the `/a/<id>` path, lower-cased
   *  (mirror TLDs share the same id, so the path dedupes them across domains). */
  function albumKeyFrom(url) {
    try {
      return new URL(url, location.href).pathname.toLowerCase();
    } catch {
      return String(url || '');
    }
  }

  /** Add `?advanced=1` to an album URL. That view embeds the COMPLETE manifest;
   *  the default album page only renders a paginated subset. */
  function advancedUrl(url) {
    try {
      const u = new URL(url, location.href);
      u.searchParams.set('advanced', '1');
      return u.href;
    } catch {
      return url + (url.includes('?') ? '&' : '?') + 'advanced=1';
    }
  }

  /**
   * Resolve an album to `{ title, items }` from its advanced-view manifest.
   * This is the "trigger Advanced View" step — fetched in the background so the
   * user is never navigated away. Used for both the current Bunkr album and
   * balbums cards (cross-origin).
   * @param {string} albumUrl    the album's `/a/<id>` URL (any Bunkr domain)
   * @param {boolean} preferLive  if we're already on the advanced view and
   *   `window.albumFiles` is populated, use it instead of refetching.
   */
  async function fetchAlbum(albumUrl, preferLive) {
    const key = albumKeyFrom(albumUrl);
    // The album's ABSOLUTE base URL (origin + /a/<id>), carried alongside the
    // manifest so the bulk loop can resolve each file's `/f/<slug>` page against
    // the album's OWN Bunkr origin — not `location.href`. This matters on a
    // balbums.st listing page (the cross-origin card flow): there `location.href`
    // is balbums.st, which has no `/f/<slug>` page, so resolving against it would
    // fetch the wrong origin and every file would fail. See resolveItemId().
    const base = absoluteAlbumUrl(albumUrl);
    if (preferLive) {
      try {
        const live = unsafeWindow.albumFiles;
        if (Array.isArray(live) && live.length) {
          const items = live
            .map((f) => ({
              name: decodeFileName(decodeJsString(f.original || f.name || '')),
              slug: String(f.slug || ''),
              size: Number(f.size) || 0,
              timestamp: 0,
            }))
            .filter((f) => f.slug && f.name);
          if (items.length) {
            const metaEl = document.querySelector('meta[property="og:title"]');
            return { title: (metaEl?.content || '').trim() || document.title, items, key, base };
          }
        }
      } catch {
        /* sandboxed from page globals — fall through to fetching */
      }
    }
    // Fetch the advanced view (same-origin on Bunkr; cross-origin from balbums —
    // both pass Cloudflare with the browser's real User-Agent via GM_xhr).
    const res = await gmRequest({ method: 'GET', url: advancedUrl(albumUrl) });
    if (res.status < 200 || res.status >= 300) throw new Error(`album HTTP ${res.status}`);
    const html = res.responseText;
    return {
      title: parseAlbumTitle(html) || document.title,
      items: parseAlbumFiles(html),
      key,
      base,
    };
  }

  /** Resolve an album URL to its ABSOLUTE form against the current page, so the
   *  album's real Bunkr origin survives into runJob (where it's needed to fetch
   *  each file's `/f/<slug>` page on the right host). Returns '' if unparseable,
   *  in which case the bulk loop falls back to location.href (correct on Bunkr). */
  function absoluteAlbumUrl(url) {
    try {
      return new URL(url, location.href).href;
    } catch {
      return '';
    }
  }

  // -------------------------------------------------------------------------
  //  Section 4 — networking (GM_xmlhttpRequest wrappers)
  // -------------------------------------------------------------------------

  // Currently-running request, so Cancel can abort an in-flight download.
  let activeRequest = null;

  /** Promise wrapper around GM_xmlhttpRequest. Resolves for ANY HTTP status
   *  (caller inspects .status); rejects only on network/abort/timeout. */
  function gmRequest(opts) {
    // API calls (resolve / sign / page fetch) get a 45s ceiling so a hung
    // connection surfaces as a "timeout" error instead of an indefinite
    // "0 B" stall; large blob downloads (files) are left untimed. An explicit
    // opts.timeout always wins.
    let timeout = opts.timeout;
    if (timeout == null) timeout = opts.responseType === 'blob' ? 0 : 45000;
    return new Promise((resolve, reject) => {
      const handle = GM_xmlhttpRequest({
        method: opts.method || 'GET',
        url: opts.url,
        headers: opts.headers || {},
        data: opts.data,
        responseType: opts.responseType, // 'blob' for files; undefined (text) for the API
        timeout,
        onprogress: opts.onprogress,
        onload: (res) => {
          activeRequest = null;
          resolve(res);
        },
        onerror: () => {
          activeRequest = null;
          reject(new Error('network error'));
        },
        ontimeout: () => {
          activeRequest = null;
          reject(new Error('timeout'));
        },
        onabort: () => {
          activeRequest = null;
          reject(new Error('aborted'));
        },
      });
      activeRequest = handle;
    });
  }

  // Resolver hosts must be a `dl.bunkr.<tld>` subdomain. The host comes from a
  // download-button href parsed out of page HTML, so we allowlist it before
  // POSTing — defence in depth so a tampered page can't redirect the resolve
  // POST (which echoes the file id) to an arbitrary origin.
  const RESOLVER_HOST_RE = /^dl\.bunkrr?\.[a-z]{2,}$/i;

  /** True if `host` is an acceptable dl.bunkr.<tld> resolver host. */
  function isResolverHost(host) {
    return RESOLVER_HOST_RE.test(String(host || ''));
  }

  /**
   * Resolve a file to a SIGNED, ready-to-download CDN URL. This is the current
   * (2026-06-16, re-verified live) two-call flow; the old apidl.bunkr.ru + XOR +
   * get.bunkrr.su-Referer path is DEAD (apidl still answers but returns the old
   * {encrypted,url} form — do not use it).
   *
   *   1. POST {"id":"<id>"} (id MUST be a string — a numeric id returns HTTP 400)
   *      with Content-Type: application/json to https://<resolverHost>/api/_001_v2.
   *      The response is UNENCRYPTED:
   *        { mediafiles:"https://<sub>.cdn.cr", original:"<name>",
   *          path:"/storage/media/<uuid>.<ext>" }
   *      rawUrl = mediafiles + path.
   *   2. Sign rawUrl's pathname via signUrl() → append n/token/ex query params.
   *
   * The signed URL self-authorises (no Referer needed); the unsigned url is 403.
   * @param {string|number} id           the file's numeric id (from the file page)
   * @param {string} resolverHost        the dl.bunkr.<tld> host (from the file page)
   * @returns {Promise<{url:string, name:string}>}  signed media URL + original name
   */
  async function resolveFileUrl(id, resolverHost) {
    if (!isResolverHost(resolverHost)) {
      throw new Error(`untrusted resolver host "${resolverHost}"`);
    }
    const res = await gmRequest({
      method: 'POST',
      url: `https://${resolverHost}${RESOLVER_API_PATH}`,
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({ id: String(id) }),
    });
    if (res.status === 429 || res.status === 503) {
      const e = new Error('rate-limited');
      e.rateLimited = true;
      e.retryAfter = retryAfterMs(res);
      throw e;
    }
    if (res.status < 200 || res.status >= 300) throw new Error(`API HTTP ${res.status}`);

    let data;
    try {
      data = JSON.parse(res.responseText);
    } catch {
      throw new Error('API returned non-JSON');
    }
    if (!data || !data.mediafiles || !data.path) {
      // Guard against the legacy {encrypted,url} shape (a stale apidl host) so we
      // fail loudly rather than trying to download an encrypted blob.
      throw new Error('API returned no mediafiles/path (host may be the legacy resolver)');
    }

    // rawUrl = mediafiles + path; the media host must be a *.cdn.cr subdomain
    // (the only origin @connect'd for media). Validate before signing/downloading.
    const rawUrl = String(data.mediafiles).replace(/\/+$/, '') + data.path;
    let parsed;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new Error('API returned an unparseable media URL');
    }
    if (!/(?:^|\.)cdn\.cr$/i.test(parsed.hostname)) {
      throw new Error(`unexpected media host "${parsed.hostname}"`);
    }

    const url = await signUrl(rawUrl, data.original);
    return { url, name: data.original ? decodeFileName(data.original) : '' };
  }

  /**
   * Sign a raw CDN URL so the media GET is authorised. GETs
   * https://glb-apisign.cdn.cr/sign?path=<encodeURIComponent(pathname)> (no
   * cookies) for a short-lived { token, ex }, then returns rawUrl with the
   * n/token/ex query params appended. Without these the CDN returns 403.
   * @param {string} rawUrl          mediafiles + path (a *.cdn.cr URL)
   * @param {string} [originalName]  the file's display name → the `n` param
   * @returns {Promise<string>}      the signed, downloadable URL
   */
  async function signUrl(rawUrl, originalName) {
    const u = new URL(rawUrl);
    const res = await gmRequest({
      method: 'GET',
      url: `${SIGN_ENDPOINT}?path=${encodeURIComponent(u.pathname)}`,
    });
    if (res.status === 429 || res.status === 503) {
      const e = new Error('rate-limited');
      e.rateLimited = true;
      e.retryAfter = retryAfterMs(res);
      throw e;
    }
    if (res.status < 200 || res.status >= 300) throw new Error(`sign HTTP ${res.status}`);

    let sig;
    try {
      sig = JSON.parse(res.responseText);
    } catch {
      throw new Error('sign API returned non-JSON');
    }
    if (!sig || !sig.token || sig.ex == null) throw new Error('sign API returned no token');

    // Build via URLSearchParams so token/ex/name are correctly percent-encoded.
    u.searchParams.set('n', originalName || u.pathname.split('/').pop() || '');
    u.searchParams.set('token', String(sig.token));
    u.searchParams.set('ex', String(sig.ex));
    return u.href;
  }

  /** Parse a Retry-After header (seconds) into ms, if present. */
  function retryAfterMs(res) {
    const h = /retry-after:\s*(\d+)/i.exec(res.responseHeaders || '');
    return h ? parseInt(h[1], 10) * 1000 : 0;
  }

  /**
   * Download a resolved (signed) URL to a Blob, reporting progress. Throws with
   * `.rateLimited` set on 429/503 so the caller can back off and retry. No
   * Referer is sent — the token/ex signature in the URL authorises the GET.
   */
  async function downloadBlob(url, onProgress) {
    const res = await gmRequest({
      method: 'GET',
      url,
      responseType: 'blob',
      onprogress: (e) => {
        if (onProgress) onProgress(e.loaded, e.lengthComputable ? e.total : 0);
      },
    });
    if (res.status === 429 || res.status === 503) {
      const e = new Error('rate-limited');
      e.rateLimited = true;
      e.retryAfter = retryAfterMs(res);
      throw e;
    }
    if (res.status < 200 || res.status >= 300) throw new Error(`download HTTP ${res.status}`);
    const blob = res.response;
    if (!(blob instanceof Blob) || blob.size === 0) throw new Error('empty download');
    return blob;
  }

  // -------------------------------------------------------------------------
  //  Section 5 — the download job (rate limiting, backoff, ZIP bin-packing)
  // -------------------------------------------------------------------------

  let jobRunning = false; // only one job at a time
  let cancelRequested = false;

  // ----- resume state (persisted per album so an interrupted job continues) ---
  const RESUME_PREFIX = 'resume:';

  /** Load saved progress for an album key → { done:Set<id>, part:number }. */
  function loadResume(key) {
    if (!settings.resume || !key) return { done: new Set(), part: 1 };
    try {
      const raw = GM_getValue(RESUME_PREFIX + key, null);
      if (raw && Array.isArray(raw.done))
        return { done: new Set(raw.done), part: Number(raw.part) || 1 };
    } catch {
      /* ignore */
    }
    return { done: new Set(), part: 1 };
  }

  /** Persist progress for an album key (only files whose ZIP was actually saved). */
  function saveResume(key, state) {
    if (!settings.resume || !key) return;
    try {
      GM_setValue(RESUME_PREFIX + key, { done: [...state.done], part: state.part });
    } catch {
      /* ignore */
    }
  }

  /** Forget saved progress for one album (called after a clean full run). */
  function clearResume(key) {
    if (!key) return;
    try {
      GM_deleteValue(RESUME_PREFIX + key);
    } catch {
      /* ignore */
    }
  }

  /** Delete every saved resume entry (menu command). Returns the count removed. */
  function clearAllResume() {
    let n = 0;
    try {
      for (const k of GM_listValues()) {
        if (k.startsWith(RESUME_PREFIX)) {
          GM_deleteValue(k);
          n++;
        }
      }
    } catch {
      /* ignore */
    }
    return n;
  }

  /**
   * Run a full bulk download.
   * @param {{title:string, items:Array, key?:string, base?:string}} album  from
   *   fetchAlbum(). `base` is the album's ABSOLUTE URL — its Bunkr origin is what
   *   each file's `/f/<slug>` page is fetched against (critical for the
   *   cross-origin balbums flow, where location.href is balbums.st).
   * @param {string} chosen  one of CATEGORIES[].key
   */
  async function runJob(album, chosen) {
    if (jobRunning) {
      notify('BunkrDL', 'A download is already running — let it finish or cancel it first.');
      return;
    }

    // Largest-first ordering improves ZIP bin-packing (first-fit-decreasing) and
    // satisfies the "sort by size" planning step without touching the DOM.
    const allFiles = album.items
      .filter((f) => fileMatchesCategory(f.name, chosen))
      .sort((a, b) => b.size - a.size);

    if (!allFiles.length) {
      notify('BunkrDL', `No ${chosen === 'all' ? '' : chosen + ' '}files found in this album.`);
      return;
    }

    // Resume: skip files already completed in a previous run of this album. The
    // dedup key is the file's stable `slug` (the numeric id is no longer in the
    // manifest, and slugs are stable across the mirror TLDs).
    const albumKey = album.key || '';
    // The album's absolute base URL — each file's `/f/<slug>` page is resolved
    // against THIS (the album's Bunkr origin), not location.href. On a balbums.st
    // listing page location.href is balbums.st, which has no /f/<slug> page, so
    // resolving there would fetch the wrong origin and fail every file. Falls back
    // to location.href only when base is missing (which is the correct origin on a
    // same-origin Bunkr album page anyway). See fetchFile() / resolveItemId().
    const albumBase = album.base || location.href;
    const resume = loadResume(albumKey);
    const files = allFiles.filter((f) => !resume.done.has(f.slug));
    const skipped = allFiles.length - files.length;

    if (!files.length) {
      notify(
        'BunkrDL',
        `All ${allFiles.length} file(s) already downloaded for this album. ` +
          `Use the menu's "Clear resume data" to start over.`,
      );
      return;
    }

    const maxZipBytes = Math.max(1, settings.maxZipMB) * MIB;
    const totalBytes = files.reduce((s, f) => s + f.size, 0);

    // Snapshot ZIP-ness for the LIFE of this job. The `zip` handle (below) is
    // created once, here; but if we read settings.zip *live* in packOne and the
    // user toggled "ZIP bundling" on from the menu mid-download, packOne would
    // take the ZIP branch with a still-null `zip` and crash every file with
    // "Cannot read properties of null (reading 'file')". Snapshotting keeps the
    // running job consistent — the toggle simply applies to the *next* job.
    const usingZip = settings.zip;

    // Pre-flight confirmation so a huge album never starts by accident.
    if (settings.confirm) {
      const plan = usingZip
        ? `into ~${Math.max(1, Math.ceil(totalBytes / maxZipBytes))} ZIP(s) of up to ` +
          `${settings.maxZipMB} MiB named "${sanitizeFilename(album.title)}_N.zip"`
        : `as ${files.length} individual file(s)`;
      const ok = window.confirm(
        `BunkrDL — ${album.title || 'Bunkr album'}\n\n` +
          `Download ${files.length} file(s) (~${formatBytes(totalBytes)}) ${plan}.` +
          (skipped ? `\n(${skipped} already-downloaded file(s) will be skipped.)` : '') +
          `\n${settings.concurrency > 1 ? settings.concurrency + ' parallel downloads' : 'One download at a time'}` +
          `, rate-limited.\n\nContinue?`,
      );
      if (!ok) return;
    }

    jobRunning = true;
    cancelRequested = false;
    // try/finally guarantees jobRunning is cleared even if something throws.
    try {
      const albumName = sanitizeFilename(album.title);

      const ui = createProgressUI();
      ui.setTitle(
        `${album.title || 'Album'} — ${files.length} file(s), ~${formatBytes(totalBytes)}`,
      );
      // --- Individual-save queue (no-ZIP "Download All") --------------------
      // In no-ZIP mode the fetch workers don't save inline; they push each
      // finished blob here and immediately fetch the next file. A single
      // background drainer (drainSaves) saves one file at a time, so a slow save
      // dialog — or GM_download waiting on the manager — never stalls the queue.
      // `saveQBytes` bounds how many un-saved blobs we hold in memory (reusing
      // the max-ZIP-size knob); a fetch worker parks on `saveBackpressure` when
      // that cap is hit, and the drainer parks on `saveIdle` when the queue is
      // momentarily empty. `wakeAll` resolves everything parked on a list.
      const saveQueue = []; // {blob, name, slug, size} awaiting save
      let saveQBytes = 0; // bytes of un-saved blobs currently in memory
      let enqueueDone = false; // set once every file has been fetched/enqueued
      const saveIdle = []; // drainer parked here while the queue is empty
      const saveBackpressure = []; // fetch workers parked here while over the cap
      const wakeAll = (list) => {
        const waiters = list.splice(0);
        for (const w of waiters) w();
      };

      ui.onCancel(() => {
        cancelRequested = true;
        ui.log('Cancelling after in-flight downloads…');
        if (activeRequest && activeRequest.abort) activeRequest.abort();
        // Release anything parked so the job can wind down cleanly.
        wakeAll(saveIdle);
        wakeAll(saveBackpressure);
      });

      // --- ZIP packer state (mutated only inside the serialized packChain) ----
      let zip = usingZip ? new JSZip() : null;
      let zipBytes = 0;
      let zipCount = 0;
      let zipPart = resume.part || 1;
      let usedNames = new Set();
      let pendingSlugs = []; // file slugs in the current, not-yet-saved ZIP

      let done = 0;
      let bytesDone = 0;
      let failures = 0;
      let packChain = Promise.resolve();

      /** Record slugs as complete + persist — only once their ZIP is actually saved. */
      function commit(slugs) {
        if (!slugs.length || !settings.resume) return;
        for (const slug of slugs) resume.done.add(slug);
        resume.part = zipPart;
        saveResume(albumKey, resume);
      }

      /** Finalise the current ZIP and hand it to the browser. */
      async function flushZip() {
        if (!zip || zipCount === 0) return;
        const name = `${albumName}_${zipPart}.zip`;
        ui.log(`Zipping ${name} (${formatBytes(zipBytes)})…`);
        ui.setZipping(`Building ${name}`, 0);
        let blob;
        try {
          blob = await zip.generateAsync(
            { type: 'blob', compression: settings.compression, streamFiles: true },
            (meta) => ui.setZipping(`Building ${name}`, meta.percent),
          );
        } catch (err) {
          // A ZIP that fails to build (most likely the tab hitting a memory limit
          // on a very large archive) must surface on the panel itself, not vanish
          // into the scrolling log — otherwise it looks like a frozen "Building…".
          console.error('[BunkrDL] ZIP build failed:', err);
          ui.zipFailed(name, (err && err.message) || String(err));
          throw err; // handled by the caller (packChain .catch / final-flush try)
        }
        ui.setZipping(`Saving ${name}`, 100);
        await saveBlob(blob, name);
        ui.log(`Saved ${name}`);
        const saved = pendingSlugs;
        zip = new JSZip();
        zipBytes = 0;
        zipCount = 0;
        zipPart++;
        usedNames = new Set();
        pendingSlugs = [];
        commit(saved); // persist AFTER the ZIP is saved and the part advanced
      }

      /** Ensure a name is unique within the current ZIP (foo.jpg → foo (1).jpg). */
      function uniqueName(name) {
        let candidate = name;
        let n = 1;
        while (usedNames.has(candidate)) {
          const dot = name.lastIndexOf('.');
          candidate = dot > 0 ? `${name.slice(0, dot)} (${n})${name.slice(dot)}` : `${name} (${n})`;
          n++;
        }
        usedNames.add(candidate);
        return candidate;
      }

      /** Pack (or, in individual mode, enqueue for saving) one downloaded file.
       *  Serialized via packChain so ZIP state stays consistent. In no-ZIP mode
       *  it only enqueues — drainSaves() does the actual saving — so a slow save
       *  never blocks this worker from fetching the next file. */
      async function packOne(file, blob) {
        const size = blob.size;
        bytesDone += size;

        if (!usingZip) {
          // Hand off to the background drainer, then return so this worker
          // fetches the next file straight away. `done` and the resume commit
          // happen in drainSaves(), once the file is actually saved.
          saveQueue.push({
            blob,
            name: uniqueName(sanitizeFilename(file.name)),
            slug: file.slug,
            size,
          });
          saveQBytes += size;
          wakeAll(saveIdle); // nudge the drainer in case it was waiting for work
          // Backpressure: if too many un-saved blobs are buffered, wait for the
          // drainer to catch up before fetching more (bounds memory use).
          while (saveQBytes > maxZipBytes && !cancelRequested) {
            await new Promise((resolve) => saveBackpressure.push(resolve));
          }
          return;
        }

        // Belt-and-braces: a ZIP-mode job must always have a live JSZip here.
        // (The usingZip snapshot already prevents the toggle-mid-job crash; this
        // also covers any future path that could leave `zip` null.)
        if (!zip) zip = new JSZip();

        // Flush first if this file would overflow the current ZIP's cap.
        if (zipCount > 0 && zipBytes + size > maxZipBytes) await flushZip();

        // A single file larger than the whole cap needs a decision.
        if (size > maxZipBytes) {
          const decision = await decideOversize(file.name, size, maxZipBytes);
          if (decision === 'skip') {
            ui.log(`Skipped oversize "${file.name}" (${formatBytes(size)})`);
            done++;
            ui.setOverall(done, files.length, bytesDone, totalBytes);
            return;
          }
          zip.file(uniqueName(sanitizeFilename(file.name)), blob, {
            compression: settings.compression,
          });
          zipBytes += size;
          zipCount++;
          pendingSlugs.push(file.slug);
          ui.log(`Oversize "${file.name}" placed in its own ZIP (${formatBytes(size)})`);
          await flushZip();
          done++;
          ui.setOverall(done, files.length, bytesDone, totalBytes);
          return;
        }

        zip.file(uniqueName(sanitizeFilename(file.name)), blob, {
          compression: settings.compression,
        });
        zipBytes += size;
        zipCount++;
        pendingSlugs.push(file.slug);
        done++;
        ui.setOverall(done, files.length, bytesDone, totalBytes);
      }

      /** Background save loop for no-ZIP mode: save queued blobs one at a time,
       *  independent of the fetch workers, so a slow save can't stall the queue.
       *  Returns once every file has been enqueued (enqueueDone) and drained. */
      async function drainSaves() {
        for (;;) {
          if (cancelRequested) return;
          if (!saveQueue.length) {
            if (enqueueDone) return; // nothing left and no more coming
            await new Promise((resolve) => saveIdle.push(resolve)); // await work
            continue;
          }
          const item = saveQueue.shift();
          try {
            await saveBlob(item.blob, item.name);
            commit([item.slug]); // persist resume only after the file is saved
          } catch (err) {
            failures++;
            ui.log(`✗ Save error "${item.name}": ${err.message}`);
          }
          saveQBytes -= item.size;
          done++;
          ui.setOverall(done, files.length, bytesDone, totalBytes);
          wakeAll(saveBackpressure); // a slot freed up — let fetchers resume
        }
      }

      /** Download one file with retries, backoff and size verification. Each
       *  attempt does the full current flow: read the file's numeric id +
       *  resolver host from its `/f/<slug>` page (resolveItemId), resolve the
       *  signed CDN URL (resolveFileUrl), then download it. The file-page fetch
       *  runs here, inside the worker pool, so it's subject to the same
       *  concurrency limit. */
      async function fetchFile(file) {
        let backoff = 0;
        let lastHost = '';
        for (let attempt = 1; attempt <= settings.maxRetries && !cancelRequested; attempt++) {
          try {
            await politePause();
            // Step 2: id + resolver host from the file page (keyed on the slug).
            // Resolve `/f/<slug>` against the ALBUM's origin (albumBase), not
            // location.href — otherwise the balbums.st card flow fetches
            // balbums.st/f/<slug> (wrong origin) and every file fails.
            const { id, host } = await resolveItemId(
              `/f/${encodeURIComponent(file.slug)}`,
              albumBase,
            );
            // Steps 3–4: resolve + sign → a ready-to-download CDN URL.
            const { url } = await resolveFileUrl(id, host);
            try {
              lastHost = new URL(url).hostname;
            } catch {
              lastHost = '';
            }
            const blob = await downloadBlob(url, (loaded, total) =>
              ui.setCurrent(file.name, loaded, total || file.size),
            );
            // Reject truncated downloads — the manifest knows the real size.
            if (settings.verifySize && file.size && blob.size < file.size) {
              throw new Error(`short read ${formatBytes(blob.size)}/${formatBytes(file.size)}`);
            }
            return blob;
          } catch (err) {
            if (cancelRequested) return null;
            if (err.rateLimited) {
              backoff = Math.min(
                settings.backoffMaxMs,
                err.retryAfter || (backoff ? backoff * 2 : settings.backoffBaseMs),
              );
              ui.log(
                `Rate limited on "${file.name}" — waiting ${Math.round(backoff / 1000)}s ` +
                  `(try ${attempt}/${settings.maxRetries})`,
              );
              await sleep(backoff);
            } else if (attempt < settings.maxRetries) {
              ui.log(`Retry ${attempt}/${settings.maxRetries} for "${file.name}": ${err.message}`);
              await sleep(settings.backoffBaseMs);
            } else {
              ui.log(
                `✗ Failed "${file.name}": ${err.message}` +
                  (lastHost ? ` — media host ${lastHost}; if blocked, add it to @connect` : ''),
              );
            }
          }
        }
        return null;
      }

      // --- worker pool: download up to `concurrency` files at once, but pack
      //     them one at a time (serialized) so ZIP state stays consistent. ------
      let nextIndex = 0;
      async function worker() {
        while (!cancelRequested) {
          const i = nextIndex++;
          if (i >= files.length) break;
          const file = files[i];
          ui.setCurrent(file.name, 0, file.size);
          const blob = await fetchFile(file);
          if (cancelRequested) break;
          if (!blob) {
            failures++;
            done++;
            ui.setOverall(done, files.length, bytesDone, totalBytes);
            continue;
          }
          // Serialize packing and await it — backpressure bounds in-memory blobs.
          // The .catch is part of the chain so a single bad file can't leave
          // packChain rejected (which would skip every later file's packOne).
          packChain = packChain
            .then(() => packOne(file, blob))
            .catch((err) => {
              failures++;
              ui.log(`✗ Pack error "${file.name}": ${err.message}`);
            });
          await packChain;
        }
      }

      // In no-ZIP mode, run the background save drainer alongside the fetch
      // workers; in ZIP mode saving happens inside the (serialized) packChain.
      const drainer = usingZip ? null : drainSaves();

      const workers = Math.max(1, Math.min(8, Number(settings.concurrency) || 1));
      await Promise.all(Array.from({ length: workers }, () => worker()));
      await packChain.catch(() => {});

      // Every file is fetched and enqueued — let the drainer save the remainder
      // (it has kept saving in the background throughout) before we summarise.
      enqueueDone = true;
      wakeAll(saveIdle);
      if (drainer) await drainer.catch(() => {});

      // Flush whatever remains in the final ZIP.
      if (!cancelRequested) {
        try {
          await flushZip();
        } catch (err) {
          ui.log(`✗ Failed to build final ZIP: ${err.message}`);
          failures++;
        }
      }

      // Resume bookkeeping: clear on a clean full run, keep progress otherwise.
      if (!cancelRequested && failures === 0) clearResume(albumKey);
      else saveResume(albumKey, resume);

      const summary = cancelRequested
        ? `Cancelled — ${done}/${files.length} processed${failures ? `, ${failures} failed` : ''}.`
        : `Done — ${done}/${files.length} files${failures ? `, ${failures} failed (re-run to retry)` : ''}.`;
      ui.finish(summary);
      notify('BunkrDL', summary);
    } finally {
      jobRunning = false;
    }
  }

  /** Ask (or auto-decide) what to do with a file bigger than the ZIP cap. */
  async function decideOversize(name, size, cap) {
    if (settings.oversize === 'extend') return 'extend';
    if (settings.oversize === 'skip') return 'skip';
    // 'ask' — a blocking confirm is acceptable for an explicit user action.
    const ok = window.confirm(
      `"${name}" is ${formatBytes(size)}, larger than the ${formatBytes(cap)} ZIP cap.\n\n` +
        `OK = put it in its own (larger) ZIP.\nCancel = skip this file.`,
    );
    return ok ? 'extend' : 'skip';
  }

  /**
   * Save a Blob to disk. Default path is a temporary <a download> click; with the
   * "useGmDownload" setting on, GM_download lets the userscript manager handle the
   * save (no per-file dialog) — better when an album produces many ZIPs. Falls
   * back to the <a> click if GM_download errors or is unavailable.
   */
  function saveBlob(blob, filename) {
    if (settings.useGmDownload && typeof GM_download === 'function') {
      return new Promise((resolve) => {
        const url = URL.createObjectURL(blob);
        const fallback = () => {
          URL.revokeObjectURL(url);
          triggerDownload(blob, filename);
          resolve();
        };
        try {
          GM_download({
            url,
            name: filename,
            saveAs: false,
            onload: () => {
              URL.revokeObjectURL(url);
              resolve();
            },
            onerror: fallback,
            ontimeout: fallback,
          });
        } catch {
          fallback();
        }
      });
    }
    triggerDownload(blob, filename);
    return Promise.resolve();
  }

  /** Hand a Blob to the browser as a normal download via a temporary <a>. */
  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    // Give the browser a moment to start the download before revoking.
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 60000);
  }

  /** Best-effort desktop notification (falls back silently if unavailable). */
  function notify(title, text) {
    try {
      GM_notification({ title, text, silent: true, timeout: 6000 });
    } catch {
      /* ignore */
    }
  }

  // -------------------------------------------------------------------------
  //  Section 6 — progress UI panel
  // -------------------------------------------------------------------------

  function createProgressUI() {
    // Remove a stale panel if one is somehow still around.
    document.getElementById('bdl-panel')?.remove();

    const panel = h('div', { id: 'bdl-panel', class: 'bdl-panel' });
    const title = h('div', { class: 'bdl-title' }, 'BunkrDL');
    const overall = h('div', { class: 'bdl-line' }, 'Preparing…');
    const obar = h('div', { class: 'bdl-bar' }, h('i'));
    const current = h('div', { class: 'bdl-line bdl-muted' }, '');
    const cbar = h('div', { class: 'bdl-bar' }, h('i'));
    const log = h('div', { class: 'bdl-log' });
    const cancelBtn = h('button', { class: 'bdl-btn' }, 'Cancel');
    const closeBtn = h('button', { class: 'bdl-btn bdl-ghost' }, 'Close');
    closeBtn.style.display = 'none';
    const actions = h('div', { class: 'bdl-actions' }, cancelBtn, closeBtn);

    panel.append(title, overall, obar, current, cbar, log, actions);
    document.body.appendChild(panel);

    const setBar = (bar, pct) => {
      bar.firstChild.style.width = `${Math.max(0, Math.min(100, pct))}%`;
    };

    let cancelCb = null;
    cancelBtn.addEventListener('click', () => {
      cancelBtn.disabled = true;
      if (cancelCb) cancelCb();
    });
    closeBtn.addEventListener('click', () => panel.remove());

    return {
      setTitle: (t) => (title.textContent = `BunkrDL — ${t}`),
      setOverall(done, total, bytesDone, bytesTotal) {
        overall.textContent = `Overall: ${done}/${total} files · ${formatBytes(bytesDone)}${
          bytesTotal ? ' / ~' + formatBytes(bytesTotal) : ''
        }`;
        setBar(obar, total ? (done / total) * 100 : 0);
      },
      setCurrent(name, loaded, total) {
        cbar.classList.remove('bdl-zipping', 'bdl-error');
        current.textContent = total
          ? `${name} — ${formatBytes(loaded)} / ${formatBytes(total)}`
          : `${name}`;
        setBar(cbar, total ? (loaded / total) * 100 : loaded);
      },
      /**
       * Drive the current-file bar for the ZIP step. JSZip's `percent` can be
       * coarse or stall during final blob assembly, so we show the determinate
       * percent when we have it AND mark the bar `.bdl-zipping`, which runs a
       * compositor-driven "sheen" that keeps moving even while the main thread is
       * busy packing — so an active zip looks different from a frozen or errored one.
       */
      setZipping(label, percent) {
        const known = Number.isFinite(percent) && percent >= 0;
        current.textContent = known ? `${label} — ${Math.round(percent)}%` : `${label}…`;
        cbar.classList.remove('bdl-error');
        cbar.classList.add('bdl-zipping');
        setBar(cbar, known ? percent : 8);
      },
      /** Show a ZIP build failure on the panel itself (red bar + reason). */
      zipFailed(label, msg) {
        current.textContent = `❌ ${label}: ${msg}`;
        cbar.classList.remove('bdl-zipping');
        cbar.classList.add('bdl-error');
        setBar(cbar, 100);
      },
      log(msg) {
        const line = h('div', {}, msg);
        log.appendChild(line);
        log.scrollTop = log.scrollHeight;
      },
      onCancel: (cb) => (cancelCb = cb),
      finish(msg) {
        cbar.classList.remove('bdl-zipping', 'bdl-error');
        overall.textContent = msg;
        current.textContent = '';
        setBar(obar, 100);
        setBar(cbar, 0);
        cancelBtn.style.display = 'none';
        closeBtn.style.display = '';
      },
    };
  }

  // -------------------------------------------------------------------------
  //  Section 7 — DOM helpers + injected styling
  // -------------------------------------------------------------------------

  /** Tiny hyperscript helper: h('div', {class:'x'}, child1, 'text', …). */
  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (k === 'class') el.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else el.setAttribute(k, v);
      }
    }
    for (const c of children) if (c != null) el.append(c.nodeType ? c : document.createTextNode(c));
    return el;
  }

  GM_addStyle(`
    .bdl-menu { position:absolute; z-index:2147483647; min-width:190px; background:#1e1c22;
      color:#e6e1e9; border:1px solid #3a3742; border-radius:10px; padding:6px;
      box-shadow:0 8px 28px rgba(0,0,0,.45); font:14px/1.4 system-ui,sans-serif; }
    .bdl-menu button { display:block; width:100%; text-align:left; background:none; border:0;
      color:inherit; padding:8px 10px; border-radius:7px; cursor:pointer; font:inherit; }
    .bdl-menu button:hover { background:#332f3a; }
    .bdl-dd { display:inline-flex; align-items:center; gap:6px; cursor:pointer; }
    .bdl-floating { position:fixed; bottom:16px; right:16px; z-index:2147483646;
      background:#6750a4; color:#fff; border:0; border-radius:10px; padding:10px 14px;
      font:14px system-ui,sans-serif; cursor:pointer; box-shadow:0 4px 14px rgba(0,0,0,.3); }
    .bdl-card-btn { display:inline-flex; align-items:center; gap:5px;
      background:#6750a4; color:#fff; border:0; border-radius:6px; padding:3px 8px;
      font:600 11px system-ui,sans-serif; line-height:1.3; cursor:pointer; white-space:nowrap; }
    .bdl-open-wrap { display:inline-flex; align-items:center; gap:8px; }
    .bdl-card-btn:hover, .bdl-floating:hover, .bdl-item-btn:hover { filter:brightness(1.08); }
    .bdl-item-btn { position:relative; z-index:20; display:block; width:calc(100% - 8px);
      margin:6px auto 2px; background:#6750a4; color:#fff; border:0; border-radius:7px;
      padding:5px 8px; font:12px system-ui,sans-serif; cursor:pointer; }
    .bdl-item-btn:disabled { opacity:.6; cursor:default; }
    .bdl-panel { position:fixed; bottom:16px; right:16px; z-index:2147483647; width:340px;
      max-width:92vw; background:#1e1c22; color:#e6e1e9; border:1px solid #3a3742;
      border-radius:14px; padding:14px; font:13px/1.5 system-ui,sans-serif;
      box-shadow:0 10px 30px rgba(0,0,0,.5); }
    .bdl-title { font-weight:600; margin-bottom:8px; font-size:14px; }
    .bdl-line { margin:4px 0; word-break:break-word; }
    .bdl-muted { color:#a8a4ad; }
    .bdl-bar { position:relative; height:6px; background:#332f3a; border-radius:99px; overflow:hidden; margin:3px 0 8px; }
    .bdl-bar i { display:block; height:100%; width:0; background:#6750a4; transition:width .15s; }
    /* Zipping: a light "sheen" sweeps the bar via a compositor transform, so it
       keeps moving even while JSZip packs on the main thread — a live zip looks
       different from a frozen one. The fill (i) still shows the % when known. */
    .bdl-bar.bdl-zipping::after { content:''; position:absolute; inset:0;
      background:linear-gradient(90deg, transparent, rgba(255,255,255,.28), transparent);
      transform:translateX(-100%); animation:bdl-sheen 1.15s linear infinite; }
    .bdl-bar.bdl-error i { background:#e0606a; }
    @keyframes bdl-sheen { to { transform:translateX(100%); } }
    @media (prefers-reduced-motion: reduce) { .bdl-bar.bdl-zipping::after { animation:none; } }
    .bdl-log { max-height:120px; overflow:auto; font-size:12px; color:#a8a4ad;
      background:#16151a; border-radius:8px; padding:6px 8px; margin:6px 0; }
    .bdl-actions { display:flex; gap:8px; justify-content:flex-end; margin-top:4px; }
    .bdl-btn { background:#6750a4; color:#fff; border:0; border-radius:8px; padding:6px 12px;
      cursor:pointer; font:13px system-ui,sans-serif; }
    .bdl-btn.bdl-ghost { background:#332f3a; }
    .bdl-btn:disabled { opacity:.5; cursor:default; }
  `);

  /**
   * Open a floating menu of the five download options anchored to an element.
   * @param {Element} anchor
   * @param {(categoryKey:string)=>void} onPick
   */
  function openMenu(anchor, onPick) {
    closeMenu();
    const menu = h('div', { class: 'bdl-menu', id: 'bdl-open-menu' });
    for (const cat of CATEGORIES) {
      const btn = h('button', {}, cat.label);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeMenu();
        onPick(cat.key);
      });
      menu.appendChild(btn);
    }
    document.body.appendChild(menu);

    const r = anchor.getBoundingClientRect();
    menu.style.top = `${window.scrollY + r.bottom + 4}px`;
    menu.style.left = `${window.scrollX + r.left}px`;

    // Close on next outside click / Escape.
    setTimeout(() => {
      document.addEventListener('click', closeMenu, { once: true });
      document.addEventListener('keydown', escClose);
    }, 0);
  }
  function closeMenu() {
    document.getElementById('bdl-open-menu')?.remove();
    document.removeEventListener('keydown', escClose);
  }
  function escClose(e) {
    if (e.key === 'Escape') closeMenu();
  }

  // -------------------------------------------------------------------------
  //  Section 8 — page wiring (Bunkr album & balbums listings)
  // -------------------------------------------------------------------------

  const BUNKR_HOST_RE = /(?:^|\.)bunkrr?\.[a-z]{2,}$/i;
  const BUNKR_ALBUM_RE = /\/a\/[^/?#]+/;

  /** Find the page's "Advanced filters" control. Bunkr gives it `id="advToggle"`
   *  / `class="adv-btn"` (verified live); fall back to a visible-text match so a
   *  theme/markup change still resolves something. */
  function findAdvancedFilters() {
    const byId = document.getElementById('advToggle') || document.querySelector('.adv-btn');
    if (byId) return byId;
    for (const el of document.querySelectorAll('button, a, summary, [role="button"]')) {
      const t = (el.textContent || '').trim().toLowerCase();
      if (t === 'advanced filters' || t.startsWith('advanced filters')) return el;
    }
    return null;
  }

  /** Add the "Bulk Download" dropdown to a Bunkr album page. */
  function setupBunkrAlbum() {
    if (document.getElementById('bdl-album-trigger')) return; // already added

    const onPick = async (key) => {
      // Fetch the album's advanced view (the complete manifest) in the
      // background, preferring a live window.albumFiles if we're already on it.
      notify('BunkrDL', 'Loading the album’s full file list…');
      try {
        const album = await fetchAlbum(location.href, true);
        if (!album.items.length) {
          notify('BunkrDL', 'Could not read this album’s file list. Try reloading the page.');
          return;
        }
        await runJob(album, key);
      } catch (err) {
        notify('BunkrDL', `Could not load album: ${err.message}`);
      }
    };

    const anchor = findAdvancedFilters();
    if (anchor) {
      // Mimic the site control's styling by copying its classes, then add ours.
      const trigger = h(
        'button',
        { id: 'bdl-album-trigger', class: `${anchor.className} bdl-dd` },
        '⬇ Bulk Download ▾',
      );
      trigger.style.marginLeft = '8px';
      trigger.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openMenu(trigger, onPick);
      });
      anchor.insertAdjacentElement('afterend', trigger);
    } else {
      // Fallback: a floating button so the feature still works on theme changes.
      const trigger = h(
        'button',
        { id: 'bdl-album-trigger', class: 'bdl-floating' },
        '⬇ Bunkr Bulk Download ▾',
      );
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        openMenu(trigger, onPick);
      });
      document.body.appendChild(trigger);
    }
  }

  /** Add a "Download" dropdown under each Bunkr-album card on a balbums page. */
  function setupBalbumsCards() {
    const links = document.querySelectorAll('a[href*="/a/"]');
    for (const link of links) {
      let url;
      try {
        url = new URL(link.href, location.href);
      } catch {
        continue;
      }
      if (!BUNKR_HOST_RE.test(url.hostname) || !BUNKR_ALBUM_RE.test(url.pathname)) continue;

      // Dedupe per-link (cards can share a container, so a per-card guard would
      // wrongly button only the first album in that container).
      if (link.dataset.bdlDone) continue;
      link.dataset.bdlDone = '1';

      // A balbums card IS the whole <a>, so a <button> inserted after it became
      // its own grid tile. Instead use a <span> (valid inside an <a>) placed in
      // the card footer next to the "→ Open" label, and stop the click from
      // triggering the card's own navigation.
      const btn = h(
        'span',
        { class: 'bdl-card-btn', role: 'button', tabindex: '0' },
        '⬇ Download ▾',
      );
      btn.dataset.bunkr = url.href;
      const onPick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        openMenu(btn, async (key) => {
          notify('BunkrDL', 'Fetching album file list…');
          try {
            const album = await fetchAlbum(url.href, false);
            if (!album.items.length) {
              notify('BunkrDL', 'No files found in that album (it may be private or moved).');
              return;
            }
            await runJob(album, key);
          } catch (err) {
            notify('BunkrDL', `Could not load album: ${err.message}`);
          }
        });
      };
      btn.addEventListener('click', onPick);
      btn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') onPick(e);
      });

      // Group the button beside the "Open" label (footer, right side). If the
      // card layout changes, fall back to appending inside the card (never a
      // separate grid tile).
      const openEl = [...link.querySelectorAll('span')].find((s) =>
        /(^|\s)Open$/.test((s.textContent || '').trim()),
      );
      if (openEl) {
        const wrap = h('span', { class: 'bdl-open-wrap' });
        openEl.replaceWith(wrap);
        wrap.append(btn, openEl);
      } else {
        link.appendChild(btn);
      }
    }
  }

  // Cached slug/name → display-name map for the current album, built from the
  // advanced view once and reused by every per-item button (purely cosmetic — it
  // supplies a nicer filename; the numeric id and resolver host always come from
  // the file page, since the manifest no longer carries an id).
  let albumNameMapPromise = null;
  function getAlbumNameMap() {
    if (!albumNameMapPromise) {
      albumNameMapPromise = fetchAlbum(location.href, true)
        .then((album) => {
          const map = new Map();
          for (const it of album.items) {
            if (it.slug) map.set(it.slug, it.name);
          }
          return map;
        })
        .catch((err) => {
          albumNameMapPromise = null; // let the next click retry the fetch
          throw err;
        });
    }
    return albumNameMapPromise;
  }

  /**
   * Extract the file's numeric id + resolver host from a file page's HTML. The
   * primary download button is `href="https://dl.bunkr.<tld>/file/<NUMERIC_ID>"`
   * — we take BOTH the host and the id from it (verified live 2026-06-16). The
   * resolver host must NOT be assumed to be dl.<current-domain> (e.g. dl.bunkr.fi
   * does not resolve). `data-file-id` is the id fallback when the button href
   * is missing; in that case the resolver host is unknown and we throw.
   * @param {string} html  file-page HTML
   * @returns {{id:string, host:string}}
   */
  function parseFilePage(html) {
    const btn = /href=["']https:\/\/(dl\.bunkrr?\.[a-z]{2,})\/file\/(\d+)["']/i.exec(html || '');
    if (btn) return { id: btn[2], host: btn[1].toLowerCase() };
    // Fallback: id from data-file-id, but the resolver host is only knowable from
    // the button href — without it we can't pick the right dl.bunkr.<tld>.
    const idm = /data-file-id=["'](\d+)["']/.exec(html || '');
    if (idm) {
      const e = new Error(
        'found a file id but no dl.bunkr download button (resolver host unknown)',
      );
      e.fileId = idm[1];
      throw e;
    }
    throw new Error('could not find the file id or resolver host on the file page');
  }

  /**
   * Resolve a grid item's `/f/<slug>` href to `{ id, host, name }`: fetch the
   * file page, read the numeric id + resolver host from its download button
   * (parseFilePage), and look up a nicer display name from the cached album
   * manifest (falling back to the slug).
   * @param {string} href   a `/f/<slug>` (or /v//i//d/) URL or path
   * @param {string} [base] absolute base URL to resolve a relative `href`
   *   against. The bulk loop passes the ALBUM's own Bunkr origin so a balbums.st
   *   listing page (where `location.href` is balbums.st, which has no `/f/<slug>`
   *   page) still fetches the file page on the correct Bunkr host. The
   *   same-origin per-item button omits it, so it defaults to `location.href`
   *   (already the right origin there). An absolute `href` ignores `base`.
   */
  async function resolveItemId(href, base) {
    const slug = decodeURIComponent((href.match(/\/[fvid]\/([^/?#]+)/) || [])[1] || '');
    const fileUrl = new URL(href, base || location.href);
    // Defence in depth: a `/f/<slug>` page is always on a Bunkr host; never fetch
    // it from an unexpected origin (the @connect allowlist also gates this).
    if (!/(?:^|\.)bunkrr?\.[a-z]{2,}$/i.test(fileUrl.hostname)) {
      throw new Error(`refusing to fetch a file page from untrusted host "${fileUrl.hostname}"`);
    }
    const res = await gmRequest({ method: 'GET', url: fileUrl.href });
    const { id, host } = parseFilePage(res.responseText);
    let name = decodeFileName(slug);
    try {
      const map = await getAlbumNameMap();
      name = map.get(slug) || name;
    } catch {
      /* manifest unavailable — keep the slug-derived name */
    }
    return { id, host, name };
  }

  /** Add a per-item "Download" button to each file card on a Bunkr album grid.
   *  Cards are `div.theItem` with an overlay `<a href="/f/…">`; the button sits
   *  above that overlay (z-index) and downloads just that one file. */
  function setupAlbumItemButtons() {
    const links = document.querySelectorAll(
      '.theItem a[href^="/f/"], .theItem a[href^="/v/"], .theItem a[href^="/i/"], .theItem a[href^="/d/"]',
    );
    for (const link of links) {
      const item = link.closest('.theItem');
      if (!item || item.querySelector('.bdl-item-btn')) continue;
      const href = link.getAttribute('href');
      if (!href) continue;
      const nameEl = item.querySelector('.theName');
      const displayName = nameEl ? nameEl.textContent.trim() : '';

      const btn = h('button', { class: 'bdl-item-btn', type: 'button' }, '⬇ Download');
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const original = btn.textContent;
        btn.disabled = true;
        btn.textContent = '⬇ …';
        try {
          // Read the file's numeric id + resolver host from its /f/<slug> page,
          // then resolve + download just that one file.
          const { id, host, name } = await resolveItemId(href);
          await downloadSingleFile(id, host, name || decodeFileName(displayName));
        } catch (err) {
          console.error('[BunkrDL] per-item download failed:', err);
          notify('BunkrDL', `Download failed: ${(err && err.message) || err}`);
        } finally {
          btn.disabled = false;
          btn.textContent = original;
        }
      });
      item.appendChild(btn);
    }
  }

  /** Read the file's numeric id + resolver host from a live file page's DOM. The
   *  download button is `<a href="https://dl.bunkr.<tld>/file/<id>">`; we take
   *  both from it (data-file-id alone can't tell us which dl.bunkr.<tld> to use).
   *  Returns `{ id, host }` or null if the button isn't on the page yet. */
  function readFilePageIdHost() {
    for (const a of document.querySelectorAll('a[href*="/file/"]')) {
      const m = /^https:\/\/(dl\.bunkrr?\.[a-z]{2,})\/file\/(\d+)/i.exec(
        a.getAttribute('href') || '',
      );
      if (m) return { id: m[2], host: m[1].toLowerCase() };
    }
    return null;
  }

  function setupBunkrFile() {
    if (document.getElementById('bdl-file-trigger')) return;
    // Need BOTH the numeric id and the resolver host (dl.bunkr.<tld>) from the
    // page's download button — bail until it has rendered.
    const idHost = readFilePageIdHost();
    if (!idHost) return; // page not ready / not a recognisable file page

    const run = async (btn) => {
      if (jobRunning) return notify('BunkrDL', 'A download is already running.');
      const orig = btn.textContent;
      btn.textContent = 'Downloading…';
      btn.style.pointerEvents = 'none';
      try {
        // Re-read at click time in case the button rendered/changed after setup.
        const cur = readFilePageIdHost() || idHost;
        await downloadSingleFile(cur.id, cur.host);
      } catch (err) {
        notify('BunkrDL', `Download failed: ${err.message}`);
      } finally {
        btn.textContent = orig;
        btn.style.pointerEvents = '';
      }
    };

    // Preferred: hijack Bunkr's own Download button so it downloads directly,
    // skipping the intermediate download portal (and its countdown). Clone it
    // to drop Bunkr's listeners, re-enable it, and wire our direct download.
    const native = document.querySelector('button.ic-download-01, a.ic-download-01');
    if (native) {
      const btn = native.cloneNode(true);
      btn.id = 'bdl-file-trigger';
      btn.removeAttribute('disabled');
      btn.removeAttribute('aria-disabled');
      btn.removeAttribute('href'); // if it was an <a> to the second page
      btn.classList.remove('opacity-50', 'cursor-not-allowed');
      btn.style.cursor = 'pointer';
      btn.title = 'Download directly (BunkrDL — skips the second page)';
      btn.textContent = 'Download';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        run(btn);
      });
      native.replaceWith(btn);
      return;
    }

    // Fallback: a floating button if Bunkr's own button isn't on the page.
    const trigger = h(
      'button',
      { id: 'bdl-file-trigger', class: 'bdl-floating' },
      '⬇ BunkrDL — Download',
    );
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      run(trigger);
    });
    document.body.appendChild(trigger);
  }

  /**
   * Resolve + download one Bunkr file and save it directly (no ZIP).
   * @param {string|number} fileId       the file's numeric id (from the file page)
   * @param {string} resolverHost        the dl.bunkr.<tld> host (from the file page)
   * @param {string} [preferredName]     filename to use (else the API's `original`)
   */
  async function downloadSingleFile(fileId, resolverHost, preferredName) {
    if (jobRunning) {
      notify('BunkrDL', 'A download is already running — let it finish first.');
      return;
    }
    jobRunning = true;
    // Create the progress UI INSIDE the try so the finally below always clears
    // jobRunning even if createProgressUI() throws (e.g. document.body missing) —
    // otherwise a throw here would leak jobRunning=true and soft-lock every future
    // download behind the "already running" guard. (Matches the album-job path.)
    let ui;
    try {
      ui = createProgressUI();
      ui.onCancel(() => {
        if (activeRequest && activeRequest.abort) activeRequest.abort();
      });
      ui.setOverall(0, 1, 0, 0);
      // resolveFileUrl returns the API's `original` filename too — prefer the
      // caller's name, then that, then the URL basename.
      const { url, name: resolvedName } = await resolveFileUrl(fileId, resolverHost);
      let name = preferredName || resolvedName || '';
      if (!name) {
        // Derive a readable filename from the resolved URL (decoding +/%20/%xx).
        try {
          name = decodeFileName(new URL(url).pathname.split('/').pop() || '');
        } catch {
          name = '';
        }
      }
      ui.setTitle(name || `file ${fileId}`);
      const blob = await downloadBlob(url, (loaded, total) =>
        ui.setCurrent(name || 'file', loaded, total),
      );
      await saveBlob(blob, sanitizeFilename(name || `bunkr-${fileId}`));
      ui.setOverall(1, 1, blob.size, blob.size);
      ui.finish(`Saved ${name || 'file'} (${formatBytes(blob.size)}).`);
      notify('BunkrDL', `Saved ${name || 'file'}.`);
    } catch (err) {
      const msg = (err && err.message) || String(err);
      if (msg === 'aborted') {
        // The user clicked Cancel — gmRequest's onabort rejects with 'aborted'.
        // That's a deliberate action, not a failure, so report it neutrally (and
        // don't console.error it). Mirrors the album job's "Cancelled" wording.
        console.info('[BunkrDL] single-file download cancelled by user.');
        try {
          ui.setTitle('Cancelled');
          ui.finish('Download cancelled.');
        } catch {
          /* UI already torn down / never created */
        }
        notify('BunkrDL', 'Download cancelled.');
      } else {
        // Surface the failure in the progress panel AND the console. Previously a
        // failed resolve/sign/download threw with no catch here, leaving the panel
        // frozen at "0/1 · 0 B" while only a fleeting GM notification carried the
        // reason — so a plain error looked like an indefinite hang.
        console.error('[BunkrDL] single-file download failed:', err);
        try {
          ui.setTitle(`❌ ${msg}`);
          ui.finish(`Download failed: ${msg}`);
        } catch {
          /* UI already torn down / never created — the notification carries it */
        }
        notify('BunkrDL', `Download failed: ${msg}`);
      }
    } finally {
      jobRunning = false;
    }
  }

  // -------------------------------------------------------------------------
  //  Section 9 — settings menu (userscript-manager command palette)
  // -------------------------------------------------------------------------

  // Userscript managers can't repaint a menu command's label in place, and the
  // menu is built once per page load — so a toggle/cycle setting changes value
  // silently and its "(current: …)" label looks stale until a reload (the prompt-
  // based items only *feel* different because the prompt is visible feedback). We
  // fix that by tracking every command's id and, after any change, tearing the
  // whole menu down (GM_unregisterMenuCommand) and rebuilding it — so reopening the
  // menu shows every label at its new value, no reload. On a manager without
  // GM_unregisterMenuCommand we skip the rebuild (labels then need a reload, as
  // before) rather than duplicating commands.
  let menuCommandIds = [];

  function refreshMenu() {
    // Rebuild only if we can first REMOVE the current commands — otherwise a
    // rebuild would stack duplicates. That needs GM_unregisterMenuCommand AND a
    // usable id for every command (a few off-spec managers return no id from
    // GM_registerMenuCommand; you can't remove what you can't reference). In either
    // gap, leave the menu as-is — labels then need a reload (the pre-1.5.4
    // behaviour) — rather than duplicate entries.
    if (typeof GM_unregisterMenuCommand !== 'function') return;
    if (menuCommandIds.some((id) => id == null)) return;
    for (const id of menuCommandIds) {
      try {
        GM_unregisterMenuCommand(id);
      } catch {
        /* already gone */
      }
    }
    menuCommandIds = [];
    registerMenu();
  }

  function registerMenu() {
    // Track each command's id so refreshMenu() can remove it before rebuilding.
    const add = (label, fn) => menuCommandIds.push(GM_registerMenuCommand(label, fn));
    // Notify, then rebuild the menu so every label reflects the new value on reopen.
    const changed = (msg) => {
      if (msg) notify('BunkrDL', msg);
      refreshMenu();
    };

    const num = (label, key, unit) => {
      add(`${label} (current: ${settings[key]}${unit || ''})`, () => {
        const v = window.prompt(`${label}:`, String(settings[key]));
        if (v == null) return;
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0)
          return notify('BunkrDL', 'Please enter a non-negative number.');
        saveSetting(key, n);
        changed(`${label} set to ${n}${unit || ''}.`);
      });
    };
    const toggle = (label, key, onText, offText) => {
      add(`${label} (current: ${settings[key] ? 'on' : 'off'})`, () => {
        saveSetting(key, !settings[key]);
        changed(`${label}: ${settings[key] ? onText || 'on' : offText || 'off'}.`);
      });
    };

    num('Max ZIP size', 'maxZipMB', ' MiB');
    num('Delay between files', 'delayMs', ' ms');
    num('Delay jitter', 'jitterMs', ' ms');
    num('Max retries per file', 'maxRetries', '');
    num('Parallel downloads', 'concurrency', '');

    add(`Oversize file handling (current: ${settings.oversize})`, () => {
      const v = window.prompt('Oversize handling — "ask", "extend", or "skip":', settings.oversize);
      if (v && ['ask', 'extend', 'skip'].includes(v.trim())) {
        saveSetting('oversize', v.trim());
        changed(`Oversize handling set to ${settings.oversize}.`);
      }
    });
    add(`ZIP bundling (current: ${settings.zip ? 'on' : 'off'})`, () => {
      saveSetting('zip', !settings.zip);
      changed(
        `ZIP bundling ${settings.zip ? 'enabled' : 'disabled (files saved individually)'} — applies to the next download.`,
      );
    });
    add(`Compression (current: ${settings.compression})`, () => {
      saveSetting('compression', settings.compression === 'STORE' ? 'DEFLATE' : 'STORE');
      changed(`Compression set to ${settings.compression}.`);
    });
    toggle('Pre-flight confirmation', 'confirm');
    toggle('Verify file sizes', 'verifySize');
    toggle('Resume support', 'resume');
    toggle(
      'Save via GM_download (ZIPs & individual files)',
      'useGmDownload',
      'on (manager saves — no per-file dialog; best for no-ZIP Download All)',
      'off (browser <a> download)',
    );
    add('Clear resume data (all albums)', () => {
      const n = clearAllResume();
      notify('BunkrDL', `Cleared resume data for ${n} album(s).`);
    });
    add('Reset BunkrDL settings to defaults', () => {
      for (const k of Object.keys(DEFAULTS)) saveSetting(k, DEFAULTS[k]);
      changed('Settings reset to defaults.');
    });
  }

  // -------------------------------------------------------------------------
  //  Section 10 — bootstrap
  // -------------------------------------------------------------------------

  function boot() {
    registerMenu();

    // balbums listing pages: add per-card buttons (cards also load via scroll).
    if (/(^|\.)balbums\.st$/i.test(location.hostname)) {
      setupBalbumsCards();
      let pending = null;
      const obs = new MutationObserver(() => {
        clearTimeout(pending);
        pending = setTimeout(setupBalbumsCards, 300);
      });
      obs.observe(document.body, { childList: true, subtree: true });
      return;
    }

    // Bunkr pages: act only on album (/a/) and file (/f//v//i//d/) pages. The
    // broad @match domains can land us on other pages, so path-gate here (the
    // @include regex is already path-scoped). The toolbar can render a touch
    // after document-idle, so retry the injection briefly until it lands.
    const path = location.pathname;

    if (/^\/a\//.test(path)) {
      // Album page: the bulk-download trigger (toolbar can render late → poll),
      // plus per-item download buttons (grid paginates / renders late → observe).
      let tries = 0;
      const tick = setInterval(() => {
        setupBunkrAlbum();
        if (document.getElementById('bdl-album-trigger') || ++tries > 20) clearInterval(tick);
      }, 400);
      setupAlbumItemButtons();
      let pending = null;
      const obs = new MutationObserver(() => {
        clearTimeout(pending);
        pending = setTimeout(setupAlbumItemButtons, 300);
      });
      obs.observe(document.body, { childList: true, subtree: true });
    } else if (/^\/[fvid]\//.test(path)) {
      // Single file page: a direct download button (data-file-id renders late).
      let tries = 0;
      const tick = setInterval(() => {
        setupBunkrFile();
        if (document.getElementById('bdl-file-trigger') || ++tries > 20) clearInterval(tick);
      }, 400);
    }
  }

  boot();
})();
