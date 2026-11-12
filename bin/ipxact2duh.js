#!/usr/bin/env node
'use strict';

const json5 = require('json5');
const onml = require('onml');

const ml2on = require('../lib/ml2on.js');

const main = async () => {
  let ipxactStr = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    ipxactStr += chunk;
  }
  const ipxactObj = onml.parse(ipxactStr);
  const duhObj = ml2on(ipxactObj);

  const duhStr = json5.stringify(duhObj, null, 2);
  console.log(duhStr);
};

main().catch(err => {
  console.error(err);
  process.exit(1);
});
