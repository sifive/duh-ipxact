#!/usr/bin/env node
'use strict';

const concat = require('concat-stream');
const json5 = require('json5');
const onml = require('onml');

const duh2spirit = require('../lib/duh2spirit.js');

const metaxml = '<?xml version="1.0" encoding="UTF-8"?>\n';

function gotInput (duhStr) {
  const duhObj = json5.parse(duhStr);
  const spiritObj = duh2spirit(duhObj);

  let spiritStr;
  try {
    spiritStr = metaxml + onml.stringify(spiritObj, 2);
  } catch (err) {
    console.log(json5.stringify(spiritObj, null, 2));
  }
  console.log(spiritStr);
}

const source = process.stdin.setEncoding('utf8');

if (source) {
  source.pipe(concat(gotInput));
}
