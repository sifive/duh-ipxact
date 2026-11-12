#!/usr/bin/env node
'use strict';

// Local leak guard: fail if identifiers / text values from private inputs
// (default tmp/) show up in committed synthetic zoo (test/zoo/).
// Skips (exit 0) when private dir does not exist (CI).
//
// Flags:
//  - exact leaf text / attribute values (length >= 4) shared with zoo
//  - identifier-like tokens (contain `_`, digit, or inner capital; length >= 4)
// XSD vocabulary (element / attribute names, enumeration values) ignored.
//
// usage: node bin/zoo-check.js [privateDir] [zooDir]

const fs = require('node:fs/promises');
const path = require('node:path');
const onml = require('onml');

const {versions} = require('../lib/versions.js');

const root = path.resolve(__dirname, '..');
const privDir = path.resolve(root, process.argv[2] || 'tmp');
const zooDir = path.resolve(root, process.argv[3] || 'test/zoo');

const fileExists = async p => {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
};

const listXml = async dir => {
  const res = [];
  if (!(await fileExists(dir))) {
    return res;
  }
  const entries = await fs.readdir(dir, {recursive: true, withFileTypes: true});
  for (const e of entries) {
    if (e.isFile() && e.name.endsWith('.xml')) {
      res.push(path.join(e.parentPath || dir, e.name));
    }
  }
  return res;
};

// XSD vocabulary
const vocab = new Set(['true', 'false']);
versions.map(v => {
  let t;
  try { t = require('../lib/xsd/' + v.id + '.json'); } catch { return; }
  t.elements.map(e => vocab.add(e));
  Object.values(t.types).map(d => {
    (d.enum || []).map(e => vocab.add(e));
    (d.attrs || []).map(a => vocab.add(a.name));
  });
});

const skipAttr = k => k.startsWith('xmlns') || k.endsWith('schemaLocation');

const values = async file => {
  const res = [];
  const rec = node => {
    if (typeof node === 'string') { res.push(node.trim()); return; }
    if (!Array.isArray(node)) { return; }
    const attr = node[1] || {};
    Object.keys(attr).filter(k => !skipAttr(k)).map(k => res.push(String(attr[k]).trim()));
    node.slice(2).map(rec);
  };
  rec(onml.parse(await fs.readFile(file, 'utf8')));
  return res.filter(e => e.length > 0);
};

const isIdent = tok => tok.length >= 4 && (/[_0-9]/.test(tok) || /[a-z][A-Z]/.test(tok));

const collect = async files => {
  const leaves = new Set();
  const idents = new Set();
  for (const f of files) {
    const vals = await values(f);
    for (const v of vals) {
      if (v.length >= 4 && !vocab.has(v) && !/^[-+0-9xXa-fA-F'hbd.]+$/.test(v)) { leaves.add(v); }
      (v.match(/[A-Za-z_][A-Za-z0-9_]*/g) || [])
        .filter(t => isIdent(t) && !vocab.has(t))
        .map(t => idents.add(t));
    }
  }
  return {leaves, idents};
};

const main = async () => {
  if (!(await fileExists(privDir))) {
    console.log('zoo-check: no private dir, skipped');
    process.exit(0);
  }

  const priv = await collect(await listXml(privDir));
  const zoo = await collect(await listXml(zooDir));

  const hits = [];
  zoo.leaves.forEach(v => { if (priv.leaves.has(v)) { hits.push('value: ' + v); } });
  zoo.idents.forEach(v => { if (priv.idents.has(v)) { hits.push('token: ' + v); } });

  if (hits.length) {
    console.log('zoo-check: ' + hits.length + ' leak(s) from private inputs:');
    hits.map(h => console.log('  ' + h));
    process.exit(1);
  }
  console.log('zoo-check: ok');
};

main().catch(err => {
  console.error(err);
  process.exit(1);
});
