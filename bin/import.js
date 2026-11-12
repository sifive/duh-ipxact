#!/usr/bin/env node

'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const onml = require('onml');
const JSON5 = require('json5');

const ml2on = require('../lib/ml2on.js');

const xmlExp = new RegExp('\\w+.xml', 'i');

const outputFile = async (file, data) => {
  await fs.mkdir(path.dirname(file), {recursive: true});
  await fs.writeFile(file, data);
};

const walker = (ipath, opath) =>
  async function traverse (fpath) {
    const fullPath = path.resolve(ipath, fpath);
    const stats = await fs.stat(fullPath);
    if (stats.isDirectory()) {
      console.log('DIR:', fpath);
      const files = await fs.readdir(fullPath);
      for (let i = 0; i < files.length; i++) {
        await traverse(fpath + '/' + files[i]);
      }
    } else if (stats.isFile()) {
      console.log('FILE:', fpath);
      if (fpath.match(xmlExp)) {
        const basename = path.basename(fpath, '.xml');
        const dirname = path.dirname(fpath);
        const xdoc = await fs.readFile(path.resolve(ipath, fpath), 'utf8');
        const jdoc = onml.parse(xdoc);
        const odoc = ml2on(jdoc);
        const sdoc = JSON5.stringify(odoc, null, 2);
        await outputFile(path.resolve(opath, dirname, basename + '.json5'), sdoc);
      }
    } else {
      console.log('???:');
    }
  };

walker(
  path.resolve(process.cwd(), './import'),
  path.resolve(process.cwd(), './specs')
)('.').catch(console.error);

/* eslint no-console: 0 */
