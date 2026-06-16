// Dependency-free parser + validator for userscript metadata blocks.
// Shared by tools/build-index.mjs and tools/validate-metadata.mjs.
// SPDX-License-Identifier: GPL-3.0-or-later

import { readFileSync } from 'node:fs';

/** Metadata keys that legitimately repeat and should collect into arrays. */
const MULTI_KEYS = new Set([
  'match',
  'include',
  'exclude',
  'exclude-match',
  'require',
  'resource',
  'grant',
  'connect',
  'antifeature',
  'compatible',
  'incompatible',
]);

/** Keys every script in this collection must declare. */
export const REQUIRED_KEYS = [
  'name',
  'namespace',
  'version',
  'description',
  'author',
  'license',
  'grant',
  'downloadURL',
  'updateURL',
];

/** A script must target something: at least one of these. */
export const REQUIRED_ONE_OF = ['match', 'include'];

const BLOCK_RE = /\/\/\s*==UserScript==\s*([\s\S]*?)\/\/\s*==\/UserScript==/;
const LINE_RE = /^\/\/\s*@(\S+)(?:\s+(.*))?$/;

/**
 * Parse a userscript's `// ==UserScript== ... ==/UserScript==` block.
 * Repeated keys (e.g. @match) become arrays; others become strings.
 * @param {string} source full userscript source text
 * @returns {{ meta: Record<string, string|string[]>, block: string }}
 */
export function parseMetadata(source) {
  const m = BLOCK_RE.exec(source);
  if (!m) throw new Error('no // ==UserScript== ... ==/UserScript== block found');
  const block = m[1];
  /** @type {Record<string, string|string[]>} */
  const meta = {};
  for (const rawLine of block.split(/\r?\n/)) {
    const lm = LINE_RE.exec(rawLine.trim());
    if (!lm) continue;
    const key = lm[1];
    const value = (lm[2] ?? '').trim(); // valueless keys (e.g. @noframes) -> ''
    if (MULTI_KEYS.has(key)) {
      if (!Array.isArray(meta[key])) meta[key] = [];
      meta[key].push(value);
    } else if (!(key in meta)) {
      meta[key] = value;
    }
  }
  return { meta, block };
}

/** Read + parse a userscript file from disk. */
export function parseFile(path) {
  return parseMetadata(readFileSync(path, 'utf8'));
}

/**
 * Validate parsed metadata against this repo's requirements.
 * @param {Record<string, string|string[]>} meta
 * @returns {string[]} human-readable problems (empty array == valid)
 */
export function validateMetadata(meta) {
  const problems = [];
  for (const key of REQUIRED_KEYS) {
    const v = meta[key];
    if (v == null || (Array.isArray(v) && v.length === 0) || v === '') {
      problems.push(`missing @${key}`);
    }
  }
  if (!REQUIRED_ONE_OF.some((k) => meta[k])) {
    problems.push(
      `missing a target — needs at least one of ${REQUIRED_ONE_OF.map((k) => '@' + k).join(' or ')}`,
    );
  }
  if (meta.version && !/^\d+(\.\d+){0,3}([-+.][0-9A-Za-z.-]+)?$/.test(String(meta.version))) {
    problems.push(`@version "${meta.version}" is not a valid version string`);
  }
  return problems;
}

/** First value for a key (arrays return element 0; missing returns undefined). */
export function first(meta, key) {
  const v = meta[key];
  return Array.isArray(v) ? v[0] : v;
}
