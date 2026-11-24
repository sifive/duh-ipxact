'use strict';

// High-level vanilla JS IP-XACT / SPIRIT XSD validator.
// Parses XML with onml ({loc: WeakMap}), detects standard version by root xmlns,
// and validates against prebuilt lib/xsd/<version>.json table with source locations.
//
// validate(xmlString) → {
//   ok: boolean,
//   version: string | null,
//   errors: [{line?, column?, offset?, path, message}]
// }

const onml = require('onml');
const {detect} = require('../versions.js');
const check = require('./check.js');
const {groupErrors, formatDiagnostic, formatReport, formatCorpusSummary} = require('./report.js');

const tables = {};
const getTable = id => tables[id] || (tables[id] = require('./' + id + '.json'));

const validate = xml => {
  const loc = new WeakMap();
  let doc;
  try {
    doc = onml.parse(xml, {loc});
  } catch (err) {
    return {
      ok: false,
      version: null,
      errors: [{code: 'E_PARSE', path: '', message: err.message}]
    };
  }

  if (!doc) {
    return {
      ok: false,
      version: null,
      errors: [{code: 'E_EMPTY', path: '', message: 'empty XML document'}]
    };
  }

  const ver = detect(doc);
  if (!ver) {
    const start = loc.get(doc) && loc.get(doc).start;
    return {
      ok: false,
      version: null,
      errors: [{
        code: 'E_NS_UNKNOWN',
        line: start ? start.line : undefined,
        column: start ? start.column : undefined,
        offset: start ? start.offset : undefined,
        path: doc[0],
        message: 'unrecognized IP-XACT / SPIRIT namespace'
      }]
    };
  }

  const table = getTable(ver.id);
  const errors = check(table, doc, {loc, detailed: true});
  return {
    ok: errors.length === 0,
    version: ver.id,
    errors
  };
};

const formatError = (err, file) => {
  const pos = (err.line !== undefined)
    ? `${err.line}:${err.column}`
    : '';
  const locPart = file
    ? (pos ? `${file}:${pos}` : file)
    : pos;
  const prefix = locPart ? `${locPart}: ` : '';
  const pathPart = err.path ? `${err.path}: ` : '';
  return `${prefix}${pathPart}${err.message}`;
};

module.exports = {
  validate,
  formatError,
  groupErrors,
  formatDiagnostic,
  formatReport,
  formatCorpusSummary
};
