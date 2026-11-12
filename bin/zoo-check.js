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

const fs = require('fs');
const path = require('path');
const onml = require('onml');

const {versions} = require('../lib/versions.js');

const root = path.resolve(__dirname, '..');
const privDir = path.resolve(root, process.argv[2] || 'tmp');
const zooDir = path.resolve(root, process.argv[3] || 'test/zoo');

if (!fs.existsSync(privDir)) {
  console.log('zoo-check: no private dir, skipped');
  process.exit(0);
}

const listXml = dir => {
  const res = [];
  const rec = d => fs.readdirSync(d, {withFileTypes: true}).map(e => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { rec(p); } else if (e.name.endsWith('.xml')) { res.push(p); }
  });
  if (fs.existsSync(dir)) { rec(dir); }
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

const values = file => {
  const res = [];
  const rec = node => {
    if (typeof node === 'string') { res.push(node.trim()); return; }
    if (!Array.isArray(node)) { return; }
    const attr = node[1] || {};
    Object.keys(attr).filter(k => !skipAttr(k)).map(k => res.push(String(attr[k]).trim()));
    node.slice(2).map(rec);
  };
  rec(onml.parse(fs.readFileSync(file, 'utf8')));
  return res.filter(e => e.length > 0);
};

const isIdent = tok => tok.length >= 4 && (/[_0-9]/.test(tok) || /[a-z][A-Z]/.test(tok));

const collect = files => {
  const leaves = new Set();
  const idents = new Set();
  files.map(f => values(f).map(v => {
    if (v.length >= 4 && !vocab.has(v) && !/^[-+0-9xXa-fA-F'hbd.]+$/.test(v)) { leaves.add(v); }
    (v.match(/[A-Za-z_][A-Za-z0-9_]*/g) || [])
      .filter(t => isIdent(t) && !vocab.has(t))
      .map(t => idents.add(t));
  }));
  return {leaves, idents};
};

const priv = collect(listXml(privDir));
const zoo = collect(listXml(zooDir));

const hits = [];
zoo.leaves.forEach(v => { if (priv.leaves.has(v)) { hits.push('value: ' + v); } });
zoo.idents.forEach(v => { if (priv.idents.has(v)) { hits.push('token: ' + v); } });

if (hits.length) {
  console.log('zoo-check: ' + hits.length + ' leak(s) from private inputs:');
  hits.map(h => console.log('  ' + h));
  process.exit(1);
}
console.log('zoo-check: ok');
