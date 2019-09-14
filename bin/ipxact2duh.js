#!/usr/bin/env node
'use strict';

const concat = require('concat-stream');
const json5 = require('json5');
const onml = require('onml');

const ml2on = require('../lib/ml2on.js');

function gotInput (ipxactStr) {
  const ipxactObj = onml.parse(ipxactStr);
  // const duhObj = ipxactObj;
  const duhObj = ml2on(ipxactObj);

  const duhStr = json5.stringify(duhObj, null, 2);
  console.log(duhStr);
}

const source = process.stdin.setEncoding('utf8');

if (source) {
  source.pipe(concat(gotInput));
}
