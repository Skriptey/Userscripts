// ==UserScript==
// @name         MetaIncDL — Instagram / Facebook / Threads downloader
// @namespace    https://github.com/Skriptey/Userscripts
// @version      1.0.0
// @description  Download your own / authorised photos, videos, stories, reels & highlights from Instagram, Facebook and Threads in original quality (never webp), optionally zipped.
// @author       Skriptey
// @license      GPL-3.0-or-later
// @match        https://www.instagram.com/*
// @match        https://www.facebook.com/*
// @match        https://web.facebook.com/*
// @match        https://www.threads.com/*
// @match        https://www.threads.net/*
// @run-at       document-start
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_notification
// @grant        GM_addStyle
// @grant        GM_download
// @connect      instagram.com
// @connect      cdninstagram.com
// @connect      facebook.com
// @connect      fbcdn.net
// @connect      threads.com
// @connect      threads.net
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js
// @homepageURL  https://github.com/Skriptey/Userscripts/tree/main/scripts/metaincdl
// @supportURL   https://github.com/Skriptey/Userscripts/issues
// @downloadURL  https://skriptey.github.io/Userscripts/metaincdl/metaincdl.user.js
// @updateURL    https://skriptey.github.io/Userscripts/metaincdl/metaincdl.user.js
// ==/UserScript==

/* global JSZip */

// =============================================================================
//  MetaIncDL — what it is and how it works
// -----------------------------------------------------------------------------
//  A bulk downloader for the Meta family (Instagram, Facebook, Threads). On a
//  profile it adds a "⬇ Download ▾" dropdown (Timeline Photos / Videos /
//  Stories / Reels / Highlights / Download All) and on an individual
//  post/story/reel an overlay download icon. Media is fetched in its MAXIMUM
//  original quality; images are always saved as jpg/png/native — NEVER webp.
//  Output is optionally bundled into size-capped ZIPs (the BunkrDL model).
//
//  ⚠️ USE RESPONSIBLY. Download only your own content, or content you are
//  authorised to keep. MetaIncDL runs ON YOUR REAL, LOGGED-IN ACCOUNT and only
//  ever reads what your session can already see — it bypasses no access
//  control. Aggressive bulk grabbing can trip Meta's anti-automation and put a
//  checkpoint/challenge on your account, so the defaults are deliberately
//  conservative and MetaIncDL HARD-STOPS the moment it sees a checkpoint.
//
//  HOW IT GETS DATA — capture & replay (no minted auth, no scraping the DOM).
//  All three sites are the same Meta/Relay GraphQL substrate. At
//  @run-at document-start (before the app boots) MetaIncDL installs PASSIVE hooks
//  on the page's own window.fetch + XMLHttpRequest: it READS (never mutates,
//  always calls through) the auth the page already sends — X-IG-App-ID,
//  X-CSRFToken, X-IG-WWW-Claim, X-ASBD-ID, fb_dtsg, lsd — and the rotating
//  GraphQL doc_id ↔ friendly-name map. MetaIncDL then replays the page's OWN
//  internal endpoints, same-origin with credentials, to enumerate and resolve
//  media. Nothing is hardcoded that rotates; if a needed query hasn't fired
//  yet on a cold route, MetaIncDL asks you to interact with the page to "arm" it.
//
//  WHY THE PERMISSIONS — unsafeWindow is required to wrap the PAGE's fetch/XHR
//  (a sandbox-only patch silently never fires, especially on Firefox, where we
//  must also route the wrappers through exportFunction). GM_xmlhttpRequest +
//  the @connect hosts fetch media bytes from the Meta CDNs cross-origin. The
//  JSZip @require (pinned 3.10.1) builds the optional ZIPs.
//
//  IMAGES NEVER WEBP — MetaIncDL prefers the native variant URL-side (it reads the
//  native jpg/png candidate from the API JSON, and rewrites the CDN `stp`
//  dst-webp→dst-jpg token), sniffs the magic bytes after download, and only if
//  the bytes are still webp AND no native variant is reachable does it transcode
//  in-tab (createImageBitmap → OffscreenCanvas → PNG by default), carrying any
//  EXIF/XMP metadata across. A "keep original .webp" mode is available too.
//
//  CONFIGURATION — open your userscript manager's menu for MetaIncDL: every feature
//  (each download type, the overlay icon, the FYP grab, ZIP bundling, the
//  authorisation gate, throttling, the webp policy …) is an independent toggle,
//  persisted via GM storage, with labels that refresh on reopen.
//
//  STATUS: BETA. The token capture and Meta's internal endpoints can only be
//  validated in a real logged-in browser; field names/doc_ids rotate. Treat
//  first runs as testing and please report what works.
// =============================================================================

(function () {
  'use strict';

  // Guard against double-injection (some managers inject twice on SPA boots).
  const PAGE = (typeof unsafeWindow !== 'undefined' && unsafeWindow) || window;
  if (PAGE.__metaIncDLLoaded) return;
  PAGE.__metaIncDLLoaded = true;

  // ---------------------------------------------------------------------------
  //  Section 1 — platform detection + settings
  // ---------------------------------------------------------------------------

  /** Which Meta site this tab is. Drives the active adapter + app-id. */
  function detectPlatform() {
    const h = location.hostname;
    if (/(^|\.)instagram\.com$/i.test(h)) return 'instagram';
    if (/(^|\.)threads\.(net|com)$/i.test(h)) return 'threads';
    if (/(^|\.)facebook\.com$/i.test(h)) return 'facebook';
    return null;
  }
  const PLATFORM = detectPlatform();

  // Public web app-ids (NOT secrets — they identify the public web client and
  // are sent by the page on every request; we only reuse what the page sends).
  const APP_ID = { instagram: '936619743392459', threads: '238260118697367' };

  // Default, user-overridable settings (persisted via GM_setValue/GM_getValue).
  // Defaults are intentionally CONSERVATIVE for account safety.
  const DEFAULTS = {
    // feature toggles (each independently switchable from the manager menu)
    profileDropdown: true, // the "⬇ Download ▾" control on a profile header
    overlayIcon: true, // per-item corner download glyph on posts/reels/stories
    dlPhotos: true, // include image posts in profile bulk runs
    dlVideos: true, // include video posts in profile bulk runs
    dlStories: true, // Stories (gated by requireAuthConfirm)
    dlReels: true, // Reels
    dlHighlights: true, // Highlights (gated by requireAuthConfirm)
    fypBulk: true, // allow bulk-download of the user's own home/FYP feed
    requireAuthConfirm: true, // one-time "I'm authorised" gate for Stories/Highlights
    // download / output
    zip: false, // bundle into ZIPs (false = save each file individually)
    maxZipMB: 1024, // target maximum size of each ZIP, in MiB
    compression: 'STORE', // 'STORE' (no recompress) or 'DEFLATE'
    useGmDownload: false, // save via GM_download (no per-file dialog)
    confirm: true, // pre-flight summary + confirmation before a bulk job
    // format
    webpFallback: 'png', // when only webp is reachable: 'png' | 'jpg' | 'keep'
    // throttling (account safety)
    fypCap: 200, // hard cap on items for the infinite home/FYP feed
    pageDelayMs: 2500, // base pause between enumeration page requests
    jitterMs: 1500, // random extra 0..jitter added to each pause
    cdnConcurrency: 3, // parallel CDN byte downloads (not GraphQL-throttled)
    maxRetries: 4, // attempts per file before giving up
    backoffBaseMs: 5000, // first backoff after a rate-limit response
    backoffMaxMs: 120000, // cap on backoff wait
    windowCap: 18, // max enumeration requests per rolling 11 minutes
  };

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

  // ---------------------------------------------------------------------------
  //  Section 2 — small utilities
  // ---------------------------------------------------------------------------

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /** Base pause with jitter, used between enumeration page requests. */
  const politePause = () =>
    sleep(settings.pageDelayMs + Math.floor(Math.random() * settings.jitterMs));

  /** Human-readable byte size, e.g. 1536000 → "1.46 MiB". */
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

  /** Make a string safe to use as a file name on any OS. */
  function sanitizeFilename(name) {
    return (
      String(name || 'file')
        .replace(/[\\/:*?"<>|]/g, '_') // illegal path chars (hyphens are legal)
        .replace(/\s+/g, ' ')
        .replace(/^\.+/, '') // no leading dots
        .trim()
        .slice(0, 180) || 'file'
    );
  }

  /** Pull the extension out of a CDN URL path (sans query), lowercased. */
  function extFromUrl(url) {
    try {
      const p = new URL(url, location.href).pathname;
      const m = /\.([a-z0-9]{2,5})$/i.exec(p);
      return m ? m[1].toLowerCase() : '';
    } catch {
      return '';
    }
  }

  /** Best-effort desktop notification (silent if unavailable). */
  function notify(title, text) {
    try {
      GM_notification({ title, text, silent: true, timeout: 6000 });
    } catch {
      /* ignore */
    }
  }

  // ---------------------------------------------------------------------------
  //  Section 3 — TOKEN-CAPTURE CORE  (must run first, at document-start)
  // ---------------------------------------------------------------------------
  //  Passively sniff the auth + GraphQL doc_ids the page itself sends. We never
  //  mutate a request and always call through. Captured values are the freshest
  //  non-empty seen, stored globally and per GraphQL friendly-name.

  const captured = {
    headers: {}, // lower-cased header name → value (app-id, csrftoken, www-claim…)
    body: {}, // fb_dtsg, lsd, av, __user, doc_id (last seen)
    queries: {}, // friendly_name → { docId, variables, headers, time }
    origin: location.origin,
  };

  // Header names worth keeping (everything the Meta clients authenticate with).
  const KEEP_HEADERS = new Set([
    'x-ig-app-id',
    'x-csrftoken',
    'x-ig-www-claim',
    'x-asbd-id',
    'x-bloks-version-id',
    'x-fb-friendly-name',
    'x-fb-lsd',
    'authorization',
  ]);

  /** Record a header if it's one we authenticate with and is non-empty. */
  function keepHeader(name, value) {
    const k = String(name || '').toLowerCase();
    if (KEEP_HEADERS.has(k) && value) captured.headers[k] = String(value);
  }

  /** Parse a urlencoded GraphQL body and stash doc_id/friendly-name/tokens. */
  function sniffBody(body) {
    if (typeof body !== 'string' || body.indexOf('=') === -1) return;
    let params;
    try {
      params = new URLSearchParams(body);
    } catch {
      return;
    }
    for (const key of ['fb_dtsg', 'lsd', 'av', '__user', 'jazoest', 'doc_id']) {
      const v = params.get(key);
      if (v) captured.body[key] = v;
    }
    const friendly = params.get('fb_api_req_friendly_name');
    const docId = params.get('doc_id');
    if (friendly && docId) {
      captured.queries[friendly] = {
        docId,
        variables: params.get('variables') || '',
        time: nowMs(),
      };
    }
  }

  let _clockBase = 0; // monotonic-ish counter; Date in page is fine but kept simple
  function nowMs() {
    // performance.now() is available in the page and is monotonic.
    try {
      return Math.round(performance.now());
    } catch {
      return _clockBase++;
    }
  }

  /** Sniff a fetch() call (Request|string url + init). */
  function sniffFetch(input, init) {
    try {
      const headers = (init && init.headers) || (input && input.headers);
      if (headers) {
        if (typeof headers.forEach === 'function') {
          headers.forEach((v, k) => keepHeader(k, v));
        } else {
          for (const k of Object.keys(headers)) keepHeader(k, headers[k]);
        }
      }
      const body = init && init.body;
      if (typeof body === 'string') sniffBody(body);
    } catch {
      /* never let sniffing break the page */
    }
  }

  /** Install passive hooks on the page's fetch + XMLHttpRequest. */
  function installCaptureHooks() {
    const xfn = typeof globalThis.exportFunction === 'function' ? globalThis.exportFunction : null;
    const wrap = (fn) => (xfn ? xfn(fn, PAGE) : fn);

    // ---- fetch ----
    try {
      const origFetch = PAGE.fetch;
      if (typeof origFetch === 'function') {
        const fetchHook = function (input, init) {
          sniffFetch(input, init);
          return origFetch.apply(this, arguments);
        };
        PAGE.fetch = wrap(fetchHook);
      }
    } catch {
      /* leave fetch alone if we can't wrap it */
    }

    // ---- XMLHttpRequest ----
    try {
      const XHR = PAGE.XMLHttpRequest;
      const proto = XHR && XHR.prototype;
      if (proto) {
        const open = proto.open;
        const setH = proto.setRequestHeader;
        const send = proto.send;
        proto.open = wrap(function (method, url) {
          this.__mdl = { method, url, headers: {} };
          return open.apply(this, arguments);
        });
        proto.setRequestHeader = wrap(function (k, v) {
          if (this.__mdl) this.__mdl.headers[String(k).toLowerCase()] = v;
          keepHeader(k, v);
          return setH.apply(this, arguments);
        });
        proto.send = wrap(function (body) {
          try {
            if (typeof body === 'string') sniffBody(body);
          } catch {
            /* ignore */
          }
          return send.apply(this, arguments);
        });
      }
    } catch {
      /* leave XHR alone if we can't wrap it */
    }
  }

  /** True if we've captured enough to issue an IG/Threads GraphQL replay. */
  function captureReady() {
    return !!(captured.headers['x-ig-app-id'] || captured.headers['x-csrftoken']);
  }

  /** True if we've captured a specific GraphQL friendly-name query to replay. */
  function armedFor(friendlyName) {
    return !!captured.queries[friendlyName];
  }

  // ---------------------------------------------------------------------------
  //  Section 4 — networking (GM_xmlhttpRequest wrapper + helpers)
  // ---------------------------------------------------------------------------

  // Every in-flight GM_xmlhttpRequest handle, so cancel can abort ALL of them
  // (with cdnConcurrency>1 there can be several at once).
  const inFlight = new Set();

  /** Abort every in-flight request (called on cancel). */
  function abortAll() {
    for (const h of inFlight) {
      try {
        if (h && h.abort) h.abort();
      } catch {
        /* ignore */
      }
    }
    inFlight.clear();
  }

  /** Promise wrapper around GM_xmlhttpRequest. Blob downloads are left untimed;
   *  API/JSON calls get a 45s ceiling so a hung connection surfaces as an error. */
  function gmRequest(opts) {
    let timeout = opts.timeout;
    if (timeout == null) timeout = opts.responseType === 'blob' ? 0 : 45000;
    return new Promise((resolve, reject) => {
      let handle;
      const settle = (fn, arg) => {
        if (handle) inFlight.delete(handle);
        fn(arg);
      };
      handle = GM_xmlhttpRequest({
        method: opts.method || 'GET',
        url: opts.url,
        headers: opts.headers || {},
        data: opts.data,
        responseType: opts.responseType,
        timeout,
        onprogress: opts.onprogress,
        onload: (res) => settle(resolve, res),
        onerror: () => settle(reject, new Error('network error')),
        ontimeout: () => settle(reject, new Error('timeout')),
        onabort: () => settle(reject, new Error('aborted')),
      });
      inFlight.add(handle);
    });
  }

  /** A checkpoint/challenge response means "stop now" — never retry past it. */
  function isCheckpoint(res) {
    if (!res) return false;
    if (res.status === 401 || res.status === 403) {
      const t = (res.responseText || '').slice(0, 400);
      return /checkpoint_required|challenge_required|feedback_required|login_required/i.test(t);
    }
    return false;
  }

  /** The standard auth header block the Meta web clients send (captured live).
   *  Keeping every internal call on this same block is what makes the
   *  infinite-scroll REST endpoints (clips/user, feed/timeline) reliable. */
  function metaHeaders(extra) {
    return {
      'X-IG-App-ID': captured.headers['x-ig-app-id'] || APP_ID[PLATFORM] || '',
      'X-CSRFToken': captured.headers['x-csrftoken'] || readCookie('csrftoken') || '',
      'X-ASBD-ID': captured.headers['x-asbd-id'] || '',
      'X-IG-WWW-Claim': captured.headers['x-ig-www-claim'] || '0',
      'X-Requested-With': 'XMLHttpRequest',
      ...(extra || {}),
    };
  }

  /** Checkpoint/rate-limit guard, then JSON.parse a response. */
  function parseApi(res, label) {
    if (isCheckpoint(res)) throw checkpointError();
    if (res.status === 429 || res.status === 503) throw rateLimitError(res);
    if (res.status < 200 || res.status >= 300) throw new Error(`${label} HTTP ${res.status}`);
    try {
      return JSON.parse(res.responseText);
    } catch {
      throw new Error(`${label} returned non-JSON (session may be logged out)`);
    }
  }

  /** GET JSON from the current origin's internal API (cookies sent by GM).
   *  Always same-origin — auth headers are never attached cross-origin. */
  async function apiGet(path, extraHeaders) {
    const res = await gmRequest({
      method: 'GET',
      url: location.origin + path,
      headers: metaHeaders(extraHeaders),
    });
    return parseApi(res, 'API');
  }

  /** POST a urlencoded body to the current origin's internal API. */
  async function apiPost(path, body, extraHeaders) {
    const res = await gmRequest({
      method: 'POST',
      url: location.origin + path,
      headers: metaHeaders({
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(extraHeaders || {}),
      }),
      data: typeof body === 'string' ? body : body.toString(),
    });
    return parseApi(res, 'API');
  }

  /** Replay a GraphQL query the page already issued, swapping in our variables. */
  async function graphql(friendlyName, variables, docIdFallback) {
    const cap = captured.queries[friendlyName];
    const docId = (cap && cap.docId) || docIdFallback;
    if (!docId) throw new Error(`no doc_id for ${friendlyName} (interact with the page to arm it)`);
    const form = new URLSearchParams();
    form.set('doc_id', docId);
    form.set('variables', JSON.stringify(variables));
    if (captured.body.fb_dtsg) form.set('fb_dtsg', captured.body.fb_dtsg);
    if (captured.body.lsd) form.set('lsd', captured.body.lsd);
    if (captured.body.av) form.set('av', captured.body.av);
    form.set('fb_api_req_friendly_name', friendlyName);
    form.set('server_timestamps', 'true');
    const res = await gmRequest({
      method: 'POST',
      url: location.origin + '/api/graphql/',
      // Meta's GraphQL gateway routes/validates on the friendly-name HEADER —
      // sending it only in the body is a common cause of empty/errored replays.
      headers: metaHeaders({
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-FB-Friendly-Name': friendlyName,
        'X-FB-LSD': captured.headers['x-fb-lsd'] || captured.body.lsd || '',
      }),
      data: form.toString(),
    });
    if (isCheckpoint(res)) throw checkpointError();
    if (res.status === 429 || res.status === 503) throw rateLimitError(res);
    if (res.status < 200 || res.status >= 300) throw new Error(`GraphQL HTTP ${res.status}`);
    // Meta increasingly streams multi-chunk (defer/stream) responses: line 0 may
    // be a skeleton and later lines carry the edges. Parse every JSON line and
    // return the chunk that actually holds a connection (edges + page_info).
    const parsed = [];
    for (const ln of res.responseText.split('\n')) {
      const t = ln.trim();
      if (!t) continue;
      try {
        parsed.push(JSON.parse(t));
      } catch {
        /* skip a non-JSON chunk */
      }
    }
    if (!parsed.length) throw new Error('GraphQL returned non-JSON');
    return parsed.find((p) => deepFind(p, (o) => o && o.edges && o.page_info)) || parsed[0];
  }

  function rateLimitError(res) {
    const e = new Error('rate-limited');
    e.rateLimited = true;
    const ra = res && res.responseHeaders && /retry-after:\s*(\d+)/i.exec(res.responseHeaders);
    e.retryAfter = ra ? Number(ra[1]) * 1000 : 0;
    return e;
  }
  function checkpointError() {
    const e = new Error('checkpoint/challenge — STOP. Open the site and clear it before retrying.');
    e.checkpoint = true;
    return e;
  }

  /** Read a cookie value (csrftoken fallback when not captured from a header). */
  function readCookie(name) {
    const m = new RegExp('(?:^|;\\s*)' + name + '=([^;]+)').exec(document.cookie || '');
    return m ? decodeURIComponent(m[1]) : '';
  }

  /** Download a CDN URL to a Blob, with progress. */
  async function downloadBlob(url, onProgress) {
    const res = await gmRequest({
      method: 'GET',
      url,
      responseType: 'blob',
      onprogress: (e) => {
        if (onProgress) onProgress(e.loaded, e.lengthComputable ? e.total : 0);
      },
    });
    if (res.status === 429 || res.status === 503) throw rateLimitError(res);
    if (res.status < 200 || res.status >= 300) throw new Error(`download HTTP ${res.status}`);
    const blob = res.response;
    if (!(blob instanceof Blob) || blob.size === 0) throw new Error('empty download');
    return blob;
  }

  // ---------------------------------------------------------------------------
  //  Section 5 — media resolver + webp→jpg/png (metadata-preserving)
  // ---------------------------------------------------------------------------

  /**
   * Pick the highest-quality image URL from a Meta media node. Prefers the
   * structured `image_versions2.candidates` (native jpg) over the DOM's
   * downscaled webp; falls back to `display_resources` / `display_url`.
   * @returns {string|''}
   */
  function pickBestImage(node) {
    if (!node) return '';
    const cands =
      (node.image_versions2 && node.image_versions2.candidates) || node.display_resources || null;
    if (Array.isArray(cands) && cands.length) {
      let best = null;
      for (const c of cands) {
        const url = c.url || (c.src && c.src) || '';
        const area = (c.width || c.config_width || 0) * (c.height || c.config_height || 0);
        if (url && (!best || area > best.area)) best = { url, area };
      }
      if (best) return best.url;
    }
    return node.display_url || node.src || '';
  }

  /**
   * Pick the highest-quality progressive video URL (prefer muxed MP4 over DASH,
   * which separates audio/video and would need muxing).
   * @returns {string|''}
   */
  function pickBestVideo(node) {
    if (!node) return '';
    const vers = node.video_versions || node.video_resources || null;
    if (Array.isArray(vers) && vers.length) {
      let best = null;
      for (const v of vers) {
        const url = v.url || v.src || '';
        const area = (v.width || 0) * (v.height || 0);
        if (url && (!best || area > best.area)) best = { url, area };
      }
      if (best) return best.url;
    }
    return node.video_url || node.playable_url_quality_hd || node.playable_url || '';
  }

  /**
   * Walk an arbitrary Meta media node (incl. carousels) into normalized items.
   * Robust to FB Comet field churn: a node is "media" if it carries the known
   * image/video shapes anywhere in its tree.
   * @returns {Array<{kind,url,width,height}>}
   */
  function walkNodeForMedia(node, out) {
    out = out || [];
    if (!node || typeof node !== 'object') return out;
    // Carousel / sidecar children first.
    const children =
      (node.carousel_media && node.carousel_media) ||
      (node.edge_sidecar_to_children && node.edge_sidecar_to_children.edges) ||
      null;
    if (Array.isArray(children) && children.length) {
      for (const ch of children) walkNodeForMedia(ch.node || ch, out);
      return out;
    }
    const isVideo =
      node.media_type === 2 || node.is_video === true || !!node.video_versions || !!node.video_url;
    if (isVideo) {
      const url = pickBestVideo(node);
      if (url)
        out.push({ kind: 'video', url, width: node.original_width, height: node.original_height });
    } else {
      const url = pickBestImage(node);
      if (url)
        out.push({ kind: 'image', url, width: node.original_width, height: node.original_height });
    }
    return out;
  }

  /** Rewrite a Meta CDN URL's `stp` token to request native jpg instead of webp.
   *  Only the dst-<fmt> token is touched — never the oh/oe HMAC signature. */
  function preferNativeUrl(url) {
    try {
      if (/dst-webp/i.test(url)) return url.replace(/dst-webp/gi, 'dst-jpg');
    } catch {
      /* ignore */
    }
    return url;
  }

  /** Detect the true image format from the first bytes (don't trust the URL). */
  async function sniffFormat(blob) {
    const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
    const ascii = (a, b) => String.fromCharCode(...head.slice(a, b));
    if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
    if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpg';
    if (head[0] === 0x89 && ascii(1, 4) === 'PNG') return 'png';
    if (ascii(0, 3) === 'GIF') return 'gif';
    return '';
  }

  /**
   * Parse the metadata chunks (EXIF / XMP / ICCP) out of a WebP RIFF blob so we
   * can carry them across a transcode. Returns { exif, xmp, anim } (Uint8Arrays).
   */
  async function readWebpMeta(blob) {
    const buf = new Uint8Array(await blob.arrayBuffer());
    const out = { exif: null, xmp: null, anim: false };
    if (buf.length < 12) return out;
    const tag = (o) => String.fromCharCode(buf[o], buf[o + 1], buf[o + 2], buf[o + 3]);
    if (tag(0) !== 'RIFF' || tag(8) !== 'WEBP') return out;
    const dv = new DataView(buf.buffer);
    let off = 12;
    while (off + 8 <= buf.length) {
      const fourcc = tag(off);
      const size = dv.getUint32(off + 4, true);
      const body = off + 8;
      if (fourcc === 'EXIF') out.exif = buf.slice(body, body + size);
      else if (fourcc === 'XMP ') out.xmp = buf.slice(body, body + size);
      else if (fourcc === 'ANIM' || fourcc === 'ANMF') out.anim = true;
      off = body + size + (size & 1); // chunks are even-padded
    }
    return out;
  }

  /** Build a JPEG APP1 (Exif) segment from raw EXIF/TIFF bytes. */
  function jpegExifSegment(exif) {
    // EXIF in a WebP EXIF chunk is the raw TIFF stream; JPEG wants "Exif\0\0" + TIFF.
    const prefix =
      exif.length >= 6 && String.fromCharCode(exif[0], exif[1], exif[2], exif[3]) === 'Exif'
        ? new Uint8Array(0)
        : new Uint8Array([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]); // "Exif\0\0"
    const payload = concatBytes(prefix, exif);
    const len = payload.length + 2;
    return concatBytes(new Uint8Array([0xff, 0xe1, (len >> 8) & 0xff, len & 0xff]), payload);
  }

  /** Concatenate Uint8Arrays. */
  function concatBytes(...arrs) {
    const total = arrs.reduce((s, a) => s + a.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const a of arrs) {
      out.set(a, o);
      o += a.length;
    }
    return out;
  }

  /** Insert an EXIF APP1 segment into a JPEG blob right after SOI. */
  async function injectJpegExif(jpegBlob, exif) {
    if (!exif || !exif.length) return jpegBlob;
    const bytes = new Uint8Array(await jpegBlob.arrayBuffer());
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return jpegBlob; // not a JPEG
    const seg = jpegExifSegment(exif);
    return new Blob([bytes.slice(0, 2), seg, bytes.slice(2)], { type: 'image/jpeg' });
  }

  /** CRC-32 (PNG chunk checksum). */
  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
      crc ^= bytes[i];
      for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  /** Build a PNG chunk: length + type + data + CRC. */
  function pngChunk(type, data) {
    const t = new Uint8Array([...type].map((c) => c.charCodeAt(0)));
    const u32 = (n) =>
      new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
    return concatBytes(u32(data.length), t, data, u32(crc32(concatBytes(t, data))));
  }

  /** Insert an eXIf chunk (PNG 1.5+) so EXIF survives a webp→png transcode. */
  async function injectPngExif(pngBlob, exif) {
    if (!exif || !exif.length) return pngBlob;
    // PNG eXIf holds the bare TIFF stream — drop a leading "Exif\0\0" if present.
    let tiff = exif;
    if (
      exif.length >= 6 &&
      exif[0] === 0x45 &&
      exif[1] === 0x78 &&
      exif[2] === 0x69 &&
      exif[3] === 0x66
    ) {
      tiff = exif.slice(6);
    }
    const bytes = new Uint8Array(await pngBlob.arrayBuffer());
    const insertAt = 8 + 25; // 8-byte signature + IHDR (length 13 → 8+13+4 = 25)
    if (bytes.length < insertAt) return pngBlob;
    const chunk = pngChunk('eXIf', tiff);
    return new Blob([bytes.slice(0, insertAt), chunk, bytes.slice(insertAt)], {
      type: 'image/png',
    });
  }

  /**
   * Ensure an image blob is non-webp, in the user's chosen output format,
   * carrying any EXIF/XMP across. Returns { blob, ext }.
   *   - If already jpg/png/gif: returned untouched (metadata intact).
   *   - If webp + policy 'keep': returned as-is (.webp).
   *   - If webp + policy png/jpg: transcoded via createImageBitmap →
   *     OffscreenCanvas, with EXIF re-injected (JPEG) where present.
   */
  async function normaliseImage(blob, policy) {
    const fmt = await sniffFormat(blob);
    if (fmt && fmt !== 'webp') return { blob, ext: fmt };
    if (fmt !== 'webp') return { blob, ext: fmt || 'jpg' };
    if (policy === 'keep') return { blob, ext: 'webp' };

    const meta = await readWebpMeta(blob).catch(() => ({ exif: null, anim: false }));
    if (meta.anim) return { blob, ext: 'webp' }; // animated webp → keep original (frame-0 loss avoided)

    try {
      const bmp = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bmp, 0, 0);
      bmp.close && bmp.close();
      if (policy === 'jpg') {
        let out = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.95 });
        if (meta.exif) out = await injectJpegExif(out, meta.exif);
        return { blob: out, ext: 'jpg' };
      }
      // PNG (default): lossless, preserves alpha, and EXIF is re-attached via a
      // PNG eXIf chunk so metadata survives the transcode (XMP would need iTXt).
      let out = await canvas.convertToBlob({ type: 'image/png' });
      if (meta.exif) out = await injectPngExif(out, meta.exif);
      return { blob: out, ext: 'png' };
    } catch {
      // Transcode unavailable (no OffscreenCanvas, decode error) → keep original.
      return { blob, ext: 'webp' };
    }
  }

  // ---------------------------------------------------------------------------
  //  Section 6 — platform adapters
  // ---------------------------------------------------------------------------
  //  Each adapter exposes a uniform interface over its site's endpoints. They
  //  all produce normalized items: { id, kind, url, ext, filename, meta }.
  //  IG has the highest confidence; Threads reuses IG; FB leans on capture+walk.

  /** Normalize a raw media node + an index into a download item. */
  function toItems(node, baseName) {
    const medias = walkNodeForMedia(node);
    return medias.map((m, i) => {
      const isImg = m.kind === 'image';
      const url = isImg ? preferNativeUrl(m.url) : m.url;
      const ext = extFromUrl(url) || (isImg ? 'jpg' : 'mp4');
      const suffix = medias.length > 1 ? ` (${i + 1})` : '';
      return {
        id: (node.id || node.pk || node.code || '') + ':' + i,
        kind: m.kind,
        url,
        ext,
        filename: sanitizeFilename(baseName + suffix) + '.' + ext,
      };
    });
  }

  /** Stable per-item base name: "<owner> - <code> - <timestamp>". */
  function baseNameFor(node, owner) {
    const code = node.code || node.shortcode || node.pk || node.id || 'item';
    const ts = node.taken_at || node.taken_at_timestamp || node.device_timestamp || '';
    const date = ts
      ? new Date(ts * (String(ts).length > 12 ? 1 : 1000)).toISOString().slice(0, 10)
      : '';
    return [owner, date, code].filter(Boolean).join(' - ');
  }

  // ---- Instagram ----
  const igAdapter = {
    platform: 'instagram',

    /** Resolve a username to its numeric user id (+ display owner name). */
    async resolveUser(username) {
      const data = await apiGet(
        `/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
      );
      const u = data && data.data && data.data.user;
      if (!u) throw new Error('could not resolve user (logged out, or private/unknown)');
      return { id: u.id, owner: u.username || username, user: u };
    },

    /** Async generator over a profile's timeline media (photos + videos). */
    async *profileTimeline(userId, owner, onPage) {
      let after = '';
      let more = true;
      while (more && !cancelRequested) {
        await windowGate();
        const data = await apiGet(
          `/api/v1/feed/user/${encodeURIComponent(userId)}/?count=12${after ? '&max_id=' + encodeURIComponent(after) : ''}`,
        );
        const items = (data && data.items) || [];
        for (const node of items) {
          for (const it of toItems(node, baseNameFor(node, owner))) yield it;
        }
        const next = data.next_max_id || '';
        // Guard a non-advancing cursor (would otherwise loop forever).
        more = !!data.more_available && !!next && next !== after;
        after = next;
        if (onPage) onPage(items.length);
        if (more) await politePause();
      }
    },

    /** Stories currently live for a user. */
    async stories(userId, owner) {
      const data = await apiGet(`/api/v1/feed/reels_media/?reel_ids=${encodeURIComponent(userId)}`);
      const reel = data && data.reels && data.reels[userId];
      const items = (reel && reel.items) || [];
      return items.flatMap((n) => toItems(n, baseNameFor(n, owner + ' - story')));
    },

    /** Highlight trays → each highlight's media. */
    async highlights(userId, owner) {
      const tray = await apiGet(
        `/api/v1/highlights/${encodeURIComponent(userId)}/highlights_tray/`,
      );
      const reels = (tray && tray.tray) || [];
      const out = [];
      for (const r of reels) {
        if (cancelRequested) break;
        await windowGate();
        const id = r.id; // "highlight:123..."
        const data = await apiGet(`/api/v1/feed/reels_media/?reel_ids=${encodeURIComponent(id)}`);
        const reel = data && data.reels && data.reels[id];
        for (const n of (reel && reel.items) || []) {
          out.push(...toItems(n, baseNameFor(n, owner + ' - highlight')));
        }
        await politePause();
      }
      return out;
    },

    /** Reels (clips) on a profile. */
    async *reels(userId, owner, onPage) {
      let maxId = '';
      let more = true;
      while (more && !cancelRequested) {
        await windowGate();
        const form = new URLSearchParams();
        form.set('target_user_id', userId);
        form.set('page_size', '12');
        if (maxId) form.set('max_id', maxId);
        let data;
        try {
          data = await apiPost('/api/v1/clips/user/', form);
        } catch (err) {
          if (err.checkpoint) throw err;
          break;
        }
        const items = (data && data.items) || [];
        for (const wrap of items) {
          const node = wrap.media || wrap;
          for (const it of toItems(node, baseNameFor(node, owner + ' - reel'))) yield it;
        }
        const paging = data && data.paging_info;
        const next = (paging && paging.max_id) || '';
        more = !!(paging && paging.more_available) && !!next && next !== maxId;
        maxId = next;
        if (onPage) onPage(items.length);
        if (more) await politePause();
      }
    },

    /** Resolve a single post/reel by its shortcode to its media items. */
    async single(shortcode, owner) {
      // GraphQL by shortcode is the page's own path; fall back to the legacy ?__a.
      const data = await apiGet(
        `/api/v1/media/${encodeURIComponent(shortcodeToMediaId(shortcode))}/info/`,
      ).catch(() => null);
      const node = data && data.items && data.items[0];
      if (node) return toItems(node, baseNameFor(node, owner || 'instagram'));
      throw new Error('could not resolve post (interact with it, or it may be private)');
    },
  };

  /** Convert an Instagram shortcode to its numeric media id (base64 alphabet). */
  function shortcodeToMediaId(code) {
    const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let id = 0n;
    for (const ch of String(code)) {
      const v = ALPHABET.indexOf(ch);
      if (v < 0) return code; // not a shortcode — return as-is
      id = id * 64n + BigInt(v);
    }
    return id.toString();
  }

  // ---- Threads (IG-backed; reuse IG resolver shapes) ----
  const threadsAdapter = {
    platform: 'threads',
    async resolveUser(username) {
      // Threads exposes profile media via GraphQL the page fires on a profile
      // route; we replay it. Username→id also comes from the captured query vars.
      return { id: username, owner: username, user: null };
    },
    async *profileTimeline(userId, owner, onPage) {
      // Replay the captured profile-posts query, paging on its end_cursor.
      const FRIENDLY = 'BarcelonaProfileThreadsTabQuery';
      if (!armedFor(FRIENDLY)) {
        throw new Error(
          'Open/scroll the Threads profile once so MetaIncDL can capture its query, then retry.',
        );
      }
      let after = '';
      let more = true;
      while (more && !cancelRequested) {
        await windowGate();
        const vars = { ...safeParse(captured.queries[FRIENDLY].variables), after, first: 12 };
        const data = await graphql(FRIENDLY, vars);
        const conn = deepFind(data, (o) => o && o.edges && o.page_info);
        const edges = (conn && conn.edges) || [];
        for (const e of edges) {
          const node = deepFind(
            e,
            (o) => o && (o.image_versions2 || o.video_versions || o.carousel_media),
          );
          if (node) for (const it of toItems(node, baseNameFor(node, owner))) yield it;
        }
        const next = (conn && conn.page_info && conn.page_info.end_cursor) || '';
        more =
          !!(conn && conn.page_info && conn.page_info.has_next_page) && !!next && next !== after;
        after = next;
        if (onPage) onPage(edges.length);
        if (more) await politePause();
      }
    },
    async stories() {
      return [];
    },
    async highlights() {
      return [];
    },
    async *reels() {
      /* Threads has no separate reels surface */
    },
    async single() {
      throw new Error('Open the Threads post once to arm MetaIncDL, then use the overlay icon.');
    },
  };

  // ---- Facebook (Comet GraphQL; capture + generic walk) ----
  const fbAdapter = {
    platform: 'facebook',
    async resolveUser(username) {
      return { id: username, owner: username, user: null };
    },
    async *profileTimeline(userId, owner, onPage) {
      // FB media grids load via a friendly-named GraphQL the page fires; replay
      // it and walk the response generically (Comet field names churn).
      // Real Comet names are e.g. ProfileCometAppCollectionPhotosRendererPaginationQuery,
      // ProfileCometTimelineFeedQuery, CometPhotoRootContentQuery — match broadly.
      const candidates = Object.keys(captured.queries).filter((n) =>
        /(Profile|Comet).*(Photo|Media|Timeline|Video)|(Photo|Media|Timeline).*(Pagination|Query|Feed)/i.test(
          n,
        ),
      );
      if (!candidates.length) {
        throw new Error(
          'Open the Facebook Photos/Videos tab once so MetaIncDL can capture its query, then retry.',
        );
      }
      const FRIENDLY = candidates[0];
      let after = '';
      let more = true;
      while (more && !cancelRequested) {
        await windowGate();
        const base = safeParse(captured.queries[FRIENDLY].variables);
        // Merge the cursor into whichever pagination keys the query uses.
        const vars = {
          ...base,
          cursor: after,
          after,
          count: base.count || 12,
          first: base.first || 12,
        };
        const data = await graphql(FRIENDLY, vars);
        const conn = deepFind(data, (o) => o && o.edges && o.page_info);
        const edges = (conn && conn.edges) || [];
        let emitted = 0;
        for (const e of edges) {
          const node = deepFind(
            e,
            (o) =>
              o && (o.image || o.playable_url || o.playable_url_quality_hd || o.video_versions),
          );
          if (node) {
            const isVid = !!(
              node.playable_url ||
              node.playable_url_quality_hd ||
              node.video_versions
            );
            const url = isVid
              ? node.playable_url_quality_hd || node.playable_url || pickBestVideo(node)
              : (node.image && node.image.uri) || pickBestImage(node);
            if (url) {
              const ext = extFromUrl(url) || (isVid ? 'mp4' : 'jpg');
              emitted++;
              yield {
                id: (e.node && e.node.id) || url, // url is a stable cross-page key
                kind: isVid ? 'video' : 'image',
                url: isVid ? url : preferNativeUrl(url),
                ext,
                filename:
                  sanitizeFilename(`${owner} - ${(e.node && e.node.id) || emitted}`) + '.' + ext,
              };
            }
          }
        }
        const next = (conn && conn.page_info && conn.page_info.end_cursor) || '';
        more =
          !!(conn && conn.page_info && conn.page_info.has_next_page) && !!next && next !== after;
        after = next;
        if (onPage) onPage(emitted);
        if (more) await politePause();
      }
    },
    async stories() {
      return [];
    },
    async highlights() {
      return [];
    },
    async *reels() {
      /* covered by the media grid */
    },
    async single() {
      throw new Error('Open the Facebook post once to arm MetaIncDL, then use the overlay icon.');
    },
  };

  const ADAPTERS = { instagram: igAdapter, threads: threadsAdapter, facebook: fbAdapter };
  const adapter = ADAPTERS[PLATFORM] || null;

  /** Safe JSON.parse → object (or {}). */
  function safeParse(s) {
    try {
      return JSON.parse(s) || {};
    } catch {
      return {};
    }
  }

  /** Depth-first search for the first sub-object matching a predicate. */
  function deepFind(obj, pred, depth) {
    depth = depth || 0;
    if (!obj || typeof obj !== 'object' || depth > 12) return null;
    if (pred(obj)) return obj;
    for (const k of Object.keys(obj)) {
      const found = deepFind(obj[k], pred, depth + 1);
      if (found) return found;
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  //  Section 7 — enumeration (dedupe, throttle, sliding-window cap, hard-stop)
  // ---------------------------------------------------------------------------

  const reqWindow = []; // timestamps of recent enumeration requests (window cap)

  /** Block until issuing another enumeration request is within the window cap. */
  async function windowGate() {
    const WINDOW_MS = 11 * 60 * 1000;
    const cap = Math.max(1, Number(settings.windowCap) || 1); // never 0 → would hang
    for (;;) {
      if (cancelRequested) return;
      const now = nowMs();
      while (reqWindow.length && now - reqWindow[0] > WINDOW_MS) reqWindow.shift();
      if (reqWindow.length < cap) {
        reqWindow.push(now);
        return;
      }
      await sleep(5000);
    }
  }

  /**
   * Drain an async generator (or array) of items into a deduped list, honouring
   * the FYP cap, the window gate, and a hard-stop on checkpoint/cancel.
   */
  async function collect(source, { cap, onCount } = {}) {
    const seen = new Set();
    const items = [];
    const pushOne = (it) => {
      if (!it || seen.has(it.id)) return false;
      seen.add(it.id);
      items.push(it);
      if (onCount) onCount(items.length);
      return true;
    };
    if (Array.isArray(source)) {
      for (const it of source) pushOne(it);
      return items;
    }
    for await (const it of source) {
      if (cancelRequested) break;
      pushOne(it);
      if (cap && items.length >= cap) break;
    }
    return items;
  }

  // ---------------------------------------------------------------------------
  //  Section 8 — download job (worker pool + ZIP / background save queue)
  // ---------------------------------------------------------------------------
  //  Lifted from BunkrDL's proven engine, fed normalized items. ZIP off (the
  //  default) decouples fetching from saving via a background drainer.

  let jobRunning = false;
  let cancelRequested = false;

  /** Run a download job over a list of normalized items. */
  async function runJob(items, jobName) {
    if (jobRunning) {
      notify('MetaIncDL', 'A download is already in progress.');
      return;
    }
    if (!items.length) {
      notify('MetaIncDL', 'Nothing to download.');
      return;
    }
    jobRunning = true;
    cancelRequested = false;
    const ui = createProgressUI();
    ui.setTitle(`${jobName} — ${items.length} item(s)`);
    ui.onCancel(() => {
      cancelRequested = true;
      ui.log('Cancelling…');
      abortAll();
      wakeAll(saveIdle);
      wakeAll(saveBackpressure);
    });

    const usingZip = settings.zip;
    const maxZipBytes = Math.max(1, settings.maxZipMB) * 1024 * 1024;
    let zip = usingZip ? new JSZip() : null;
    let zipBytes = 0;
    let zipCount = 0;
    let zipPart = 1;
    const usedNames = new Set();
    let done = 0;
    let failures = 0;

    // ----- background save queue (no-ZIP mode) -----
    const saveQueue = [];
    let saveQBytes = 0;
    let enqueueDone = false;
    const saveIdle = [];
    const saveBackpressure = [];

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

    async function flushZip() {
      if (!zip || zipCount === 0) return;
      const name = `${sanitizeFilename(jobName)}_${zipPart}.zip`;
      ui.setCurrent(`Building ${name}…`, 0, 0);
      let blob;
      try {
        blob = await zip.generateAsync(
          { type: 'blob', compression: settings.compression, streamFiles: true },
          (m) => ui.setCurrent(`Building ${name}`, m.percent, 100),
        );
      } catch (err) {
        ui.log(`✗ ZIP build failed: ${err.message}`);
        throw err;
      }
      await saveBlob(blob, name);
      ui.log(`Saved ${name}`);
      zip = new JSZip();
      zipBytes = 0;
      zipCount = 0;
      zipPart++;
    }

    async function drainSaves() {
      for (;;) {
        if (cancelRequested) return;
        if (!saveQueue.length) {
          if (enqueueDone) return;
          await new Promise((resolve) => saveIdle.push(resolve));
          continue;
        }
        const item = saveQueue.shift();
        try {
          await saveBlob(item.blob, item.name);
          done++;
        } catch (err) {
          failures++;
          ui.log(`✗ Save error "${item.name}": ${err.message}`);
        }
        saveQBytes -= item.size;
        ui.setOverall(done + failures, items.length);
        wakeAll(saveBackpressure);
      }
    }

    /** Fetch + format one item into a saveable blob (with retries). */
    async function fetchItem(item) {
      let backoff = 0;
      for (let attempt = 1; attempt <= settings.maxRetries && !cancelRequested; attempt++) {
        try {
          let blob = await downloadBlob(item.url, (l, t) => ui.setCurrent(item.filename, l, t));
          let name = item.filename;
          if (item.kind === 'image') {
            const norm = await normaliseImage(blob, settings.webpFallback);
            blob = norm.blob;
            name = name.replace(/\.[a-z0-9]+$/i, '.' + norm.ext);
          }
          return { blob, name };
        } catch (err) {
          if (err.checkpoint) throw err; // never retry past a checkpoint
          if (cancelRequested) return null;
          if (err.rateLimited) {
            backoff = Math.min(
              settings.backoffMaxMs,
              err.retryAfter || (backoff ? backoff * 2 : settings.backoffBaseMs),
            );
            ui.log(`Rate limited — waiting ${Math.round(backoff / 1000)}s`);
            await sleep(backoff);
          } else if (attempt < settings.maxRetries) {
            await sleep(settings.backoffBaseMs);
          } else {
            ui.log(`✗ Failed "${item.filename}": ${err.message}`);
          }
        }
      }
      return null;
    }

    async function packOne(item, blob, name) {
      if (!usingZip) {
        saveQueue.push({ blob, name: uniqueName(name), slug: item.id, size: blob.size });
        saveQBytes += blob.size;
        wakeAll(saveIdle);
        while (saveQBytes > maxZipBytes && !cancelRequested) {
          await new Promise((resolve) => saveBackpressure.push(resolve));
        }
        return;
      }
      if (!zip) zip = new JSZip();
      if (zipCount > 0 && zipBytes + blob.size > maxZipBytes) await flushZip();
      zip.file(uniqueName(name), blob, { compression: settings.compression });
      zipBytes += blob.size;
      zipCount++;
      done++;
      ui.setOverall(done + failures, items.length);
    }

    // ----- worker pool: fetch up to cdnConcurrency at once; pack serialized ----
    const drainer = usingZip ? null : drainSaves();
    let packChain = Promise.resolve();
    let nextIndex = 0;
    async function worker() {
      while (!cancelRequested) {
        const i = nextIndex++;
        if (i >= items.length) break;
        const item = items[i];
        ui.setCurrent(item.filename, 0, 0);
        let res;
        try {
          res = await fetchItem(item);
        } catch (err) {
          if (err.checkpoint) {
            cancelRequested = true;
            ui.log(`⛔ ${err.message}`);
            break;
          }
          res = null;
        }
        if (cancelRequested) break;
        if (!res) {
          failures++;
          ui.setOverall(done + failures, items.length);
          continue;
        }
        packChain = packChain
          .then(() => packOne(item, res.blob, res.name))
          .catch((err) => {
            failures++;
            ui.log(`✗ Pack error: ${err.message}`);
          });
        await packChain;
      }
    }

    const workers = Math.max(1, Math.min(8, Number(settings.cdnConcurrency) || 1));
    await Promise.all(Array.from({ length: workers }, () => worker()));
    await packChain.catch(() => {});
    enqueueDone = true;
    wakeAll(saveIdle);
    if (drainer) await drainer.catch(() => {});
    // Flush the partial ZIP even on cancel — its files were already downloaded
    // (and counted as done), so discarding it would silently lose them.
    if (usingZip && zipCount > 0) {
      try {
        await flushZip();
      } catch (err) {
        ui.log(`✗ Final ZIP failed: ${err.message}`);
        failures++;
      }
    }

    const summary = cancelRequested
      ? `Cancelled — ${done}/${items.length}${failures ? `, ${failures} failed` : ''}.`
      : `Done — ${done}/${items.length}${failures ? `, ${failures} failed` : ''}.`;
    ui.finish(summary);
    notify('MetaIncDL', summary);
    jobRunning = false;
  }

  function wakeAll(list) {
    const waiters = list.splice(0);
    for (const w of waiters) w();
  }

  /** Save a Blob to disk (GM_download when enabled, else a temporary <a>). */
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

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 60000);
  }

  // ---------------------------------------------------------------------------
  //  Section 9 — progress UI panel
  // ---------------------------------------------------------------------------

  function createProgressUI() {
    const root = document.createElement('div');
    root.className = 'midl-panel';
    const title = el('div', 'midl-title', 'MetaIncDL');
    const current = el('div', 'midl-current', '');
    const barWrap = el('div', 'midl-barwrap');
    const bar = el('div', 'midl-bar');
    barWrap.appendChild(bar);
    const overall = el('div', 'midl-overall', '');
    const logBox = el('div', 'midl-log');
    const cancelBtn = el('button', 'midl-cancel', 'Cancel');
    root.append(title, current, barWrap, overall, logBox, cancelBtn);
    (document.body || document.documentElement).appendChild(root);

    let cancelCb = null;
    cancelBtn.addEventListener('click', () => {
      cancelBtn.disabled = true;
      if (cancelCb) cancelCb();
    });

    return {
      setTitle: (t) => (title.textContent = t),
      setCurrent: (name, loaded, total) => {
        const pct = total ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
        current.textContent = total
          ? `${name} — ${formatBytes(loaded)} / ${formatBytes(total)}`
          : name;
        bar.style.width = pct + '%';
      },
      setOverall: (n, all) => {
        overall.textContent = `${n} / ${all}`;
      },
      log: (msg) => {
        const line = el('div', 'midl-logline', msg);
        logBox.appendChild(line);
        logBox.scrollTop = logBox.scrollHeight;
      },
      onCancel: (cb) => (cancelCb = cb),
      finish: (msg) => {
        title.textContent = msg;
        cancelBtn.textContent = 'Close';
        cancelBtn.disabled = false;
        cancelBtn.onclick = () => root.remove();
      },
    };
  }

  /** Tiny createElement helper (textContent only — never innerHTML). */
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // ---------------------------------------------------------------------------
  //  Section 10 — UI injection (route hook + observer + controls)
  // ---------------------------------------------------------------------------

  /** Is the current path a profile route (vs. a post/feed)? Returns the handle. */
  function profileHandle() {
    const seg = location.pathname.split('/').filter(Boolean);
    if (!seg.length) return null; // home / FYP
    const RESERVED = new Set([
      'explore',
      'reels',
      'direct',
      'stories',
      'accounts',
      'p',
      'reel',
      'tv',
      'watch',
      'marketplace',
      'groups',
      'events',
      'search',
    ]);
    if (RESERVED.has(seg[0].toLowerCase())) return null;
    return seg[0];
  }

  /** The "I'm authorised" gate for Stories/Highlights (one-time per session). */
  let authConfirmed = false;
  function authorised(kind) {
    if (!settings.requireAuthConfirm) return true;
    if (authConfirmed) return true;
    const ok = window.confirm(
      `Download ${kind}?\n\nStories and Highlights are often other people's content. ` +
        `Only download what you are authorised to keep.\n\nClick OK to confirm you're authorised.`,
    );
    if (ok) authConfirmed = true;
    return ok;
  }

  /** Run a profile bulk download for a given content kind. */
  async function downloadProfileKind(handle, kind) {
    if (!adapter) return;
    if ((kind === 'stories' || kind === 'highlights') && !authorised(kind)) return;
    if (!captureReady() && PLATFORM === 'instagram') {
      notify(
        'MetaIncDL',
        'Interact with the page (scroll once) so MetaIncDL can read the session, then retry.',
      );
      return;
    }
    try {
      const { id, owner } = await adapter.resolveUser(handle);
      let items = [];
      const label = `${owner} — ${kind}`;
      if (kind === 'photos' || kind === 'videos' || kind === 'all') {
        const gen = adapter.profileTimeline(id, owner);
        items = await collect(gen, {});
        if (kind === 'photos') items = items.filter((i) => i.kind === 'image');
        if (kind === 'videos') items = items.filter((i) => i.kind === 'video');
      } else if (kind === 'stories') {
        items = await collect(await adapter.stories(id, owner), {});
      } else if (kind === 'highlights') {
        items = await collect(await adapter.highlights(id, owner), {});
      } else if (kind === 'reels') {
        items = await collect(adapter.reels(id, owner), {});
      }
      if (
        settings.confirm &&
        !window.confirm(`Download ${items.length} ${kind} item(s) from ${owner}?`)
      ) {
        return;
      }
      await runJob(items, label);
    } catch (err) {
      notify('MetaIncDL', `Error: ${err.message}`);
    }
  }

  /** Bulk-download the user's own home/FYP feed (capped). */
  async function downloadFyp() {
    if (!adapter || !settings.fypBulk) return;
    if (typeof adapter.profileTimeline !== 'function') return;
    notify('MetaIncDL', `Grabbing up to ${settings.fypCap} items from your feed…`);
    // The home feed enumerates via the same timeline mechanism on most surfaces;
    // for IG it's /api/v1/feed/timeline/. Implemented best-effort.
    try {
      const items = await collect(homeFeedGenerator(), { cap: settings.fypCap });
      if (settings.confirm && !window.confirm(`Download ${items.length} item(s) from your feed?`))
        return;
      await runJob(items, 'My feed');
    } catch (err) {
      notify('MetaIncDL', `Feed error: ${err.message}`);
    }
  }

  /** IG home-timeline generator (best-effort; other platforms: none). */
  async function* homeFeedGenerator() {
    if (PLATFORM !== 'instagram') return;
    let maxId = '';
    let more = true;
    while (more && !cancelRequested) {
      await windowGate();
      const form = new URLSearchParams();
      if (maxId) form.set('max_id', maxId);
      let data;
      try {
        data = await apiPost('/api/v1/feed/timeline/', form);
      } catch (err) {
        if (err.checkpoint) throw err;
        break;
      }
      for (const wrap of (data && data.feed_items) || []) {
        const node = wrap.media_or_ad;
        if (node) for (const it of toItems(node, baseNameFor(node, 'feed'))) yield it;
      }
      const next = data.next_max_id || '';
      more = !!data.more_available && !!next && next !== maxId;
      maxId = next;
      if (more) await politePause();
    }
  }

  // ----- control construction -----

  /** Build the profile "⬇ Download ▾" dropdown. */
  function buildProfileDropdown(handle) {
    const wrap = el('div', 'midl-dd');
    const btn = el('button', 'midl-dd-btn', '⬇ Download ▾');
    const menu = el('div', 'midl-dd-menu');
    const opts = [
      ['photos', 'Timeline Photos', settings.dlPhotos],
      ['videos', 'Timeline Videos', settings.dlVideos],
      ['stories', 'Stories', settings.dlStories],
      ['reels', 'Reels', settings.dlReels],
      ['highlights', 'Highlights', settings.dlHighlights],
      ['all', 'Download All', true],
    ];
    for (const [kind, label, on] of opts) {
      if (!on) continue;
      const item = el('button', 'midl-dd-item', label);
      item.addEventListener('click', () => {
        menu.style.display = 'none';
        downloadProfileKind(handle, kind);
      });
      menu.appendChild(item);
    }
    btn.addEventListener('click', () => {
      menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
    });
    wrap.append(btn, menu);
    return wrap;
  }

  /** Mount the profile dropdown near the header (structural anchor). */
  function mountProfileControl() {
    if (!settings.profileDropdown || !adapter) return;
    const handle = profileHandle();
    if (!handle) return;
    const existing = document.getElementById('midl-profile-ctl');
    if (existing) {
      // Already mounted — but on profile→profile SPA navigation the old control
      // closes over the PREVIOUS handle, so rebuild when the handle changes.
      if (existing.dataset.handle === handle) return;
      existing.remove();
    }
    const host = el('div', null);
    host.id = 'midl-profile-ctl';
    host.className = 'midl-float';
    host.dataset.handle = handle;
    host.appendChild(buildProfileDropdown(handle));
    (document.body || document.documentElement).appendChild(host);
  }

  /** Mount a floating "feed grab" control on the home route. */
  function mountFeedControl() {
    if (!settings.fypBulk || !adapter || PLATFORM !== 'instagram') return;
    if (profileHandle()) return; // only on home
    if (location.pathname !== '/') return;
    if (document.getElementById('midl-feed-ctl')) return;
    const host = el('div', 'midl-float');
    host.id = 'midl-feed-ctl';
    const btn = el('button', 'midl-dd-btn', `⬇ Download feed (≤${settings.fypCap})`);
    btn.addEventListener('click', downloadFyp);
    host.appendChild(btn);
    (document.body || document.documentElement).appendChild(host);
  }

  /** If the current route is a single post/reel permalink, return its shortcode
   *  (the per-item overlay target); else null. IG: /p|reel|tv/<code>/. Threads:
   *  /@user/post/<code> or /t/<code>. FB permalinks aren't shortcode-addressable
   *  the same way, so the overlay there is best-effort via the captured query. */
  function postPermalink() {
    const seg = location.pathname.split('/').filter(Boolean);
    if (PLATFORM === 'instagram') {
      if (['p', 'reel', 'tv'].includes((seg[0] || '').toLowerCase()) && seg[1]) return seg[1];
    } else if (PLATFORM === 'threads') {
      const i = seg.indexOf('post');
      if (i >= 0 && seg[i + 1]) return seg[i + 1];
      if ((seg[0] || '').toLowerCase() === 't' && seg[1]) return seg[1];
    }
    return null;
  }

  /** Resolve + download a single post/reel by shortcode (overlay action). */
  async function downloadSinglePost(code) {
    if (!adapter) return;
    if (!captureReady() && PLATFORM === 'instagram') {
      notify('MetaIncDL', 'Scroll/interact once so MetaIncDL can read the session, then retry.');
      return;
    }
    try {
      const owner = (profileOwnerFromPath() || PLATFORM).toString();
      const items = await adapter.single(code, owner);
      await runJob(items, `${owner} - post`);
    } catch (err) {
      notify('MetaIncDL', `Error: ${err.message}`);
    }
  }

  /** Best-effort owner handle from a permalink path (e.g. /@user/post/x). */
  function profileOwnerFromPath() {
    const m = /\/@([^/]+)\//.exec(location.pathname);
    return m ? m[1] : '';
  }

  /** Mount the per-item overlay download button on a single-post route. */
  function mountPostOverlay() {
    if (!settings.overlayIcon || !adapter) return;
    const code = postPermalink();
    if (!code) return;
    if (document.getElementById('midl-post-ctl')) return;
    const host = el('div', 'midl-float');
    host.id = 'midl-post-ctl';
    const btn = el('button', 'midl-dd-btn', '⬇ Download this post');
    btn.addEventListener('click', () => downloadSinglePost(code));
    host.appendChild(btn);
    (document.body || document.documentElement).appendChild(host);
  }

  /** SPA route change handler — Meta apps navigate client-side. */
  function onRouteChange() {
    // Remove stale controls; re-mount for the new route.
    const old = document.getElementById('midl-profile-ctl');
    if (old && !profileHandle()) old.remove();
    const oldFeed = document.getElementById('midl-feed-ctl');
    if (oldFeed && location.pathname !== '/') oldFeed.remove();
    const oldPost = document.getElementById('midl-post-ctl');
    if (oldPost && !postPermalink()) oldPost.remove();
    mountProfileControl();
    mountFeedControl();
    mountPostOverlay();
  }

  /** Hook history.pushState/replaceState + popstate to detect SPA navigation. */
  function installRouteHook() {
    const fire = () => setTimeout(onRouteChange, 300);
    for (const m of ['pushState', 'replaceState']) {
      const orig = history[m];
      history[m] = function () {
        const r = orig.apply(this, arguments);
        fire();
        return r;
      };
    }
    window.addEventListener('popstate', fire);
    // Safety net: re-check periodically (virtualised DOM recycles nodes).
    setInterval(onRouteChange, 3000);
  }

  // ---------------------------------------------------------------------------
  //  Section 11 — settings menu (live-label register/refresh)
  // ---------------------------------------------------------------------------

  let menuCommandIds = [];

  function refreshMenu() {
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
    const add = (label, fn) => menuCommandIds.push(GM_registerMenuCommand(label, fn));
    const changed = (msg) => {
      if (msg) notify('MetaIncDL', msg);
      refreshMenu();
    };
    const toggle = (label, key) => {
      add(`${label} (current: ${settings[key] ? 'on' : 'off'})`, () => {
        saveSetting(key, !settings[key]);
        changed(`${label}: ${settings[key] ? 'on' : 'off'}.`);
      });
    };
    const num = (label, key, unit) => {
      add(`${label} (current: ${settings[key]}${unit || ''})`, () => {
        const v = window.prompt(`${label}:`, String(settings[key]));
        if (v == null) return;
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0)
          return notify('MetaIncDL', 'Enter a non-negative number.');
        saveSetting(key, n);
        changed(`${label} set to ${n}${unit || ''}.`);
      });
    };

    toggle('Profile Download dropdown', 'profileDropdown');
    toggle('Per-item overlay icon', 'overlayIcon');
    toggle('Timeline Photos', 'dlPhotos');
    toggle('Timeline Videos', 'dlVideos');
    toggle('Stories', 'dlStories');
    toggle('Reels', 'dlReels');
    toggle('Highlights', 'dlHighlights');
    toggle('Own feed / FYP bulk download', 'fypBulk');
    num('Feed / FYP item cap', 'fypCap', '');
    toggle('Authorisation gate (Stories/Highlights)', 'requireAuthConfirm');
    toggle('ZIP bundling', 'zip');
    num('Max ZIP size', 'maxZipMB', ' MiB');
    add(`Compression (current: ${settings.compression})`, () => {
      saveSetting('compression', settings.compression === 'STORE' ? 'DEFLATE' : 'STORE');
      changed(`Compression set to ${settings.compression}.`);
    });
    toggle('Save via GM_download', 'useGmDownload');
    toggle('Pre-flight confirmation', 'confirm');
    add(`webp fallback (current: ${settings.webpFallback})`, () => {
      const order = { png: 'jpg', jpg: 'keep', keep: 'png' };
      saveSetting('webpFallback', order[settings.webpFallback] || 'png');
      changed(`webp fallback: ${settings.webpFallback} (native JPEG is always tried first).`);
    });
    num('Delay between pages', 'pageDelayMs', ' ms');
    num('Delay jitter', 'jitterMs', ' ms');
    num('CDN download concurrency', 'cdnConcurrency', '');
    num('Enumeration window cap (/11 min)', 'windowCap', '');
    add('Reset MetaIncDL settings to defaults', () => {
      for (const k of Object.keys(DEFAULTS)) saveSetting(k, DEFAULTS[k]);
      changed('Settings reset to defaults.');
    });
  }

  // ---------------------------------------------------------------------------
  //  Section 12 — bootstrap
  // ---------------------------------------------------------------------------

  // The capture hooks MUST install before the app boots — do it synchronously,
  // right now, at document-start.
  if (PLATFORM) installCaptureHooks();

  /** Inject the panel/control styles. */
  function injectStyles() {
    const css = `
      .midl-float{position:fixed;z-index:2147483600;bottom:20px;right:20px;font-family:system-ui,Arial,sans-serif}
      .midl-dd{position:relative}
      .midl-dd-btn,.midl-cancel{background:#0a84ff;color:#fff;border:0;border-radius:8px;padding:9px 14px;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.3)}
      .midl-dd-menu{display:none;position:absolute;bottom:46px;right:0;background:#1c1c1e;border:1px solid #3a3a3c;border-radius:8px;overflow:hidden;min-width:180px;box-shadow:0 6px 20px rgba(0,0,0,.4)}
      .midl-dd-item{display:block;width:100%;text-align:left;background:none;border:0;color:#fff;padding:10px 14px;font-size:13px;cursor:pointer}
      .midl-dd-item:hover{background:#0a84ff}
      .midl-panel{position:fixed;z-index:2147483601;bottom:20px;right:20px;width:340px;background:#1c1c1e;color:#fff;border:1px solid #3a3a3c;border-radius:12px;padding:14px;font-family:system-ui,Arial,sans-serif;font-size:13px;box-shadow:0 8px 30px rgba(0,0,0,.5)}
      .midl-title{font-weight:700;margin-bottom:8px}
      .midl-current{opacity:.85;margin-bottom:6px;word-break:break-all;min-height:1.2em}
      .midl-barwrap{height:6px;background:#3a3a3c;border-radius:3px;overflow:hidden;margin-bottom:6px}
      .midl-bar{height:100%;width:0;background:#0a84ff;transition:width .2s}
      .midl-overall{opacity:.7;margin-bottom:6px}
      .midl-log{max-height:120px;overflow:auto;font-size:11px;opacity:.75;margin-bottom:8px}
      .midl-cancel{width:100%}
    `;
    try {
      GM_addStyle(css);
    } catch {
      const s = el('style');
      s.textContent = css;
      (document.head || document.documentElement).appendChild(s);
    }
  }

  function wireUI() {
    if (!PLATFORM) return;
    injectStyles();
    registerMenu();
    installRouteHook();
    onRouteChange(); // mounts the profile dropdown, feed grab, and post overlay
    // The route hook re-runs onRouteChange on every SPA navigation + a periodic
    // safety tick, so controls follow client-side route changes.
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireUI, { once: true });
  } else {
    wireUI();
  }
})();
