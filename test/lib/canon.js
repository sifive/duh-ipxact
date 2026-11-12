'use strict';

// Canonical form of XML document for round-trip comparison.
// - element / attribute names resolved to {uri}local (prefix independent)
// - xmlns declarations dropped, attributes sorted
// - whitespace-only text dropped, text trimmed
// - comments / PIs already dropped by onml.parse

const onml = require('onml');

const canon = (str) => {
  const root = onml.parse(str);
  const rec = (node, scope) => {
    if (typeof node === 'string') { return node.trim(); }
    const attr = node[1] || {};
    const sc = Object.assign({}, scope);
    Object.keys(attr).map(k => {
      if (k === 'xmlns') { sc[''] = attr[k]; }
      const m = k.match(/^xmlns:(.+)$/);
      if (m) { sc[m[1]] = attr[k]; }
    });
    const qn = (name, isAttr) => {
      const i = name.indexOf(':');
      if (i < 0) { return (isAttr || sc[''] === undefined) ? name : '{' + sc[''] + '}' + name; }
      const p = name.slice(0, i);
      return '{' + (sc[p] || p) + '}' + name.slice(i + 1);
    };
    const a = {};
    Object.keys(attr)
      .filter(k => k !== 'xmlns' && !k.startsWith('xmlns:'))
      .map(k => [qn(k, true), String(attr[k]).trim()])
      .sort((x, y) => (x[0] < y[0]) ? -1 : 1)
      .map(([k, v]) => { a[k] = v; });
    const kids = node.slice(2).map(c => rec(c, sc)).filter(c => c !== '');
    return [qn(node[0], false), a].concat(kids);
  };
  return rec(root, {xml: 'http://www.w3.org/XML/1998/namespace'});
};

module.exports = canon;
