'use strict';

// Walk onml tree of IP-XACT document alongside XSD table.
// cb(node, {name, type, path, parentType}) called for each element.

const local = name => name.split(':').pop();

const elementsOf = node => node.slice(2).filter(e => Array.isArray(e));

const childMapCache = new WeakMap();

// {childElementName: typeKey} for complex type
const childMap = typeDesc => {
  if (!typeDesc || !typeDesc.content) {
    return {};
  }
  let res = childMapCache.get(typeDesc);
  if (res) {
    return res;
  }
  res = {};
  const rec = p => {
    if (p.el !== undefined) {
      if (res[p.el] === undefined) { res[p.el] = p.type; }
    } else if (p.any !== undefined) {
      res['*'] = '*';
    } else {
      (p.seq || p.choice).map(rec);
    }
  };
  rec(typeDesc.content);
  childMapCache.set(typeDesc, res);
  return res;
};

const walk = (table, root, cb) => {
  const rec = (node, type, path, parentType) => {
    const name = local(node[0]);
    cb(node, {name, type, path, parentType});
    if (type === undefined || type === '*') {
      return; // unknown / opaque (xs:any) subtree
    }
    const map = childMap(table.types[type]);
    elementsOf(node).map(child => {
      const cname = local(child[0]);
      let ctype = map[cname];
      if (ctype === undefined && map['*']) { ctype = '*'; }
      rec(child, ctype, path.concat(cname), type);
    });
  };
  const rname = local(root[0]);
  rec(root, table.roots[rname], [rname], undefined);
};

module.exports = {walk, childMap, local, elementsOf};
