#!/usr/bin/env node
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const {parseArgs} = require('node:util');
const json5 = require('json5');
const onml = require('onml');
const duhCore = require('duh-core');

const duh2spirit = require('../lib/duh2spirit.js');
const ml2on = require('../lib/ml2on.js');
const ipxactSchemas = require('../lib/ipxact-schemas.js');
const pkg = require('../package.json');

const outputFile = async (file, data) => {
  await fs.mkdir(path.dirname(file), {recursive: true});
  await fs.writeFile(file, data);
};

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
    await outputFile(argv.spirit, spiritStr);
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
    await outputFile(argv.duh, duhStr);
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
    await outputFile(leaf, body);
  }));
};

const usage = `Usage: duh-ipxact [options] [command]

Options:
  -v, --verbose                verbose output (default: false)
  -h, --help                   display help for command
      --version                output the version number

Commands:
  duh2spirit14 <duh> [spirit]  convert DUH file to Spirit 1.4 file
  duh2spirit <duh> [spirit]    convert DUH file to Spirit 2009 file
  ipxact2duh <ipxact> [duh]    convert IPXACT file to DUH file
  fetch                        download IPXACT, SPIRIT schemas`;

const main = async () => {
  let args;
  try {
    args = parseArgs({
      options: {
        verbose: {type: 'boolean', short: 'v', default: false},
        help: {type: 'boolean', short: 'h', default: false},
        version: {type: 'boolean', default: false}
      },
      allowPositionals: true
    });
  } catch (err) {
    console.error(err.message);
    console.log(usage);
    process.exit(1);
  }

  const {values, positionals} = args;

  if (values.version) {
    console.log(pkg.version);
    return;
  }

  if (values.help || positionals.length === 0) {
    console.log(usage);
    if (!values.help && positionals.length === 0) {
      process.exit(1);
    }
    return;
  }

  const [command, arg1, arg2] = positionals;

  switch (command) {
  case 'duh2spirit14':
    if (!arg1) {
      console.error('error: missing required argument \'duh\'');
      process.exit(1);
    }
    await duh2spiritHandler('spirit14')({duh: arg1, spirit: arg2, verbose: values.verbose});
    break;
  case 'duh2spirit':
    if (!arg1) {
      console.error('error: missing required argument \'duh\'');
      process.exit(1);
    }
    await duh2spiritHandler('spirit2009')({duh: arg1, spirit: arg2, verbose: values.verbose});
    break;
  case 'ipxact2duh':
    if (!arg1) {
      console.error('error: missing required argument \'ipxact\'');
      process.exit(1);
    }
    await ipxact2duhHandler({ipxact: arg1, duh: arg2, verbose: values.verbose});
    break;
  case 'fetch':
    await fetchIpxactSchemasHandler({verbose: values.verbose});
    break;
  default:
    console.error(`error: unknown command '${command}'`);
    console.log(usage);
    process.exit(1);
  }
};

main().catch(err => {
  console.error(err);
  process.exit(1);
});
