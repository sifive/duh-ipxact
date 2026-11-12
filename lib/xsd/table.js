'use strict';

// Build compact content-model table from a set of XSD documents.
//
// input:  {fileName: onmlTree} (all files of one standard version)
// output: {
//   ns, attrQualified,
//   roots:    {elementName: typeKey},       // global elements
//   types:    {typeKey: typeDesc},
//   elements: [elementName, ...]           // every element name in model
// }
//
// typeDesc:
//   {kind: 'complex', attrs: [attr], anyAttr?, text?: typeKey, content?: particle}
//   {kind: 'simple', base?, enum?, pattern?, union?, list?, minInclusive?, ...}
// particle:
//   {seq: [particle], min, max} | {choice: [particle], min, max}
//   {el: name, type: typeKey, min, max, default?, fixed?} | {any: ns, min, max}
// attr: {name, type, use?, default?, fixed?}
//
// typeKey: named XSD type local name, `xs:<builtin>`, or synthetic key for
// anonymous types: `<elementName>` (global element), `<parentKey>/<name>`
// (local element), `group:<groupName>/<name>` (element inside named group).

const XS = 'http://www.w3.org/2001/XMLSchema';
const XML = 'http://www.w3.org/XML/1998/namespace';

const local = name => name.split(':').pop();

const children = node => node.slice(2).filter(e => Array.isArray(e));

const occurs = (attr, def) => {
  const min = (attr.minOccurs === undefined) ? 1 : Number(attr.minOccurs);
  const maxs = (attr.maxOccurs === undefined) ? '1' : attr.maxOccurs;
  const max = (maxs === 'unbounded') ? -1 : Number(maxs);
  return Object.assign(def || {}, {min, max});
};

const table = docs => {
  const defs = {complexType: {}, simpleType: {}, group: {}, attributeGroup: {}, element: {}, attribute: {}};
  let ns, attrQualified = false;

  // pass 1: collect global definitions, with per-file prefix maps
  Object.keys(docs).sort().map(fname => {
    const root = docs[fname];
    const rattr = root[1] || {};
    const pfx = {xml: XML};
    Object.keys(rattr).map(key => {
      const m = key.match(/^xmlns:(.+)$/);
      if (m) { pfx[m[1]] = rattr[key]; }
    });
    if (rattr.targetNamespace === XML) {
      // xml.xsd: only global attributes (xml:id ...)
      children(root).map(e => {
        if (local(e[0]) === 'attribute') {
          defs.attribute['xml:' + e[1].name] = {node: e, pfx, fname};
        }
      });
      return;
    }
    if (ns === undefined) {
      ns = rattr.targetNamespace;
    } else if (ns !== rattr.targetNamespace) {
      throw new Error('mixed targetNamespace in ' + fname);
    }
    if (rattr.attributeFormDefault === 'qualified') {
      attrQualified = true;
    }
    children(root).map(e => {
      const kind = local(e[0]);
      if (defs[kind] !== undefined) {
        defs[kind][e[1].name] = {node: e, pfx, fname};
      }
    });
  });

  // resolve QName to key
  const qkey = (qname, pfx) => {
    const parts = qname.split(':');
    const p = (parts.length > 1) ? parts[0] : '';
    const n = parts.pop();
    const uri = pfx[p];
    if (uri === XS) { return 'xs:' + n; }
    if (uri === XML) { return 'xml:' + n; }
    if (uri === ns || (p === '' && uri === undefined)) { return n; }
    throw new Error('unknown prefix in ' + qname);
  };

  const types = {};
  const roots = {};
  const elements = new Set();

  const simpleType = (node, pfx) => {
    const res = {kind: 'simple'};
    children(node).map(c => {
      const k = local(c[0]);
      if (k === 'restriction') {
        if (c[1].base) { res.base = qkey(c[1].base, pfx); }
        children(c).map(f => {
          const fk = local(f[0]);
          if (fk === 'enumeration') {
            (res.enum = res.enum || []).push(f[1].value);
          } else if (fk === 'pattern') {
            (res.pattern = res.pattern || []).push(f[1].value);
          } else if (fk === 'simpleType') {
            res.base = anonSimple(f, pfx, '?');
          } else if (fk !== 'annotation') {
            res[fk] = f[1].value;
          }
        });
      } else if (k === 'union') {
        res.union = (c[1].memberTypes || '').trim().split(/\s+/).filter(e => e).map(e => qkey(e, pfx));
        children(c).filter(f => local(f[0]) === 'simpleType').map((f, i) => {
          res.union.push(anonSimple(f, pfx, 'union' + i));
        });
      } else if (k === 'list') {
        res.list = c[1].itemType ? qkey(c[1].itemType, pfx) : 'xs:string';
      }
    });
    return res;
  };

  const anonSimple = (node, pfx, key) => {
    types[key] = simpleType(node, pfx);
    return key;
  };

  const attrsOf = (node, pfx, acc) => {
    children(node).map(c => {
      const k = local(c[0]);
      const a = c[1];
      if (k === 'attribute') {
        if (a.ref) {
          const rk = qkey(a.ref, pfx);
          const d = defs.attribute[rk];
          const da = d ? d.node[1] : {};
          acc.attrs.push(clean({name: rk, type: da.type ? qkey(da.type, d.pfx) : 'xs:string', use: a.use, default: a.default, fixed: a.fixed}));
        } else {
          let type = a.type ? qkey(a.type, pfx) : 'xs:string';
          const st = children(c).find(e => local(e[0]) === 'simpleType');
          if (st) { type = anonSimple(st, pfx, acc.key + '@' + a.name); }
          acc.attrs.push(clean({name: a.name, type, use: a.use, default: a.default, fixed: a.fixed}));
        }
      } else if (k === 'attributeGroup') {
        const g = defs.attributeGroup[qkey(a.ref, pfx)];
        if (!g) { throw new Error('attributeGroup ' + a.ref); }
        attrsOf(g.node, g.pfx, acc);
      } else if (k === 'anyAttribute') {
        acc.anyAttr = a.namespace || '##any';
      }
    });
    return acc;
  };

  const clean = obj => {
    Object.keys(obj).map(k => { if (obj[k] === undefined) { delete obj[k]; } });
    return obj;
  };

  const particle = (node, pfx, ctx) => {
    const k = local(node[0]);
    const a = node[1];
    if (k === 'sequence' || k === 'choice' || k === 'all') {
      const items = children(node)
        .map(c => particle(c, pfx, ctx))
        .filter(e => e);
      return occurs(a, {[k === 'choice' ? 'choice' : 'seq']: items});
    }
    if (k === 'group') {
      const gk = qkey(a.ref, pfx);
      const g = defs.group[gk];
      if (!g) { throw new Error('group ' + a.ref); }
      const inner = children(g.node).find(c => ['sequence', 'choice', 'all'].includes(local(c[0])));
      const res = particle(inner, g.pfx, 'group:' + gk);
      // group ref occurrence wraps group content
      const o = occurs(a);
      if (o.min === 1 && o.max === 1) { return res; }
      return Object.assign({seq: [res]}, o);
    }
    if (k === 'element') {
      let name, type;
      if (a.ref) {
        name = qkey(a.ref, pfx);
        type = elementType(name);
      } else {
        name = a.name;
        type = localElementType(node, pfx, ctx + '/' + name);
      }
      elements.add(name);
      return occurs(a, clean({el: name, type, default: a.default, fixed: a.fixed}));
    }
    if (k === 'any') {
      return occurs(a, {any: a.namespace || '##any'});
    }
    return undefined; // annotation, key, keyref, unique
  };

  const localElementType = (node, pfx, key) => {
    const a = node[1];
    if (a.type) {
      const tk = qkey(a.type, pfx);
      complexOrSimple(tk);
      return tk;
    }
    const ct = children(node).find(c => local(c[0]) === 'complexType');
    if (ct) {
      if (types[key] === undefined) {
        types[key] = null; // recursion guard
        types[key] = complexType(ct, pfx, key);
      }
      return key;
    }
    const st = children(node).find(c => local(c[0]) === 'simpleType');
    if (st) { return anonSimple(st, pfx, key); }
    return 'xs:anyType';
  };

  const elementType = name => {
    if (roots[name] !== undefined) { return roots[name]; }
    const d = defs.element[name];
    if (!d) { throw new Error('element ' + name); }
    roots[name] = name; // provisional (anonymous types keyed by element name)
    const tk = localElementType(d.node, d.pfx, name);
    roots[name] = tk;
    return tk;
  };

  const complexOrSimple = tk => {
    if (tk.startsWith('xs:') || types[tk] !== undefined) { return; }
    if (defs.complexType[tk]) {
      const d = defs.complexType[tk];
      types[tk] = null; // recursion guard
      types[tk] = complexType(d.node, d.pfx, tk);
    } else if (defs.simpleType[tk]) {
      const d = defs.simpleType[tk];
      types[tk] = simpleType(d.node, d.pfx);
    } else {
      throw new Error('type ' + tk);
    }
  };

  const complexType = (node, pfx, key) => {
    const acc = {kind: 'complex', attrs: [], key};
    if (node[1].mixed === 'true') { acc.mixed = true; }
    let content;
    children(node).map(c => {
      const k = local(c[0]);
      if (k === 'simpleContent' || k === 'complexContent') {
        const ext = children(c).find(e => ['extension', 'restriction'].includes(local(e[0])));
        const base = qkey(ext[1].base, pfx);
        complexOrSimple(base);
        const bt = types[base];
        if (k === 'simpleContent') {
          if (base.startsWith('xs:') || (bt && bt.kind === 'simple')) {
            acc.text = base;
          } else if (bt) {
            acc.text = bt.text;
            acc.attrs.push(...bt.attrs);
            if (bt.anyAttr) { acc.anyAttr = bt.anyAttr; }
          }
          const st = children(ext).find(e => local(e[0]) === 'simpleType');
          if (st) { acc.text = anonSimple(st, pfx, key + '#text'); }
        } else {
          const isExt = local(ext[0]) === 'extension';
          if (bt) {
            acc.attrs.push(...bt.attrs);
            if (bt.anyAttr) { acc.anyAttr = bt.anyAttr; }
          }
          const own = children(ext).find(e => ['sequence', 'choice', 'all', 'group'].includes(local(e[0])));
          const ownP = own ? particle(own, pfx, key) : undefined;
          if (isExt && bt && bt.content) {
            content = ownP ? {seq: [bt.content, ownP], min: 1, max: 1} : bt.content;
          } else {
            content = ownP;
          }
        }
        attrsOf(ext, pfx, acc);
      } else if (['sequence', 'choice', 'all', 'group'].includes(k)) {
        content = particle(c, pfx, key);
      }
    });
    attrsOf(node, pfx, acc);
    // de-duplicate attributes (restriction may redeclare)
    const seen = {};
    acc.attrs = acc.attrs.filter(e => seen[e.name] ? false : (seen[e.name] = true));
    if (content) { acc.content = content; }
    delete acc.key;
    return acc;
  };

  Object.keys(defs.element).sort().map(name => {
    elements.add(name);
    elementType(name);
  });

  const sortedTypes = {};
  Object.keys(types).sort().map(k => { sortedTypes[k] = types[k]; });
  const sortedRoots = {};
  Object.keys(roots).sort().map(k => { sortedRoots[k] = roots[k]; });

  return {
    ns,
    attrQualified,
    roots: sortedRoots,
    types: sortedTypes,
    elements: Array.from(elements).sort()
  };
};

module.exports = table;
