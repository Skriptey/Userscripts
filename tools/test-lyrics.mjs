// Offline tests for the lyrics + internal-data code in scripts/deezer/deezer.user.js.
// Run: node tools/test-lyrics.mjs   (or: npm test)
//
// WHY THIS FILE EXISTS: the userscripts ship verbatim with no build step, so there
// is nothing to `import`. Instead of copying the functions into the test (which would
// test a copy that can drift), this file reads the real userscript, cuts out the
// named top-level pieces it needs, and runs THOSE. A rename or a deleted helper in
// the script therefore fails here loudly.
//
// All lyrics below are MADE UP (never real lyrics — copyright). Dependency-free:
// Node built-ins only. Needs the `unzip` command for the ZIP integrity check; if it
// is missing that one check is skipped with a notice.
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEEZER_PATH = join(ROOT, 'scripts/deezer/deezer.user.js');
const SRC = readFileSync(DEEZER_PATH, 'utf8');
const LINES = SRC.split('\n');

// ---------------------------------------------------------------------------
//  Extraction: cut a top-level (2-space indented) declaration out of the IIFE.
// ---------------------------------------------------------------------------

/** Return the source text of the top-level declaration called `name`
 *  (function, async function, const or let). Fails loudly when it is missing. */
function extract(name) {
  const re = new RegExp(
    `^  (?:async function ${name}\\(|function ${name}\\(|(?:const|let) ${name}\\b)`,
  );
  const start = LINES.findIndex((l) => re.test(l));
  assert.ok(start >= 0, `declaration not found in deezer.user.js: ${name}`);
  const first = LINES[start];
  const blockStyle = /^ {2}(?:async )?function /.test(first) || /[{(]\s*$/.test(first);
  for (let j = start; j < LINES.length; j++) {
    const l = LINES[j];
    if (blockStyle) {
      if (j > start && /^ {2}(?:\}|\};|\}\)\(\);)$/.test(l))
        return LINES.slice(start, j + 1).join('\n');
    } else if (/;\s*(\/\/.*)?$/.test(l) && (j === start || /^ {4}/.test(l))) {
      return LINES.slice(start, j + 1).join('\n');
    }
  }
  throw new Error(`end of declaration not found: ${name}`);
}

/** Build a sandbox from the named pieces. `env` supplies the page-side things the
 *  pieces use (settings, fetchJson, …); `exports` lists the names to hand back. */
function load(names, exports, env = {}) {
  const body = names.map(extract).join('\n\n');
  const keys = Object.keys(env);
  const fn = new Function(...keys, `${body}\nreturn { ${exports.join(', ')} };`);
  return fn(...keys.map((k) => env[k]));
}

const LYRIC_FILES = [
  'CRC_TABLE',
  'crc32',
  'buildStoreZip',
  'secToLrc',
  'lyricsToWordLrc',
  'lyricsToLineLrc',
  'lyricsToPlain',
  'safeName',
  'lyricsFileStem',
  'TIER_RANK',
];
const LYRIC_PARSE = ['LYRICS_SLACK_SEC', 'msToSec', 'timingOverruns', 'parseDeezerLyrics'];

// ---------------------------------------------------------------------------
//  Tiny test runner
// ---------------------------------------------------------------------------

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// ---------------------------------------------------------------------------
//  Made-up sample data (times in milliseconds, like Deezer's reply)
// ---------------------------------------------------------------------------

const WORD_LINES = [
  {
    start: 12340,
    end: 14000,
    words: [
      { start: 12340, end: 12800, word: 'Blue' },
      { start: 12800, end: 13100, word: '' }, // empty word → dropped
      { start: 13100, end: 14000, word: ' lanterns ' }, // padded → trimmed
    ],
  },
  { start: 15000, end: 15500, words: [{ start: 15000, end: 15500, word: 'Hum' }] },
  { start: 16000, end: 17000, words: [{ start: 16000, end: 17000, word: '   ' }] }, // all empty → line dropped
];
const SYNC_LINES = [
  { lrcTimestamp: '[00:20.00]', line: 'Second made-up line', milliseconds: 20000, duration: 2000 },
  {
    lrcTimestamp: '[00:12.34]',
    line: 'First made-up line',
    milliseconds: '12340',
    duration: '1500',
  },
  { lrcTimestamp: '[00:30.00]', line: '   ', milliseconds: 30000, duration: 1000 }, // blank → dropped
];
const RAW = {
  id: '1',
  text: 'First made-up line\r\nSecond made-up line\r\n',
  synchronizedLines: SYNC_LINES,
  synchronizedWordByWordLines: WORD_LINES,
};

// ---------------------------------------------------------------------------
//  Parsers and writers
// ---------------------------------------------------------------------------

test('word tier: spaces added between words, empties dropped, A2 LRC format', () => {
  const { parseDeezerLyrics, lyricsToWordLrc } = load(
    [...LYRIC_FILES, ...LYRIC_PARSE],
    ['parseDeezerLyrics', 'lyricsToWordLrc'],
  );
  const parsed = parseDeezerLyrics(RAW, 200);
  assert.ok(parsed.word);
  assert.equal(parsed.word.lines.length, 2);
  assert.equal(
    lyricsToWordLrc(parsed.word),
    '[00:12.34]<00:12.34>Blue <00:13.10>lanterns\n[00:15.00]<00:15.00>Hum',
  );
});

test('line tier: sorted by time, blank lines dropped, uses milliseconds + duration', () => {
  const { parseDeezerLyrics, lyricsToLineLrc } = load(
    [...LYRIC_FILES, ...LYRIC_PARSE],
    ['parseDeezerLyrics', 'lyricsToLineLrc'],
  );
  const parsed = parseDeezerLyrics(RAW, 200);
  assert.equal(
    lyricsToLineLrc(parsed.line),
    '[00:12.34]First made-up line\n[00:20.00]Second made-up line',
  );
  assert.equal(parsed.line.lines[0].end, 12.34 + 1.5);
});

test('static tier: text split on CRLF; falls back to timed text when text is missing', () => {
  const { parseDeezerLyrics, lyricsToPlain } = load(
    [...LYRIC_FILES, ...LYRIC_PARSE],
    ['parseDeezerLyrics', 'lyricsToPlain'],
  );
  assert.equal(
    lyricsToPlain(parseDeezerLyrics(RAW, 200).static),
    'First made-up line\nSecond made-up line',
  );
  const noText = { ...RAW, text: null };
  assert.equal(
    lyricsToPlain(parseDeezerLyrics(noText, 200).static),
    'First made-up line\nSecond made-up line',
  );
});

test('timing that runs past the track length drops that tier (word → line → static)', () => {
  const { parseDeezerLyrics } = load(LYRIC_PARSE.concat(LYRIC_FILES), ['parseDeezerLyrics']);
  // Track is 10 s long; the word timing ends at 15.5 s and the lines at 22 s.
  const parsed = parseDeezerLyrics(RAW, 10);
  assert.equal(parsed.word, null);
  assert.equal(parsed.line, null);
  assert.ok(parsed.static, 'static text is never dropped');
  // Within 2 s of the end is still fine.
  assert.ok(parseDeezerLyrics(RAW, 21).line);
  // Unknown length (0) disables the check.
  assert.ok(parseDeezerLyrics(RAW, 0).word);
});

test('null / empty lyrics give no tiers', () => {
  const { parseDeezerLyrics } = load(LYRIC_PARSE.concat(LYRIC_FILES), ['parseDeezerLyrics']);
  assert.deepEqual(parseDeezerLyrics(null, 100), { word: null, line: null, static: null });
  assert.deepEqual(parseDeezerLyrics({ text: '', synchronizedLines: [] }, 100), {
    word: null,
    line: null,
    static: null,
  });
});

test('file stem and timestamps', () => {
  const { lyricsFileStem, secToLrc } = load(LYRIC_FILES, ['lyricsFileStem', 'secToLrc']);
  assert.equal(lyricsFileStem({ disc: 2, track: 3, name: 'A/B: C' }), '2 - 03 - A_B_ C');
  assert.equal(secToLrc(63.48), '[01:03.48]');
});

// ---------------------------------------------------------------------------
//  Token + request logic with a fake fetchJson
// ---------------------------------------------------------------------------

const LYRICS_NAMES = [
  'AUTH_RENEW_URL',
  'AUTH_ANON_URL',
  'PIPE_URL',
  'JWT_TTL_MS',
  'LYRICS_QUERY',
  'jwtState',
  'jwtInflight',
  'mintJwt',
  'getLyricsJwt',
  'graphqlErrorTypes',
  'fetchDeezerLyrics',
];

/** Fake network. `script.renew` / `script.anon` / `script.pipe` are functions. */
function lyricsEnv(script, settings = { lyricsAnonymous: false }) {
  const calls = [];
  const fetchJson = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.includes('login/renew')) return script.renew(init);
    if (url.includes('login/anonymous')) return script.anon(init);
    if (url.startsWith('https://pipe.deezer.com')) return script.pipe(init, calls);
    throw new Error(`unexpected url ${url}`);
  };
  const mod = load(LYRICS_NAMES, ['fetchDeezerLyrics', 'getLyricsJwt'], {
    fetchJson,
    settings,
    console: { log() {}, warn() {} },
  });
  return { ...mod, calls };
}
const bearer = (init) => init.headers.Authorization;

test('lyrics request: uses the login token and the GraphQL shape', async () => {
  const env = lyricsEnv({
    renew: () => ({ jwt: 'tok-1' }),
    pipe: () => ({ data: { track: { lyrics: { text: 'x' } } } }),
  });
  const r = await env.fetchDeezerLyrics(42);
  assert.equal(r.text, 'x');
  const pipe = env.calls.find((c) => c.url.includes('pipe.deezer.com'));
  assert.equal(bearer(pipe.init), 'Bearer tok-1');
  const body = JSON.parse(pipe.init.body);
  assert.equal(body.operationName, 'GetLyrics');
  assert.equal(body.variables.trackId, '42', 'track id is sent as a string');
  assert.equal(pipe.init.credentials, 'omit');
  const renew = env.calls.find((c) => c.url.includes('login/renew'));
  assert.equal(renew.init.credentials, 'include');
});

test('lyrics request: expired token is replaced once and retried once', async () => {
  let n = 0;
  const env = lyricsEnv({
    renew: () => ({ jwt: `tok-${++n}` }),
    pipe: (init) =>
      bearer(init) === 'Bearer tok-1'
        ? { errors: [{ message: 'x', extensions: { type: 'JwtTokenExpiredError' } }] }
        : { data: { track: { lyrics: { text: 'ok' } } } },
  });
  assert.equal((await env.fetchDeezerLyrics(1)).text, 'ok');
  assert.equal(n, 2, 'exactly one replacement token');
});

test('lyrics request: a second expiry does not loop', async () => {
  const env = lyricsEnv({
    renew: () => ({ jwt: 'tok' + Math.random() }),
    pipe: () => ({ errors: [{ type: 'JwtTokenInvalidError' }] }),
  });
  await assert.rejects(() => env.fetchDeezerLyrics(1), /token rejected/);
  assert.equal(env.calls.filter((c) => c.url.includes('pipe.deezer.com')).length, 2);
});

test('lyrics request: HTTP 401 also gets one retry; 429 is passed on with its status', async () => {
  let n = 0;
  const env = lyricsEnv({
    renew: () => ({ jwt: `t${++n}` }),
    pipe: (init) => {
      if (bearer(init) === 'Bearer t1') throw Object.assign(new Error('HTTP 401'), { status: 401 });
      throw Object.assign(new Error('HTTP 429'), { status: 429 });
    },
  });
  await assert.rejects(
    () => env.fetchDeezerLyrics(1),
    (err) => err.status === 429,
  );
});

test('lyrics request: "no lyrics" error types (either location) return null', async () => {
  for (const errors of [
    [{ type: 'LyricsNotFoundError' }],
    [{ extensions: { type: 'TrackNotFoundError' } }],
  ]) {
    const env = lyricsEnv({ renew: () => ({ jwt: 't' }), pipe: () => ({ errors }) });
    assert.equal(await env.fetchDeezerLyrics(1), null);
  }
  const env = lyricsEnv({
    renew: () => ({ jwt: 't' }),
    pipe: () => ({ data: { track: { lyrics: null } } }),
  });
  assert.equal(await env.fetchDeezerLyrics(1), null);
});

test('lyrics request: an unknown GraphQL error is a real error', async () => {
  const env = lyricsEnv({
    renew: () => ({ jwt: 't' }),
    pipe: () => ({ errors: [{ type: 'SomethingNewError', message: 'boom' }] }),
  });
  await assert.rejects(() => env.fetchDeezerLyrics(1), /SomethingNewError/);
});

test('token: logged out + anonymous OFF fails with status "login", anon route not called', async () => {
  const env = lyricsEnv({
    renew: () => {
      throw Object.assign(new Error('HTTP 401'), { status: 401 });
    },
    anon: () => ({ jwt: 'anon' }),
    pipe: () => ({}),
  });
  await assert.rejects(
    () => env.getLyricsJwt(),
    (err) => err.status === 'login',
  );
  assert.equal(
    env.calls.some((c) => c.url.includes('anonymous')),
    false,
  );
});

test('token: anonymous ON falls back to the anonymous token; concurrent callers share one request', async () => {
  const env = lyricsEnv(
    {
      renew: () => ({}), // logged out: no jwt
      anon: () => ({ jwt: 'anon-tok' }),
      pipe: () => ({}),
    },
    { lyricsAnonymous: true },
  );
  const toks = await Promise.all([env.getLyricsJwt(), env.getLyricsJwt(), env.getLyricsJwt()]);
  assert.deepEqual(toks, ['anon-tok', 'anon-tok', 'anon-tok']);
  assert.equal(env.calls.filter((c) => c.url.includes('anonymous')).length, 1);
});

// ---------------------------------------------------------------------------
//  trackLyrics: tier fallback
// ---------------------------------------------------------------------------

test('trackLyrics: word → line → static fallback and raw json option', async () => {
  const build = (raw, settings = { lyricsRawJson: false }) =>
    load([...LYRIC_FILES, ...LYRIC_PARSE, 'trackLyrics'], ['trackLyrics'], {
      fetchDeezerLyrics: async () => raw,
      settings,
    }).trackLyrics;
  const t = { id: 1, duration: 200 };

  const word = await build(RAW, { lyricsRawJson: true })(t, 'word');
  assert.equal(word.kind, 'word');
  assert.equal(word.ext, 'lrc');
  assert.ok(Array.isArray(word.rawWords));
  assert.equal((await build(RAW)(t, 'word')).rawWords, null, 'raw json is opt-in');

  const noWords = { ...RAW, synchronizedWordByWordLines: null };
  assert.equal((await build(noWords)(t, 'word')).kind, 'line');
  assert.equal((await build(RAW)(t, 'line')).kind, 'line');

  const textOnly = { text: 'Only made-up text' };
  const st = await build(textOnly)(t, 'word');
  assert.deepEqual([st.kind, st.ext, st.text], ['static', 'txt', 'Only made-up text']);
  assert.equal((await build(RAW)(t, 'static')).kind, 'static');

  assert.equal(await build(null)(t, 'word'), null);
});

// ---------------------------------------------------------------------------
//  gw-light layer
// ---------------------------------------------------------------------------

const GW_NAMES = [
  'GW_URL',
  'GW_METHODS',
  'gwToken',
  'gwTokenInflight',
  'GW_ROLE_LABELS',
  'gwRoleLabel',
  'gwErrorKeys',
  'gwRaw',
  'getGwToken',
  'gwCall',
  'fetchGwAlbum',
  'fetchGwTrack',
  'pickGwSong',
  'mergeGw',
];

const SECRET_SONG = {
  SNG_ID: '111',
  SNG_TITLE: 'Made Up Song',
  TRACK_TOKEN: 'SECRET-TRACK-TOKEN',
  MD5_ORIGIN: 'SECRET-MD5',
  MEDIA: [{ TYPE: 'MP3_128', HREF: 'https://secret.example/stream' }],
  MEDIA_VERSION: '9',
  RIGHTS: { STREAM_ADS: true },
  USER_TOKEN: 'SECRET-USER',
  FILESIZE_FLAC: '31457280',
  FILESIZE_MP3_320: '0',
  FILESIZE_MP3_128: '4000000',
  FILESIZE_MP4_RA1: '0',
  FILESIZE_MP4_RA2: '0',
  FILESIZE_MP4_RA3: '0',
  LYRICS_ID: 777,
  SNG_CONTRIBUTORS: {
    main_artist: ['Test Artist'],
    author: ['Writer One', 'Writer Two'],
    composer: ['Writer One'],
    'music publisher': ['Pub Co'],
    custom_role_x: ['Someone'],
    empty_role: [],
  },
};

function gwEnv(handler) {
  const calls = [];
  const fetchJson = async (url, init = {}) => {
    const u = new URL(url);
    const call = {
      method: u.searchParams.get('method'),
      token: u.searchParams.get('api_token'),
      body: JSON.parse(init.body || '{}'),
      credentials: init.credentials,
    };
    calls.push(call);
    return handler(call, calls);
  };
  const mod = load(GW_NAMES, ['gwCall', 'fetchGwAlbum', 'fetchGwTrack', 'pickGwSong', 'mergeGw'], {
    fetchJson,
    URLSearchParams,
  });
  return { ...mod, calls };
}

test('gw-light: pickGwSong copies only named fields (no tokens or stream data)', () => {
  const { pickGwSong } = gwEnv(() => ({}));
  const picked = pickGwSong(SECRET_SONG);
  assert.deepEqual(Object.keys(picked).sort(), ['credits', 'hasLyrics', 'id', 'quality']);
  const text = JSON.stringify(picked);
  for (const bad of ['SECRET', 'TRACK_TOKEN', 'MD5_ORIGIN', 'MEDIA', 'RIGHTS', 'secret.example'])
    assert.ok(!text.includes(bad), `leaked: ${bad}`);
  assert.deepEqual(picked.quality, { flac: true, mp3_320: false, mp3_128: true, ra360: false });
  assert.equal(picked.hasLyrics, true);
  assert.equal(pickGwSong({ SNG_ID: 1 }).hasLyrics, undefined, 'missing LYRICS_ID is "unknown"');
  assert.equal(pickGwSong({ SNG_ID: 2, LYRICS_ID: '0' }).hasLyrics, false);
  assert.equal(pickGwSong({}), null);
});

test('gw-light: FILESIZE strings become flags; all-zero is all-false', () => {
  const { pickGwSong } = gwEnv(() => ({}));
  const zero = pickGwSong({
    SNG_ID: 1,
    FILESIZE_FLAC: '0',
    FILESIZE_MP3_320: '0',
    FILESIZE_MP3_128: '0',
    FILESIZE_MP4_RA2: '0',
  });
  assert.deepEqual(zero.quality, { flac: false, mp3_320: false, mp3_128: false, ra360: false });
  assert.equal(pickGwSong({ SNG_ID: 1, FILESIZE_MP4_RA3: '12' }).quality.ra360, true);
});

test('gw-light: credits get readable labels, unknown roles Title Case, empties dropped', () => {
  const { pickGwSong } = gwEnv(() => ({}));
  const roles = Object.fromEntries(pickGwSong(SECRET_SONG).credits.map((c) => [c.role, c.names]));
  assert.deepEqual(roles['Lyricist'], ['Writer One', 'Writer Two']);
  assert.deepEqual(roles['Main artist'], ['Test Artist']);
  assert.deepEqual(roles['Music publisher'], ['Pub Co']);
  assert.deepEqual(roles['Custom Role X'], ['Someone']);
  assert.ok(!('Empty Role' in roles));
});

test('gw-light: mergeGw unions formats, merges credits without duplicates, keeps only picked data', () => {
  const { mergeGw } = gwEnv(() => ({}));
  const model = { tracks: [{ id: 111 }, { id: 222 }, { id: 333 }] };
  mergeGw(model, [
    SECRET_SONG,
    {
      SNG_ID: '222',
      FILESIZE_MP3_320: '5',
      LYRICS_ID: 0,
      SNG_CONTRIBUTORS: { author: ['Writer Two', 'Writer Three'] },
    },
  ]);
  assert.equal(model.gw, true);
  assert.deepEqual(model.gwQuality, { flac: true, mp3_320: true, mp3_128: true, ra360: false });
  const lyricist = model.gwCredits.find((c) => c.role === 'Lyricist');
  assert.deepEqual(lyricist.names.sort(), ['Writer One', 'Writer Three', 'Writer Two']);
  assert.equal(model.tracks[1].hasLyrics, false);
  assert.equal(model.tracks[2].quality, undefined, 'unmatched track untouched');
  assert.ok(!JSON.stringify(model).includes('SECRET'));
  assert.throws(() => mergeGw({ tracks: [{ id: 9 }] }, [SECRET_SONG]), /no tracks matched/);
});

test('gw-light: a method that is not on the allow-list is refused before any request', async () => {
  const env = gwEnv(() => {
    throw new Error('network must not be touched');
  });
  for (const m of ['song.updateData', 'user.addFavorite', 'deezer.pageTrack', 'playlist.delete'])
    await assert.rejects(() => env.gwCall(m, {}), /not allowed/);
  assert.equal(env.calls.length, 0);
});

test('gw-light: token flow — getUserData first, same-origin cookies, token reused', async () => {
  const env = gwEnv((call) =>
    call.method === 'deezer.getUserData'
      ? { error: [], results: { checkForm: 'CSRF-1', USER: { USER_ID: 0 } } }
      : { error: [], results: { data: [SECRET_SONG] } },
  );
  const songs = await env.fetchGwAlbum(5);
  assert.equal(songs.length, 1);
  assert.deepEqual(
    env.calls.map((c) => c.method),
    ['deezer.getUserData', 'song.getListByAlbum'],
  );
  assert.equal(env.calls[0].token, 'null');
  assert.equal(env.calls[1].token, 'CSRF-1');
  assert.deepEqual(env.calls[1].body, { ALB_ID: '5', nb: -1 });
  assert.ok(env.calls.every((c) => c.credentials === 'same-origin'));
  await env.fetchGwTrack(7);
  assert.equal(env.calls.filter((c) => c.method === 'deezer.getUserData').length, 1);
  assert.deepEqual(env.calls.at(-1).body, { SNG_ID: '7' });
});

test('gw-light: invalid-token reply refreshes once, then gives up', async () => {
  let n = 0;
  const env = gwEnv((call) => {
    if (call.method === 'deezer.getUserData')
      return { error: [], results: { checkForm: `CSRF-${++n}` } };
    return call.token === 'CSRF-1'
      ? { error: { VALID_TOKEN_REQUIRED: 'Invalid CSRF token' }, results: [] }
      : { error: [], results: { data: [] } };
  });
  assert.deepEqual(await env.fetchGwAlbum(1), []);
  assert.equal(n, 2);

  const stuck = gwEnv((call) =>
    call.method === 'deezer.getUserData'
      ? { error: [], results: { checkForm: 'X' } }
      : { error: { GATEWAY_ERROR: 'invalid api token' }, results: [] },
  );
  await assert.rejects(() => stuck.fetchGwAlbum(1), /GATEWAY_ERROR/);
  assert.equal(stuck.calls.filter((c) => c.method === 'song.getListByAlbum').length, 2);
});

test('gw-light: other errors surface only their KEYS, not values', async () => {
  const env = gwEnv((call) =>
    call.method === 'deezer.getUserData'
      ? { error: [], results: { checkForm: 'X' } }
      : { error: { SOME_KEY: 'value with details' }, results: [] },
  );
  await assert.rejects(
    () => env.fetchGwAlbum(1),
    (err) => err.message.includes('SOME_KEY') && !err.message.includes('details'),
  );
});

// ---------------------------------------------------------------------------
//  ZIP writer: build a real archive and let `unzip -t` verify it
// ---------------------------------------------------------------------------

test('buildStoreZip output passes unzip -t and round-trips file contents', async () => {
  const { buildStoreZip } = load(['CRC_TABLE', 'crc32', 'buildStoreZip'], ['buildStoreZip'], {
    TextEncoder,
    Blob,
  });
  const files = [
    { name: '1 - 01 - Made Up One.lrc', text: '[00:12.34]<00:12.34>Blue <00:13.10>lanterns' },
    { name: '1 - 02 - Made Up Two.txt', text: 'Only made-up text\nSecond line — ünïcode ✓' },
    { name: '1 - 01 - Made Up One.json', text: JSON.stringify(WORD_LINES, null, 2) },
  ];
  const blob = buildStoreZip(files);
  assert.equal(blob.type, 'application/zip');
  const dir = mkdtempSync(join(tmpdir(), 'dze-zip-'));
  try {
    const zipPath = join(dir, 'lyrics.zip');
    writeFileSync(zipPath, Buffer.from(await blob.arrayBuffer()));
    const probe = spawnSync('unzip', ['-v'], { encoding: 'utf8' });
    if (probe.error) {
      console.log('    (unzip not installed — integrity check skipped)');
      return;
    }
    const t = spawnSync('unzip', ['-t', zipPath], { encoding: 'utf8' });
    assert.equal(t.status, 0, `unzip -t failed:\n${t.stdout}\n${t.stderr}`);
    assert.match(t.stdout, /No errors detected/);
    for (const f of files) {
      const p = spawnSync('unzip', ['-p', zipPath, f.name], { encoding: 'utf8' });
      assert.equal(p.stdout, f.text);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
//  Code-reading guards
// ---------------------------------------------------------------------------

test('every network call goes through the timed helpers', () => {
  const code = LINES.filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  // Plain fetch( appears only in fetchJson, plus the existing cover-art download.
  const plainFetch = code.match(/\bawait fetch\(|\(await fetch\(|[^.\w]fetch\(/g) || [];
  assert.ok(plainFetch.length <= 2, `unexpected plain fetch( calls: ${plainFetch.length}`);
  // GM_xmlhttpRequest only inside gmRequest, which always sets a timeout.
  assert.equal((code.match(/GM_xmlhttpRequest\(/g) || []).length, 1);
  assert.match(extract('gmRequest'), /timeout: ms/);
  assert.match(extract('gmRequest'), /ontimeout/);
  assert.match(extract('gmRequest'), /onabort/);
  assert.match(extract('gmRequest'), /onerror/);
});

test('secrets and lyric text are never written to the console or GM storage', () => {
  const logLines = LINES.filter((l) => /console\.(log|warn|error)/.test(l));
  // A console call runs until the line that closes it with `);` — join those lines.
  const logText = LINES.map((l, i) => {
    if (!/console\.(log|warn|error)/.test(l)) return '';
    let j = i;
    while (j < LINES.length && !/\);\s*$/.test(LINES[j])) j++;
    return LINES.slice(i, j + 1).join(' ');
  }).join('\n');
  assert.ok(logLines.length > 0);
  assert.ok(
    !/\bjwt\b|gwToken|checkForm|Bearer|\braw\b|\br\.text|\blyr\b|\.rawWords/.test(logText),
    'a log line mentions a token or lyric text',
  );
  // The token variables are never passed to GM_setValue.
  assert.ok(!/GM_setValue\([^)]*(jwt|gwToken)/i.test(SRC));
  // Opt-in defaults requested by the owner.
  const defaults = extract('DEFAULTS');
  for (const k of ['downloadLyrics', 'lyricsAnonymous', 'lyricsRawJson', 'gwEnrich'])
    assert.match(defaults, new RegExp(`${k}: false`));
  for (const k of ['gwLossless', 'gwCredits']) assert.match(defaults, new RegExp(`${k}: true`));
});

// ---------------------------------------------------------------------------
//  Run
// ---------------------------------------------------------------------------

let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    console.log(`  ok   ${name}`);
  } catch (err) {
    failed++;
    console.log(
      `  FAIL ${name}\n       ${String(err.stack || err)
        .split('\n')
        .join('\n       ')}`,
    );
  }
}
console.log(`\n${tests.length - failed}/${tests.length} test(s) passed.`);
process.exit(failed ? 1 : 0);
