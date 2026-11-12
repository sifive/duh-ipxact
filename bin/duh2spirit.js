#!/usr/bin/env node
'use strict';

const json5 = require('json5');
const onml = require('onml');

const duh2spirit = require('../lib/duh2spirit.js');

const metaxml = '<?xml version="1.0" encoding="UTF-8"?>\n';

const main = async () => {
  let duhStr = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    duhStr += chunk;
  }
  const duhObj = json5.parse(duhStr);
  const spiritObj = duh2spirit(duhObj);

  let spiritStr;
  try {
    spiritStr = metaxml + onml.stringify(spiritObj, 2);
  } catch {
    console.log(json5.stringify(spiritObj, null, 2));
  }
  console.log(spiritStr);
};

main().catch(err => {
  console.error(err);
  process.exit(1);
});
