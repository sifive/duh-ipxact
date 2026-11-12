'use strict';

// Structural check of onml document against XSD table:
// element names, order, occurrence, required attributes.
// Not a full XSD validator (no simple-type facets, keys, keyrefs).
// Returns array of error strings (empty = ok).

const {local, elementsOf} = require('./walk.js');

// set of end positions reachable matching particle p from position i
const match = (p, names, i) => {
  const max = (p.max === -1) ? Infinity : p.max;
  const res = new Set(p.min === 0 ? [i] : []);
  const seen = new Set([i]);
  let frontier = new Set([i]);
  for (let n = 1; n <= max && frontier.size > 0; n++) {
    const next = new Set();
    frontier.forEach(pos => once(p, names, pos).forEach(e => next.add(e)));
    if (n >= p.min) {
      next.forEach(e => res.add(e));
      const fresh = new Set(Array.from(next).filter(e => !seen.has(e)));
      fresh.forEach(e => seen.add(e));
      frontier = fresh;
    } else {
      frontier = next;
    }
  }
  return res;
};

const once = (p, names, i) => {
  if (p.el !== undefined) {
    return (names[i] === p.el) ? new Set([i + 1]) : new Set();
  }
  if (p.any !== undefined) {
    return (i < names.length) ? new Set([i + 1]) : new Set();
  }
  if (p.choice) {
    const res = new Set();
    p.choice.map(c => match(c, names, i).forEach(e => res.add(e)));
    return res;
  }
  let cur = new Set([i]);
  for (const c of p.seq) {
    const next = new Set();
    cur.forEach(pos => match(c, names, pos).forEach(e => next.add(e)));
    cur = next;
    if (cur.size === 0) { break; }
  }
  return cur;
};

// child element name → type, taking particle order into account is not
// needed for IP-XACT (names unique per content model), use first match.
const typeOfChild = (p, name) => {
  if (p.el !== undefined) { return (p.el === name) ? p.type : undefined; }
  if (p.any !== undefined) { return undefined; }
  for (const c of (p.seq || p.choice)) {
    const t = typeOfChild(c, name);
    if (t !== undefined) { return t; }
  }
  return undefined;
};

const hasAny = p => (p.any !== undefined) || ((p.seq || p.choice || []).some(hasAny));

const textOf = node => node.slice(2).filter(e => typeof e === 'string').join('').trim();

const check = (table, root) => {
  const errors = [];

  const checkEnum = (node, typeKey, path) => {
    const st = table.types[typeKey];
    if (st && st.kind === 'simple' && st.enum) {
      const val = textOf(node);
      if (!st.enum.includes(val)) {
        errors.push(path + ': value \'' + val + '\' not in enumeration');
      }
    }
  };
  const qual = table.attrQualified;

  const rec = (node, typeKey, path) => {
    if (typeKey === undefined) {
      errors.push(path + ': unknown element');
      return;
    }
    if (typeKey.startsWith('xs:')) {
      if (elementsOf(node).length > 0 && typeKey !== 'xs:anyType') {
        errors.push(path + ': unexpected child elements in ' + typeKey);
      }
      return;
    }
    const t = table.types[typeKey];
    if (t.kind === 'simple') {
      if (elementsOf(node).length > 0) {
        errors.push(path + ': unexpected child elements in simple type');
      }
      checkEnum(node, typeKey, path);
      return;
    }
    if (t.text) {
      checkEnum(node, t.text, path);
    }
    // attributes
    const attr = node[1] || {};
    t.attrs.map(a => {
      if (a.use === 'required') {
        const key = (qual && !a.name.includes(':')) ? undefined : a.name;
        const present = key
          ? (attr[key] !== undefined)
          : Object.keys(attr).some(k => local(k) === a.name);
        if (!present) {
          errors.push(path + ': missing attribute ' + a.name);
        }
      }
    });
    const kids = elementsOf(node);
    const names = kids.map(e => local(e[0]));
    if (!t.content) {
      if (kids.length > 0) {
        errors.push(path + ': unexpected child elements');
      }
      return;
    }
    if (!match(t.content, names, 0).has(names.length)) {
      errors.push(path + ': content mismatch [' + names.join(' ') + ']');
    }
    const any = hasAny(t.content);
    kids.map((kid, i) => {
      const ct = typeOfChild(t.content, names[i]);
      if (ct === undefined) {
        if (!any) { errors.push(path + '/' + names[i] + ': not allowed'); }
        return; // xs:any subtree not checked
      }
      rec(kid, ct, path + '/' + names[i]);
    });
  };

  const rname = local(root[0]);
  rec(root, table.roots[rname], rname);
  return errors;
};

module.exports = check;
