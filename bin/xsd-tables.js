#!/usr/bin/env node
'use strict';

// Generate lib/xsd/<version>.json content-model tables from fetched XSDs.
// Run `duh-ipxact fetch` first (downloads into accellera.org/).

const fs = require('node:fs/promises');
const path = require('node:path');
const onml = require('onml');

const table = require('../lib/xsd/table.js');
const {versions} = require('../lib/versions.js');

const root = path.resolve(__dirname, '..');

const main = async () => {
  for (const v of versions) {
    const dir = path.join(root, 'accellera.org', 'XMLSchema', v.dir);
    const files = (await fs.readdir(dir)).filter(f => f.endsWith('.xsd'));
    const docs = {};
    for (const f of files) {
      docs[f] = onml.parse(await fs.readFile(path.join(dir, f), 'utf8'));
    }
    const t = table(docs);
    if (t.ns !== v.ns) {
      throw new Error(v.id + ': namespace mismatch ' + t.ns);
    }
    const out = path.join(root, 'lib', 'xsd', v.id + '.json');
    await fs.writeFile(out, JSON.stringify(t, null, 2) + '\n');
    const st = await fs.stat(out);
    console.log(v.id, Object.keys(t.types).length, 'types', t.elements.length, 'elements', st.size, 'bytes');
  }
};

main().catch(err => {
  console.error(err);
  process.exit(1);
});
