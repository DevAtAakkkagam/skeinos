// Bundle-size gate (NFR budget enforcement, run in CI after `wxt build`).
//
// For each logical entrypoint in bundle-budgets.json it sums the *gzipped* size
// of every file that entry pulls in, then fails the process if any entry exceeds
// its budget. Gzip is what matters: it reflects transfer + parse cost, and the
// content script is injected into every LLM tab so its weight is the most
// load-bearing number we track.
//
// Chunk filenames are content-hashed (they change every build), so HTML-backed
// entries (sidepanel, options) are resolved by parsing the <script src> and
// <link href> references out of their built HTML rather than hardcoding names.
//
// Zero dependencies — Node built-ins only.

import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve, dirname, join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url)) + '/..';
const configPath = resolve(root, 'bundle-budgets.json');
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const outDir = resolve(root, config.outDir);

const KB = 1024;

/** Resolve an asset reference (possibly root-absolute like "/chunks/x.js") to a path under outDir. */
function resolveAsset(ref) {
  const clean = ref.split('?')[0].split('#')[0];
  return isAbsolute(clean) ? join(outDir, clean) : join(outDir, clean);
}

/** Extract the JS/CSS assets an HTML entry loads (script src + preload/stylesheet href). */
function assetsFromHtml(htmlRel) {
  const html = readFileSync(join(outDir, htmlRel), 'utf8');
  const refs = new Set();
  const re = /(?:src|href)\s*=\s*"([^"]+\.(?:js|css))"/g;
  let m;
  while ((m = re.exec(html))) refs.add(m[1]);
  return [...refs].map(resolveAsset);
}

function gzippedBytes(filePath) {
  return gzipSync(readFileSync(filePath)).length;
}

let failed = false;
const rows = [];

for (const entry of config.entries) {
  const files = entry.html ? assetsFromHtml(entry.html) : entry.files.map(resolveAsset);
  let bytes = 0;
  for (const f of files) bytes += gzippedBytes(f);

  const kb = bytes / KB;
  const budgetKb = entry.budgetKb;
  const over = kb > budgetKb;
  if (over) failed = true;
  rows.push({
    name: entry.name,
    kb: kb.toFixed(1),
    budget: budgetKb.toFixed(1),
    pct: ((kb / budgetKb) * 100).toFixed(0) + '%',
    status: over ? 'OVER' : 'ok',
  });
}

const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);
console.log('Bundle size budget (gzipped):\n');
console.log(`  ${pad('entry', 16)} ${padL('size', 9)} ${padL('budget', 9)} ${padL('used', 6)}  status`);
console.log(`  ${'-'.repeat(16)} ${'-'.repeat(9)} ${'-'.repeat(9)} ${'-'.repeat(6)}  ------`);
for (const r of rows) {
  console.log(
    `  ${pad(r.name, 16)} ${padL(r.kb + ' KB', 9)} ${padL(r.budget + ' KB', 9)} ${padL(r.pct, 6)}  ${r.status}`,
  );
}

if (failed) {
  console.error('\n✗ Bundle size budget exceeded. Trim the entry or bump its budget in bundle-budgets.json (with a reason).');
  process.exit(1);
}
console.log('\n✓ All entries within budget.');
