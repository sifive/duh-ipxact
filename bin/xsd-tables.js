#!/usr/bin/env node
'use strict';

// Generate lib/xsd/<version>.json content-model tables from fetched XSDs.
// Run `duh-ipxact fetch` first (downloads into accellera.org/).

const fs = require('fs');
const path = require('path');
const onml = require('onml');

const table = require('../lib/xsd/table.js');
const {versions} = require('../lib/versions.js');

const root = path.resolve(__dirname, '..');

versions.map(v => {
  const dir = path.join(root, 'accellera.org', 'XMLSchema', v.dir);
  const docs = {};
  fs.readdirSync(dir).filter(f => f.endsWith('.xsd')).map(f => {
    docs[f] = onml.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  });
  const t = table(docs);
  if (t.ns !== v.ns) {
    throw new Error(v.id + ': namespace mismatch ' + t.ns);
  }
  const out = path.join(root, 'lib', 'xsd', v.id + '.json');
  fs.writeFileSync(out, JSON.stringify(t, null, 2) + '\n');
  console.log(v.id, Object.keys(t.types).length, 'types', t.elements.length, 'elements', fs.statSync(out).size, 'bytes');
});
