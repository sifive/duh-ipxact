#!/usr/bin/env node
'use strict';

const yargs = require('yargs');
const json5 = require('json5');
const onml = require('onml');
const fs = require('fs-extra');

const duh2spirit = require('../lib/duh2spirit.js');
const ml2on = require('../lib/ml2on.js');

// duh -> spirit
const metaxml = '<?xml version="1.0" encoding="UTF-8"?>\n';

const duh2spiritHandler = argv => {
  if (argv.verbose) console.log('duh2spirit');
  fs.readFile(argv.duh, 'utf8')
    .then(duhStr => {
      const duhObj = json5.parse(duhStr);
      const spiritObj = duh2spirit(duhObj);
      let spiritStr;
      try {
        spiritStr = metaxml + onml.stringify(spiritObj, 2);
      } catch (err) {
        console.error(json5.stringify(spiritObj, null, 2));
      }
      if (argv.spirit) {
        fs.outputFile(argv.spirit, spiritStr);
      } else {
        console.log(spiritStr);
      }
    });
};

// ipxact -> duh
const ipxact2duhHandler = argv => {
  if (argv.verbose) console.log('ipxact2duh');
  fs.readFile(argv.ipxact, 'utf8')
    .then(ipxactStr => {
      const ipxactObj = onml.parse(ipxactStr);
      const duhObj = ml2on(ipxactObj);
      const duhStr = json5.stringify(duhObj, null, 2);
      if (argv.duh) {
        fs.outputFile(argv.duh, duhStr);
      } else {
        console.log(duhStr);
      }
    });
};

yargs
  .option('verbose', {
    alias: 'v',
    default: false
  })
  .command({
    command: 'duh2spirit duh [spirit]',
    desc: 'convert DUH file to Spirit file',
    handler: duh2spiritHandler,
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
  .demandCommand()
  .help().argv;
