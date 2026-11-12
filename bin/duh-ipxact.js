#!/usr/bin/env node
'use strict';

const fs = require('fs-extra');
const {program} = require('commander');
const json5 = require('json5');
const onml = require('onml');
const duhCore = require('duh-core');

const duh2spirit = require('../lib/duh2spirit.js');
const ml2on = require('../lib/ml2on.js');
const ipxactSchemas = require('../lib/ipxact-schemas.js');

// duh -> spirit
const metaxml = '<?xml version="1.0" encoding="UTF-8"?>\n';

const duh2spiritHandler = version => async argv => {
  if (argv.verbose) {
    console.log('duh2spirit');
  }
  const duhObj = await duhCore.readDuh({filename: argv.duh});
  const spiritObj = duh2spirit(duhObj, version);
  let spiritStr;
  try {
    spiritStr = metaxml + onml.stringify(spiritObj, 2);
  } catch {
    throw new Error(json5.stringify(spiritObj, null, 2));
  }
  if (argv.spirit) {
    await fs.outputFile(argv.spirit, spiritStr);
  } else {
    console.log(spiritStr);
  }
};

// ipxact -> duh
const ipxact2duhHandler = async argv => {
  if (argv.verbose) {
    console.log('ipxact2duh');
  }
  const ipxactStr = await fs.readFile(argv.ipxact, 'utf8');
  const ipxactObj = onml.parse(ipxactStr);
  const duhObj = ml2on(ipxactObj);
  const duhStr = json5.stringify(duhObj, null, 2) + '\n';
  if (argv.duh) {
    fs.outputFile(argv.duh, duhStr);
  } else {
    console.log(duhStr);
  }
};

const fetchText = async url => {
  const resp = await fetch(url); // global fetch, follows redirects
  if (!resp.ok) {
    throw new Error(url + ' : HTTP ' + resp.status);
  }
  return resp.text();
};

// fetch IPXACT files
const fetchIpxactSchemasHandler = async argv => {
  if (argv.verbose) {
    console.log('fetch IPXACT schemas');
  }
  await Promise.all(ipxactSchemas.map(async leaf => {
    const body = await fetchText('http://' + leaf);
    await fs.outputFile(leaf, body);
  }));
};

const verbose = () => program.opts().verbose;

program
  .name('duh-ipxact')
  .option('-v, --verbose', 'verbose output', false);

program
  .command('duh2spirit14 <duh> [spirit]')
  .description('convert DUH file to Spirit 1.4 file')
  .action((duh, spirit) =>
    duh2spiritHandler('spirit14')({duh, spirit, verbose: verbose()}));

program
  .command('duh2spirit <duh> [spirit]')
  .description('convert DUH file to Spirit 2009 file')
  .action((duh, spirit) =>
    duh2spiritHandler('spirit2009')({duh, spirit, verbose: verbose()}));

program
  .command('ipxact2duh <ipxact> [duh]')
  .description('convert IPXACT file to DUH file')
  .action((ipxact, duh) =>
    ipxact2duhHandler({ipxact, duh, verbose: verbose()}));

program
  .command('fetch')
  .description('download IPXACT, SPIRIT schemas')
  .action(() => fetchIpxactSchemasHandler({verbose: verbose()}));

program.parseAsync();
