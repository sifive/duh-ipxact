#!/usr/bin/env node
'use strict';

const yargs = require('yargs');
const json5 = require('json5');
const onml = require('onml');
const fs = require('fs-extra');
const fetch = require('node-fetch');

const duh2spirit = require('../lib/duh2spirit.js');
const ml2on = require('../lib/ml2on.js');
const ipxactSchemas = require('../lib/ipxact-schemas.js');

// duh -> spirit
const metaxml = '<?xml version="1.0" encoding="UTF-8"?>\n';

const duh2spiritHandler = version => async argv => {
  if (argv.verbose) {
    console.log('duh2spirit');
  }
  const duhStr = await fs.readFile(argv.duh, 'utf8');
  const duhObj = json5.parse(duhStr);
  const spiritObj = duh2spirit(duhObj, version);
  let spiritStr;
  try {
    spiritStr = metaxml + onml.stringify(spiritObj, 2);
  } catch (err) {
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
  const duhStr = json5.stringify(duhObj, null, 2);
  if (argv.duh) {
    fs.outputFile(argv.duh, duhStr);
  } else {
    console.log(duhStr);
  }
};

// fetch IPXACT files
const fetchIpxactSchemasHandler = async argv => {
  if (argv.verbose) {
    console.log('fetch IPXACT schemas');
  }
  await Promise.all(ipxactSchemas.map(async leaf => {
    let resp = await fetch('http://' + leaf);
    let body = await resp.text();
    await fs.outputFile(leaf, body);
  }));
};

yargs
  .option('verbose', {
    alias: 'v',
    default: false
  })
  .command({
    command: 'duh2spirit14 duh [spirit]',
    desc: 'convert DUH file to Spirit 1.4 file',
    handler: duh2spiritHandler('spirit14'),
    builder: yargs => {
      yargs
        .positional('duh', {
          type: 'string',
          desc: 'DUH file name'
        })
        .positional('spirit', {
          type: 'string',
          desc: 'Spirit file name'
        });
    }
  })
  .command({
    command: 'duh2spirit duh [spirit]',
    desc: 'convert DUH file to Spirit 2009 file',
    handler: duh2spiritHandler('spirit2009'),
    builder: yargs => {
      yargs
        .positional('duh', {
          type: 'string',
          desc: 'DUH file name'
        })
        .positional('spirit', {
          type: 'string',
          desc: 'Spirit file name'
        });
    }
  })
  .command({
    command: 'ipxact2duh ipxact [duh]',
    desc: 'convert IPXACT file to DUH file',
    handler: ipxact2duhHandler,
    builder: yargs => {
      yargs
        .positional('duh', {
          type: 'string',
          desc: 'DUH file name'
        })
        .positional('spirit', {
          type: 'string',
          desc: 'Spirit file name'
        });
    }
  })
  .command({
    command: 'fetch',
    desc: 'download IPXACT, SPIRIT schemas',
    handler: fetchIpxactSchemasHandler
  })
  .demandCommand()
  .help().argv;
