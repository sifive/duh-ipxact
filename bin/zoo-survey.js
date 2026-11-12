#!/usr/bin/env node
'use strict';

// Local survey of real-world IP-XACT files (default dirs: tmp/ pub/).
// Reports, per standard version, which XSD elements / parent→child pairs
// are used and how often. Full report written to tmp/survey.json
// (git-ignored). Stdout carries only counts and XSD vocabulary — never
// file names or document content.
//
// usage: node bin/zoo-survey.js [dir ...]

const fs = require('fs');
const path = require('path');
const onml = require('onml');

const {detect} = require('../lib/versions.js');
const {walk} = require('../lib/xsd/walk.js');
const check = require('../lib/xsd/check.js');

const root = path.resolve(__dirname, '..');
const dirs = process.argv.slice(2);
if (dirs.length === 0) { dirs.push('tmp', 'pub'); }

const files = [];
const rec = dir => {
  if (!fs.existsSync(dir)) { return; }
  fs.readdirSync(dir, {withFileTypes: true}).map(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { rec(p); } else if (e.name.endsWith('.xml')) { files.push(p); }
  });
};
dirs.map(d => rec(path.resolve(root, d)));

const tables = {};
const getTable = id => tables[id] || (tables[id] = require('../lib/xsd/' + id + '.json'));

const report = {};
let skipped = 0;

files.map(f => {
  let doc;
  try {
    doc = onml.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    skipped++;
    return;
  }
  const v = detect(doc);
  if (!v) { skipped++; return; }
  const t = getTable(v.id);
  const r = report[v.id] || (report[v.id] = {
    files: 0, roots: {}, elements: {}, pairs: {}, unknown: {}, errors: {}, opaque: 0
  });
  r.files++;
  const rname = doc[0].split(':').pop();
  r.roots[rname] = (r.roots[rname] || 0) + 1;
  walk(t, doc, (node, {name, type, parentType}) => {
    if (type === '*') { r.opaque++; return; }
    if (type === undefined) { r.unknown[name] = (r.unknown[name] || 0) + 1; return; }
    r.elements[name] = (r.elements[name] || 0) + 1;
    const pair = (parentType || '') + ' > ' + name;
    r.pairs[pair] = (r.pairs[pair] || 0) + 1;
  });
  check(t, doc).map(e => {
    // keep only structural part of message (strip values)
    const key = e.replace(/'[^']*'/g, '\'…\'');
    r.errors[key] = (r.errors[key] || 0) + 1;
  });
});

Object.keys(report).sort().map(id => {
  const r = report[id];
  const t = getTable(id);
  const used = t.elements.filter(e => r.elements[e]);
  r.coverage = {used: used.length, total: t.elements.length};
  r.unused = t.elements.filter(e => !r.elements[e]);
  console.log(
    id + ': ' + r.files + ' files, roots ' + JSON.stringify(r.roots) +
    ', XSD elements used ' + used.length + '/' + t.elements.length +
    ', pairs ' + Object.keys(r.pairs).length +
    ', opaque nodes ' + r.opaque +
    ', unknown ' + Object.keys(r.unknown).length +
    ', check errors ' + Object.values(r.errors).reduce((a, b) => a + b, 0)
  );
  Object.keys(r.errors).map(e => console.log('  ' + r.errors[e] + 'x ' + e));
});
if (skipped) { console.log('skipped (unparsable / unknown version): ' + skipped); }

const out = path.join(root, 'tmp', 'survey.json');
fs.mkdirSync(path.dirname(out), {recursive: true});
fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
console.log('report: tmp/survey.json');
