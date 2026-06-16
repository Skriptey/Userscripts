// Validate every scripts/<slug>/*.user.js metadata block.
// Exits 1 (failing CI) if any script is missing required metadata.
// Run: node tools/validate-metadata.mjs
// SPDX-License-Identifier: GPL-3.0-or-later

import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFile, validateMetadata } from './lib/meta.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPTS_DIR = join(ROOT, 'scripts');

let checked = 0;
let failed = 0;

if (!existsSync(SCRIPTS_DIR)) {
  console.warn('⚠ scripts/ directory not found — nothing to validate.');
} else {
  for (const slug of readdirSync(SCRIPTS_DIR).sort()) {
    const dir = join(SCRIPTS_DIR, slug);
    if (!statSync(dir).isDirectory()) continue;
    const files = readdirSync(dir).filter((f) => f.endsWith('.user.js'));
    if (files.length === 0) {
      console.error(`✗ ${slug}: folder has no .user.js file`);
      failed++;
      continue;
    }
    for (const f of files) {
      checked++;
      const rel = `scripts/${slug}/${f}`;
      try {
        const { meta } = parseFile(join(dir, f));
        const problems = validateMetadata(meta);
        if (problems.length) {
          failed++;
          console.error(`✗ ${rel}`);
          for (const p of problems) console.error(`    - ${p}`);
        } else {
          console.log(`✓ ${rel}`);
        }
      } catch (err) {
        failed++;
        console.error(`✗ ${rel}: ${err.message}`);
      }
    }
  }
}

console.log(`\n${checked} script(s) checked, ${failed} problem file(s).`);
process.exit(failed ? 1 : 0);
