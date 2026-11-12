#!/usr/bin/env node
'use strict';

// Local survey of real-world IP-XACT files (default dirs: tmp/ pub/).
// Reports, per standard version, which XSD elements / parent→child pairs
// are used and how often. Full report written to tmp/survey.json
// (git-ignored). Stdout carries only counts and XSD vocabulary — never
// file names or document content.
//
// usage: node bin/zoo-survey.js [dir ...]

const fs = require('node:fs/promises');
const path = require('node:path');
const onml = require('onml');

const {detect} = require('../lib/versions.js');
const {walk} = require('../lib/xsd/walk.js');
const check = require('../lib/xsd/check.js');

const root = path.resolve(__dirname, '..');
const dirs = process.argv.slice(2);
if (dirs.length === 0) { dirs.push('tmp', 'pub'); }

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

const tables = {};
const getTable = id => tables[id] || (tables[id] = require('../lib/xsd/' + id + '.json'));

const main = async () => {
  const files = [];
  for (const d of dirs) {
    const xmlFiles = await listXml(path.resolve(root, d));
    files.push(...xmlFiles);
  }

  const report = {};
  let skipped = 0;

  for (const f of files) {
    let doc;
    try {
      doc = onml.parse(await fs.readFile(f, 'utf8'));
    } catch {
      skipped++;
      continue;
    }
    const v = detect(doc);
    if (!v) { skipped++; continue; }
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
      const key = e.replace(/'[^']*'/g, '\'…\'');
      r.errors[key] = (r.errors[key] || 0) + 1;
    });
  }

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
  await fs.mkdir(path.dirname(out), {recursive: true});
  await fs.writeFile(out, JSON.stringify(report, null, 2) + '\n');
  console.log('report: tmp/survey.json');
};

main().catch(err => {
  console.error(err);
  process.exit(1);
});
