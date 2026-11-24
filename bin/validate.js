#!/usr/bin/env node
'use strict';

// Validate XML files (default: tmp/ pub/) against their detected IP-XACT / SPIRIT
// XSD schema using xmllint and local schemas under accellera.org/XMLSchema/.
//
// Usage:
//   node bin/validate.js [options] [file-or-dir ...]
//     -q, --fail-only   only print FAIL entries (omit PASS lines)
//     -s, --summary     print summary tables only (no per-file lines)
//     -j, --jobs N      parallel xmllint workers (default: 8)
//     -h, --help        show this help

const fs = require('node:fs/promises');
const path = require('node:path');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const onml = require('onml');

const {detect} = require('../lib/versions.js');

const execFileAsync = promisify(execFile);
const root = path.resolve(__dirname, '..');

const printHelp = async () => {
  const src = (await fs.readFile(__filename, 'utf8')).split('\n');
  const start = src.findIndex(l => l.startsWith('//'));
  const doc = [];
  for (let k = start; k < src.length && src[k].startsWith('//'); k++) {
    doc.push(src[k].slice(3));
  }
  console.log(doc.join('\n'));
};

const parseArgs = async argv => {
  const opt = {failOnly: false, summary: false, jobs: 8, targets: []};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-q' || a === '--fail-only') {
      opt.failOnly = true;
    } else if (a === '-s' || a === '--summary') {
      opt.summary = true;
    } else if (a === '-j' || a === '--jobs') {
      opt.jobs = Math.max(1, +argv[++i] || 1);
    } else if (a === '-h' || a === '--help') {
      await printHelp();
      process.exit(0);
    } else if (a.startsWith('-')) {
      console.error(`unknown arg ${a}`);
      process.exit(2);
    } else {
      opt.targets.push(a);
    }
  }
  return opt;
};

const fileExists = async p => {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
};

const collectXml = async (targets, explicit) => {
  const files = [];
  for (const target of targets) {
    const abs = path.resolve(root, target);
    if (!(await fileExists(abs))) {
      if (explicit) { console.error(`skip (not found): ${target}`); }
      continue;
    }
    const stat = await fs.stat(abs);
    if (stat.isFile()) {
      files.push(abs);
    } else if (stat.isDirectory()) {
      const entries = await fs.readdir(abs, {recursive: true, withFileTypes: true});
      for (const e of entries) {
        if (e.isFile() && e.name.toLowerCase().endsWith('.xml')) {
          files.push(path.join(e.parentPath || abs, e.name));
        }
      }
    }
  }
  return files.sort();
};

const checkXmllint = async () => {
  try {
    await execFileAsync('xmllint', ['--version']);
  } catch {
    console.error('error: xmllint not found in PATH');
    process.exit(1);
  }
};

const pool = async (items, n, fn) => {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({length: Math.min(n, items.length)}, async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k], k);
    }
  }));
  return out;
};

const treeGroupOf = rel => {
  const parts = rel.split(path.sep);
  if (parts[0] === 'pub' && parts.length >= 4) {
    return parts.slice(0, 3).join('/');
  }
  if (parts[0] === 'pub' && parts.length === 3) {
    return parts.slice(0, 2).join('/') + ' (loose)';
  }
  return parts[0] || '.';
};

const validateFile = async file => {
  const rel = path.relative(root, file);
  const group = treeGroupOf(rel);
  let doc;
  try {
    doc = onml.parse(await fs.readFile(file, 'utf8'));
  } catch (err) {
    return {rel, group, ok: false, version: 'parse-error', kind: '-', detail: err.message};
  }

  const kind = String(doc[0] || '').split(':').pop() || '-';
  const ver = detect(doc);
  if (!ver) {
    return {rel, group, ok: false, version: 'unknown', kind, detail: 'unrecognized IP-XACT / SPIRIT namespace'};
  }

  const xsd = path.join(root, 'accellera.org', 'XMLSchema', ver.dir, 'index.xsd');
  if (!(await fileExists(xsd))) {
    return {rel, group, ok: false, version: ver.id, kind, detail: `missing schema: ${path.relative(root, xsd)} (run "npm run fetch")`};
  }

  try {
    await execFileAsync('xmllint', ['--noout', '--schema', xsd, file], {maxBuffer: 16 * 1024 * 1024});
    return {rel, group, ok: true, version: ver.id, kind};
  } catch (err) {
    const detail = (err.stderr || err.stdout || err.message || '').trim();
    return {rel, group, ok: false, version: ver.id, kind, detail};
  }
};

const printGroupTable = (title, results, keyFn) => {
  const map = new Map();
  for (const r of results) {
    const k = keyFn(r);
    const s = map.get(k) || {pass: 0, fail: 0};
    if (r.ok) { s.pass++; } else { s.fail++; }
    map.set(k, s);
  }
  console.log(`\n== ${title}`);
  const keys = [...map.keys()].sort();
  const width = Math.max(12, ...keys.map(k => k.length)) + 2;
  for (const k of keys) {
    const s = map.get(k);
    const total = s.pass + s.fail;
    console.log(`  ${k.padEnd(width)} ${String(s.pass).padStart(4)}/${String(total).padEnd(4)} passed${s.fail ? ` (${s.fail} failed)` : ''}`);
  }
};

const main = async () => {
  const opt = await parseArgs(process.argv.slice(2));
  await checkXmllint();

  const explicit = opt.targets.length > 0;
  const targets = explicit ? opt.targets : ['tmp', 'pub'];

  const files = await collectXml(targets, explicit);
  if (files.length === 0) {
    console.log('no XML files found');
    return;
  }

  const results = await pool(files, opt.jobs, validateFile);

  let passed = 0;
  let failed = 0;
  for (const res of results) {
    if (res.ok) {
      passed++;
      if (!opt.summary && !opt.failOnly) {
        console.log(`PASS [${res.version} ${res.kind}] ${res.rel}`);
      }
    } else {
      failed++;
      if (!opt.summary) {
        console.log(`FAIL [${res.version} ${res.kind}] ${res.rel}`);
        if (res.detail) {
          for (const line of res.detail.split('\n')) {
            console.log('  ' + line);
          }
        }
      }
    }
  }

  if (results.length > 1) {
    printGroupTable('by version', results, r => r.version);
    printGroupTable('by kind', results, r => r.kind);
    printGroupTable('by tree', results, r => r.group);
  }

  console.log(`\nSummary: ${passed}/${results.length} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
};

main().catch(err => {
  console.error(err);
  process.exit(1);
});
