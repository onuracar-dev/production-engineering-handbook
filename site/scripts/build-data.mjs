import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const outDir = path.resolve(__dirname, '../public/data');

const readmePath = path.join(root, 'README.md');
if (!fs.existsSync(readmePath)) {
  throw new Error(`Root README.md not found at ${readmePath}`);
}
const readme = fs.readFileSync(readmePath, 'utf8').split(/\r?\n/);

// Extract domain blurbs
const blurbs = {};
for (const l of readme) {
  const m = l.match(/[├└]── (\d\d-[a-z-]+)\/\s*# (.+)$/);
  if (m) blurbs[m[1]] = m[2].trim();
}

import { SPINE, HEIGHTS } from '../src/config.js';

// Extract books and cases from Quick Problem Index
const start = readme.findIndex((l) => l.startsWith('## ⚡ Quick'));
if (start === -1) {
  throw new Error('Quick Problem Index section not found in root README.md');
}
const end = readme.findIndex((l, i) => i > start && l.startsWith('## '));
const books = [];
for (const l of readme.slice(start, end === -1 ? undefined : end)) {
  let m = l.match(/^### \S+ \[(\d+)\. (.+?)\]/);
  if (m) {
    books.push({ n: +m[1], name: m[2], cases: [] });
    continue;
  }
  m = l.match(/^\* \[\*\*(.+?)\*\*\]\(#(.+?)\)/);
  if (m) {
    books.at(-1).cases.push({ slug: m[2], q: m[1] });
  }
}

for (const b of books) {
  if (!SPINE[b.n - 1]) {
    throw new Error(`Missing SPINE entry for book ${b.n} (${b.name}) in src/config.js. Please add one.`);
  }
  if (!HEIGHTS[b.n - 1]) {
    throw new Error(`Missing HEIGHTS entry for book ${b.n} (${b.name}) in src/config.js. Please add one.`);
  }
}

const dirs = fs.readdirSync(root).filter((d) => /^\d\d-/.test(d));

function sections(md) {
  const out = {};
  let cur = null;
  for (const l of md.split(/\r?\n/)) {
    const h = l.match(/^## \d+\. (.+)$/);
    if (h) {
      cur = h[1].replace(/ \(.*\)$/, '').trim();
      out[cur] = [];
      continue;
    }
    if (cur && l.trim() !== '---') {
      out[cur].push(l);
    }
  }
  for (const k in out) {
    out[k] = out[k].join('\n').trim();
  }
  return out;
}

fs.mkdirSync(outDir, { recursive: true });

const indexBooks = [];
let totalCases = 0;

for (const b of books) {
  const dir = dirs.find((d) => d.startsWith(String(b.n).padStart(2, '0') + '-'));
  if (!dir) throw new Error(`Directory not found for book ${b.n}: ${b.name}`);
  b.dir = dir;
  b.blurb = blurbs[dir] || '';
  if (!b.blurb) throw new Error(`Missing directory blurb for ${dir}`);

  const fullCases = [];
  const indexCases = [];

  for (const c of b.cases) {
    totalCases++;
    const caseDir = path.join(root, dir, c.slug);
    if (!fs.existsSync(caseDir)) {
      throw new Error(`Case directory missing: ${caseDir}`);
    }
    const mdPath = path.join(caseDir, 'README.md');
    if (!fs.existsSync(mdPath)) {
      throw new Error(`Case README missing: ${mdPath}`);
    }

    const md = fs.readFileSync(mdPath, 'utf8');
    const s = sections(md);

    const problem = s['Problem'] || '';
    if (!problem) throw new Error(`Missing Problem section in ${c.slug}`);

    const naive = [];
    for (const l of (s['Why Naive Approaches Fail'] || '').split('\n')) {
      const t = l.match(/^\d+\. \*\*(.+?):?\*\*:?\s*(.*)$/);
      if (t) {
        naive.push({ t: t[1].replace(/:$/, ''), n: t[2] ? [t[2]] : [] });
      } else if (/^\s+\* /.test(l) && naive.length) {
        naive.at(-1).n.push(l.replace(/^\s+\* /, ''));
      }
    }
    if (!naive.length) throw new Error(`Missing Why Naive Approaches Fail items in ${c.slug}`);

    const arch = s['Architecture'] || '';
    if (!arch) throw new Error(`Missing Architecture section in ${c.slug}`);

    // "Verified" means a test/ folder backs the section. Cases without one use
    // "How to Run" or "Derivation" instead, which the site shows without the stamp.
    const verified = fs.existsSync(path.join(caseDir, 'test'));
    if (s['How to Verify'] && !verified) {
      throw new Error(`"How to Verify" in ${c.slug} needs a test/ folder; rename it to "How to Run" or "Derivation"`);
    }
    if (verified && !s['How to Verify']) {
      throw new Error(`${c.slug} has a test/ folder but no "How to Verify" section`);
    }
    const verifyLabel = ['How to Verify', 'How to Run', 'Derivation'].find((k) => s[k]) || '';
    const verify = verifyLabel ? s[verifyLabel] : '';
    const srcMatch = (s['Implementation'] || '').match(/\(\.\/(src\/[^)]+)\)/);
    const src = srcMatch ? srcMatch[1] : '';
    if (!src) throw new Error(`Missing Implementation src link in ${c.slug}`);

    const srcFile = path.join(caseDir, src);
    if (!fs.existsSync(srcFile)) {
      throw new Error(`Source file missing: ${srcFile} for case ${c.slug}`);
    }

    indexCases.push({ slug: c.slug, q: c.q });
    fullCases.push({
      slug: c.slug,
      q: c.q,
      problem,
      naive,
      arch,
      verify,
      verified,
      verifyLabel,
      src,
    });
  }

  indexBooks.push({
    n: b.n,
    name: b.name,
    dir: b.dir,
    blurb: b.blurb,
    cases: indexCases,
  });

  const bookFile = path.join(outDir, `book-${b.n}.json`);
  fs.writeFileSync(
    bookFile,
    JSON.stringify(
      {
        n: b.n,
        name: b.name,
        dir: b.dir,
        blurb: b.blurb,
        cases: fullCases,
      },
      null,
      2
    ) + '\n'
  );
}

const indexFile = path.join(outDir, 'index.json');
fs.writeFileSync(indexFile, JSON.stringify(indexBooks, null, 2) + '\n');

console.log(
  `[build-data] Successfully wrote ${indexBooks.length} books and ${totalCases} cases to ${outDir}`
);
