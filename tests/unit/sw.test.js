import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = fileURLToPath(new URL('../../app/', import.meta.url));

/** @param {string} dir @returns {Promise<string[]>} */
async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

test('Service Worker cached alle App-Dateien (Offline-Vollständigkeit)', async () => {
  const sw = await readFile(join(appDir, 'sw.js'), 'utf8');
  const listed = new Set([...sw.matchAll(/'\.\/([^']+)'/g)].map((m) => m[1]));
  const files = (await walk(appDir))
    .map((f) => relative(appDir, f).split('\\').join('/'))
    .filter((f) => f !== 'sw.js' && !f.endsWith('icon-maskable.svg'));
  const missing = files.filter((f) => !listed.has(f));
  assert.deepEqual(missing, [], `Nicht im Cache: ${missing.join(', ')}`);
  const stale = [...listed].filter((f) => !files.includes(f));
  assert.deepEqual(stale, [], `Im Cache, aber nicht vorhanden: ${stale.join(', ')}`);
});
