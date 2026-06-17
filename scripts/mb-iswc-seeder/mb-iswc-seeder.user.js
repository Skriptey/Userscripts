// ==UserScript==
// @name          MB ISWC Seeder
// @namespace     https://github.com/Skriptey/Userscripts
// @version       1.0.0
// @description   MusicBrainz-side companion to ITAM Enhancer's "Find ISWCs": on a Work edit/create page opened from ITAM, it surfaces the ISWC and writers ITAM found (one-click copy) to speed up adding the work + writer relationships. You always review and submit — it NEVER edits MusicBrainz automatically.
// @author        Skriptey
// @license       GPL-3.0-or-later
// @match         https://musicbrainz.org/*
// @run-at        document-idle
// @grant         GM_addStyle
// @grant         GM_setClipboard
// @grant         GM_registerMenuCommand
// @grant         GM_getValue
// @grant         GM_setValue
// @grant         GM_notification
// @icon          https://musicbrainz.org/favicon.ico
// @homepageURL   https://github.com/Skriptey/Userscripts/tree/main/scripts/mb-iswc-seeder
// @supportURL    https://github.com/Skriptey/Userscripts/issues
// @downloadURL   https://skriptey.github.io/Userscripts/mb-iswc-seeder/mb-iswc-seeder.user.js
// @updateURL     https://skriptey.github.io/Userscripts/mb-iswc-seeder/mb-iswc-seeder.user.js
// ==/UserScript==

// SPDX-License-Identifier: GPL-3.0-or-later
//
// ===========================================================================
//  MB ISWC Seeder — how it works
// ===========================================================================
//
//  This is the MusicBrainz-side HALF of ITAM Enhancer's ISWC feature (Phase 2).
//  ITAM's "Find ISWCs" (on Apple Music) resolves a track's ISWC and opens a
//  MusicBrainz Work edit/create page via a "Seed MB ↗" deep-link. MusicBrainz's
//  own form seeding fills the ISWC field from `edit-work.iswcs.0`; ITAM also tacks
//  on a few `itam-*` query params (ignored by MusicBrainz) carrying the ISWC,
//  title and the writer credit it found.
//
//  This script READS those `itam-*` params and shows a small helper panel beside
//  the edit form: the seeded ISWC, the title, and the WRITERS split into a list
//  with one-click copy — so you can quickly add each as a "writer" relationship in
//  the Relationships section, then review and click "Enter edit" yourself.
//
//  ⚠️ It deliberately does NOT auto-fill the relationship editor or submit any
//  edit. Automated/unattended editing is against MusicBrainz's bot guidelines
//  (those require a registered Bot account); keeping a human on every submit is
//  exactly what makes this a normal, compliant human edit. Driving the relationship
//  editor automatically is a possible FUTURE enhancement — but only as a
//  pre-fill-for-review, never an auto-submit.
//
//  No network requests, no tokens: it only reads the URL + renders a panel.
//  This script ships verbatim (no build step). Keep these comments accurate when
//  you edit it.
// ===========================================================================

(function () {
  'use strict';

  // -------------------------------------------------------------------------
  //  Settings (one feature → one menu toggle, persisted via GM storage)
  // -------------------------------------------------------------------------

  const SHOW_KEY = 'mbis_showHelper';
  let showHelper = true;
  try {
    const v = GM_getValue(SHOW_KEY, undefined);
    if (v !== undefined && v !== null) showHelper = v;
  } catch {
    /* GM storage unavailable — keep default */
  }

  try {
    GM_registerMenuCommand(`ISWC seed helper: ${showHelper ? 'on' : 'off'}`, () => {
      showHelper = !showHelper;
      try {
        GM_setValue(SHOW_KEY, showHelper);
      } catch {
        /* ignore */
      }
      try {
        GM_notification({
          title: 'MB ISWC Seeder',
          text: `Seed helper ${showHelper ? 'on' : 'off'} (reload the page to apply)`,
          silent: true,
          timeout: 2500,
        });
      } catch {
        /* ignore */
      }
    });
  } catch {
    /* GM_registerMenuCommand unavailable */
  }

  // -------------------------------------------------------------------------
  //  Small DOM helper (textContent only — never innerHTML, so URL-sourced
  //  strings can't become an injection sink)
  // -------------------------------------------------------------------------

  /** Tiny hyperscript helper. */
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

  /** Copy + toast. */
  function copy(text, label) {
    try {
      GM_setClipboard(String(text ?? ''));
      GM_notification({
        title: 'MB ISWC Seeder',
        text: `${label || 'Copied'} ✓`,
        silent: true,
        timeout: 1500,
      });
    } catch {
      /* ignore */
    }
  }

  /** Split ITAM's free-text writer credit ("A B, C D & E F") into individual names. */
  function splitWriters(s) {
    return String(s || '')
      .split(/,|&|\/| and /i)
      .map((n) => n.trim())
      .filter(Boolean);
  }

  // -------------------------------------------------------------------------
  //  Render the helper panel when this page was seeded by ITAM
  // -------------------------------------------------------------------------

  GM_addStyle(`
    .mbis-panel { position:fixed; top:84px; right:16px; z-index:2147483646; width:300px; max-width:92vw;
      background:#fff; color:#22222a; border:1px solid #d0d0d8; border-left:4px solid #ba478f;
      border-radius:10px; padding:12px 14px; font:13px/1.45 system-ui,-apple-system,sans-serif;
      box-shadow:0 10px 34px rgba(0,0,0,.22); }
    .mbis-panel h2 { margin:0 0 2px; font-size:14px; }
    .mbis-panel .mbis-sub { margin:0 0 8px; font-size:11px; color:#6a6a76; }
    .mbis-row { margin:6px 0; }
    .mbis-row b { color:#6a6a76; font-weight:600; }
    .mbis-mono { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; user-select:all; }
    .mbis-writers { list-style:none; margin:6px 0 0; padding:0; }
    .mbis-writers li { display:flex; align-items:center; justify-content:space-between; gap:8px;
      padding:3px 0; border-top:1px solid #ededf2; }
    .mbis-copy { cursor:pointer; background:#f3eef5; border:1px solid #e0d2e6; color:#7a2e63;
      border-radius:6px; padding:2px 8px; font:600 11px system-ui,sans-serif; }
    .mbis-copy:hover { background:#ba478f; color:#fff; border-color:#ba478f; }
    .mbis-foot { margin-top:8px; font-size:11px; color:#8a8a94; }
    .mbis-close { position:absolute; top:8px; right:10px; background:none; border:0; color:#9a9aa4;
      font-size:18px; line-height:1; cursor:pointer; }
    @media (prefers-color-scheme: dark) {
      .mbis-panel { background:#23232a; color:#e8e8ee; border-color:#3a3a44; }
      .mbis-panel .mbis-sub, .mbis-row b, .mbis-foot { color:#a0a0aa; }
      .mbis-writers li { border-top-color:#33333c; }
      .mbis-copy { background:#3a2c38; border-color:#5a3a52; color:#e8b8d8; }
    }
  `);

  /** Only act on a Work create/edit page that ITAM seeded (`?itam=1`). */
  function maybeRenderHelper() {
    if (!showHelper) return;
    if (document.querySelector('.mbis-panel')) return;
    const params = new URLSearchParams(location.search);
    if (params.get('itam') !== '1') return;
    if (!/^\/work\/(create|[0-9a-f-]{36}\/edit)/.test(location.pathname)) return;

    const iswc = params.get('itam-iswc') || params.get('edit-work.iswcs.0') || '';
    const title = params.get('itam-title') || params.get('edit-work.name') || '';
    const writers = splitWriters(params.get('itam-writers'));

    const panel = el('div', { class: 'mbis-panel' });
    panel.append(
      el('button', {
        class: 'mbis-close',
        text: '×',
        title: 'Dismiss',
        onclick: () => panel.remove(),
      }),
    );
    panel.append(el('h2', { text: 'ITAM → MusicBrainz' }));
    panel.append(
      el('p', { class: 'mbis-sub', text: 'Seeded from ITAM Enhancer — review and submit below.' }),
    );

    if (title)
      panel.append(
        el('div', { class: 'mbis-row' }, el('b', { text: 'Work: ' }), el('span', { text: title })),
      );
    if (iswc) {
      panel.append(
        el(
          'div',
          { class: 'mbis-row' },
          el('b', { text: 'ISWC: ' }),
          el('span', { class: 'mbis-mono', text: iswc }),
          ' ',
          el('button', {
            class: 'mbis-copy',
            text: 'Copy',
            onclick: () => copy(iswc, 'ISWC copied'),
          }),
        ),
      );
    }

    if (writers.length) {
      panel.append(
        el('div', { class: 'mbis-row' }, el('b', { text: `Writers (${writers.length}):` })),
      );
      const ul = el('ul', { class: 'mbis-writers' });
      for (const w of writers) {
        ul.append(
          el(
            'li',
            {},
            el('span', { text: w }),
            el('button', {
              class: 'mbis-copy',
              text: 'Copy',
              onclick: () => copy(w, 'Writer copied'),
            }),
          ),
        );
      }
      panel.append(ul);
    }

    panel.append(
      el('p', {
        class: 'mbis-foot',
        text: writers.length
          ? 'Add each writer as a “writer” relationship in the Relationships section, then click “Enter edit”. This helper never edits MusicBrainz for you.'
          : 'Review the seeded ISWC and submit. This helper never edits MusicBrainz for you.',
      }),
    );
    document.body.append(panel);
  }

  maybeRenderHelper();
})();
