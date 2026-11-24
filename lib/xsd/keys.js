'use strict';

// XSD identity constraint evaluator (xs:key, xs:unique, xs:keyref)
// for the XSD restricted XPath subset used by IP-XACT / SPIRIT schemas.

const {local, elementsOf} = require('./walk.js');

const textOf = node => node.slice(2).filter(e => typeof e === 'string').join('').trim();

const matchStep = (node, step) => {
  if (step === '*' || step.endsWith(':*')) { return true; }
  return local(node[0]) === local(step);
};

const allDescendantsOrSelf = (node, acc) => {
  acc.push(node);
  for (const c of elementsOf(node)) {
    allDescendantsOrSelf(c, acc);
  }
  return acc;
};

const evalBranch = (root, branch) => {
  let b = branch.trim();
  let cur = [root];

  if (b === '.') { return cur; }

  let deep = false;
  if (b.startsWith('.//')) {
    deep = true;
    b = b.slice(3);
  } else if (b.startsWith('./')) {
    b = b.slice(2);
  }

  const steps = b.split('/').map(s => s.trim()).filter(Boolean);
  for (let idx = 0; idx < steps.length; idx++) {
    const step = steps[idx];
    const next = [];
    if (idx === 0 && deep) {
      const all = allDescendantsOrSelf(root, []);
      for (const n of all) {
        if (matchStep(n, step)) { next.push(n); }
      }
    } else {
      for (const n of cur) {
        for (const c of elementsOf(n)) {
          if (matchStep(c, step)) { next.push(c); }
        }
      }
    }
    cur = next;
    if (cur.length === 0) { break; }
  }
  return cur;
};

const evalSelector = (scopeNode, xpath) => {
  const branches = xpath.split('|');
  const seen = new Set();
  const res = [];
  for (const br of branches) {
    for (const n of evalBranch(scopeNode, br)) {
      if (!seen.has(n)) {
        seen.add(n);
        res.push(n);
      }
    }
  }
  return res;
};

const getAttr = (node, step, table, nodeTypes) => {
  const raw = step.slice(1); // strip '@'
  const attr = node[1] || {};
  if (attr[raw] !== undefined) { return attr[raw]; }
  const lname = local(raw);
  if (raw.includes(':') || table.attrQualified) {
    for (const k of Object.keys(attr)) {
      if (!k.startsWith('xmlns') && local(k) === lname) {
        return attr[k];
      }
    }
  }
  // fall back to schema attribute default if defined on node's type
  const tk = nodeTypes && nodeTypes.get(node);
  const t = tk && table.types[tk];
  if (t && t.attrs) {
    const def = t.attrs.find(a => a.name === lname || a.name === raw);
    if (def && def.default !== undefined) {
      return def.default;
    }
  }
  return undefined;
};

const evalField = (node, xpath, table, nodeTypes) => {
  const branches = xpath.split('|');
  for (const br of branches) {
    let b = br.trim();
    if (b === '.') { return textOf(node); }
    if (b.startsWith('./')) { b = b.slice(2); }
    const steps = b.split('/').map(s => s.trim()).filter(Boolean);
    let cur = [node];
    let val;
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (step.startsWith('@')) {
        for (const n of cur) {
          const av = getAttr(n, step, table, nodeTypes);
          if (av !== undefined) {
            val = av.trim();
            break;
          }
        }
        cur = [];
        break;
      }
      const next = [];
      for (const n of cur) {
        for (const c of elementsOf(n)) {
          if (matchStep(c, step)) { next.push(c); }
        }
      }
      cur = next;
      if (cur.length === 0) { break; }
    }
    if (val !== undefined) { return val; }
    if (cur.length > 0) { return textOf(cur[0]); }
  }
  return undefined;
};

const evalConstraints = (scopeNode, constraints, table, report, inheritedKeys, nodeTypes) => {
  const localKeys = Object.create(inheritedKeys || null);

  // Pass 1: keys and uniques
  for (const c of constraints) {
    if (c.kind !== 'key' && c.kind !== 'unique') { continue; }
    const seen = new Set();
    const nodes = evalSelector(scopeNode, c.selector);
    for (const n of nodes) {
      const vals = c.fields.map(f => evalField(n, f, table, nodeTypes));
      const missing = vals.some(v => v === undefined);
      if (missing) {
        if (c.kind === 'key') {
          report(n, `key '${c.name}' missing required field(s)`);
        }
        continue;
      }
      const k = JSON.stringify(vals);
      if (seen.has(k)) {
        report(n, `duplicate ${c.kind} '${c.name}' value [${vals.join(', ')}]`);
      } else {
        seen.add(k);
      }
    }
    localKeys[c.name] = seen;
  }

  // Pass 2: keyrefs
  for (const c of constraints) {
    if (c.kind !== 'keyref') { continue; }
    const target = localKeys[c.refer];
    if (!target) { continue; }
    const nodes = evalSelector(scopeNode, c.selector);
    for (const n of nodes) {
      const vals = c.fields.map(f => evalField(n, f, table, nodeTypes));
      if (vals.some(v => v === undefined)) { continue; }
      const k = JSON.stringify(vals);
      if (!target.has(k)) {
        report(n, `keyref '${c.name}' value [${vals.join(', ')}] not found in '${c.refer}'`);
      }
    }
  }

  return localKeys;
};

module.exports = {evalConstraints};
