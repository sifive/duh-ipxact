'use strict';

// Vanilla JS XSD validator for onml documents against lib/xsd/<ver>.json tables.
// Validates: element names, namespace, order, occurrence, attributes (required,
// unknown, types, fixed), simple-type built-ins & facets (enum, pattern, range,
// length, union, list), identity constraints (key, unique, keyref), ID/IDREF.
//
// check(table, root, opts?)
//   opts.loc:      WeakMap / Map (from onml.parse(xml, {loc})) or true (uses onml.loc)
//   opts.detailed: true → returns [{line, column, offset, path, message}]
//                  false/omitted → returns string[]

const onml = require('onml');
const {local, elementsOf} = require('./walk.js');
const {checkValue, isIdType} = require('./types.js');
const {evalConstraints} = require('./keys.js');

const XSI = 'http://www.w3.org/2001/XMLSchema-instance';
const XML = 'http://www.w3.org/XML/1998/namespace';

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

// child element name → particle descriptor (first match)
const particleOfChild = (p, name) => {
  if (p.el !== undefined) { return (p.el === name) ? p : undefined; }
  if (p.any !== undefined) { return undefined; }
  for (const c of (p.seq || p.choice)) {
    const found = particleOfChild(c, name);
    if (found !== undefined) { return found; }
  }
  return undefined;
};

const hasAny = p => (p.any !== undefined) || ((p.seq || p.choice || []).some(hasAny));

const textOf = node => node.slice(2).filter(e => typeof e === 'string').join('');

const hasNonWsText = node => node.slice(2).some(e => typeof e === 'string' && e.trim() !== '');

const extendNs = (parentNs, attr) => {
  let nsMap = parentNs;
  for (const k of Object.keys(attr)) {
    if (k === 'xmlns') {
      if (nsMap === parentNs) { nsMap = Object.assign({}, parentNs); }
      nsMap[''] = attr[k];
    } else if (k.startsWith('xmlns:')) {
      if (nsMap === parentNs) { nsMap = Object.assign({}, parentNs); }
      nsMap[k.slice(6)] = attr[k];
    }
  }
  return nsMap;
};

const elemNs = (tag, nsMap) => {
  const idx = tag.indexOf(':');
  return idx === -1 ? nsMap[''] : nsMap[tag.slice(0, idx)];
};

const resolveAttrSpec = (k, nsMap, tableNs, byName) => {
  const colon = k.indexOf(':');
  if (colon === -1) { return {spec: byName.get(k)}; }
  const uri = nsMap[k.slice(0, colon)];
  if (uri === XSI) { return {skip: true}; }
  if (uri === XML) { return {spec: byName.get('xml:' + k.slice(colon + 1))}; }
  if (uri === tableNs) { return {spec: byName.get(k.slice(colon + 1))}; }
  return {spec: undefined};
};

const allowAnyAttr = (anyAttr, k, nsMap, tableNs) => {
  if (!anyAttr) { return false; }
  if (anyAttr === '##any') { return true; }
  if (anyAttr === '##other') {
    const colon = k.indexOf(':');
    if (colon === -1) { return false; }
    const uri = nsMap[k.slice(0, colon)];
    return !!uri && uri !== tableNs;
  }
  return true;
};

const check = (table, root, opts = {}) => {
  const locSource = opts.loc === true
    ? onml.loc
    : (opts.loc && typeof opts.loc.get === 'function' ? n => opts.loc.get(n) : onml.loc);
  const detailed = !!opts.detailed;
  const errors = [];
  const nodePaths = new WeakMap();
  const nodeTypes = new WeakMap();
  const ids = new Map();
  const idrefs = [];

  const emit = (node, path, message, code) => {
    const loc = locSource ? locSource(node) : undefined;
    const start = loc && loc.start;
    const end = loc && loc.end;
    if (detailed) {
      errors.push({
        code: code || 'E_XSD',
        line: start ? start.line : undefined,
        column: start ? start.column : undefined,
        offset: start ? start.offset : undefined,
        endLine: end ? end.line : undefined,
        endColumn: end ? end.column : undefined,
        endOffset: end ? end.offset : undefined,
        path,
        message
      });
    } else {
      errors.push(path + ': ' + message);
    }
  };

  const trackId = (node, path, typeKey, raw) => {
    const kind = isIdType(table, typeKey);
    if (!kind) { return; }
    const val = raw.trim();
    if (kind === 'ID') {
      if (ids.has(val)) {
        emit(node, path, `duplicate xs:ID '${val}'`, 'E_ID_DUP');
      } else {
        ids.set(val, node);
      }
    } else if (kind === 'IDREF') {
      idrefs.push({node, path, val});
    }
  };

  const valueCode = msg => {
    if (msg.includes('not in enumeration')) { return 'E_ENUM'; }
    if (msg.includes('pattern')) { return 'E_PATTERN'; }
    if (msg.includes('Inclusive') || msg.includes('out of range')) { return 'E_RANGE'; }
    if (msg.includes('Length') || msg.includes('length')) { return 'E_LENGTH'; }
    return 'E_TYPE';
  };

  const checkText = (node, typeKey, path, fixed) => {
    const raw = textOf(node);
    const err = checkValue(table, typeKey, raw);
    if (err) {
      emit(node, path, err, valueCode(err));
    }
    if (fixed !== undefined && raw.trim() !== fixed) {
      emit(node, path, `value '${raw.trim()}' does not match fixed '${fixed}'`, 'E_FIXED');
    }
    trackId(node, path, typeKey, raw);
  };

  const checkAttrs = (node, t, path, nsMap) => {
    const attr = node[1] || {};
    const qual = table.attrQualified;
    const byName = new Map();
    for (const a of t.attrs) {
      byName.set(a.name, a);
    }

    // required attributes
    for (const a of t.attrs) {
      if (a.use === 'required') {
        const key = (qual && !a.name.includes(':')) ? undefined : a.name;
        const present = key
          ? (attr[key] !== undefined)
          : Object.keys(attr).some(k => !k.startsWith('xmlns') && local(k) === a.name);
        if (!present) {
          emit(node, path, 'missing attribute ' + a.name, 'E_ATTR_MISSING');
        }
      }
    }

    // present attributes: unknown, type, fixed, ID/IDREF
    for (const k of Object.keys(attr)) {
      if (k === 'xmlns' || k.startsWith('xmlns:')) { continue; }
      const {skip, spec} = resolveAttrSpec(k, nsMap, table.ns, byName);
      if (skip) { continue; }

      if (!spec) {
        if (!allowAnyAttr(t.anyAttr, k, nsMap, table.ns)) {
          emit(node, path, 'unexpected attribute ' + k, 'E_ATTR_UNKNOWN');
        }
        continue;
      }

      const val = String(attr[k]);
      const err = checkValue(table, spec.type, val);
      if (err) {
        emit(node, path + '/@' + k, err, valueCode(err));
      }
      if (spec.fixed !== undefined && val !== spec.fixed) {
        emit(node, path + '/@' + k, `attribute '${k}' value '${val}' !== fixed '${spec.fixed}'`, 'E_FIXED');
      }
      trackId(node, path + '/@' + k, spec.type, val);
    }
  };

  const rec = (node, typeKey, path, nsMap, fixed, keys, inheritedKeys) => {
    nodePaths.set(node, path);
    nodeTypes.set(node, typeKey);
    const attr = node[1] || {};
    const curNs = extendNs(nsMap, attr);

    if (typeKey === undefined) {
      emit(node, path, 'unknown element', 'E_ELEM_UNKNOWN');
      return;
    }

    const ns = elemNs(node[0], curNs);
    if (ns !== table.ns) {
      emit(node, path, `unexpected namespace '${ns || ''}' (expected '${table.ns}')`, 'E_NS');
    }

    if (typeKey.startsWith('xs:')) {
      if (elementsOf(node).length > 0 && typeKey !== 'xs:anyType') {
        emit(node, path, 'unexpected child elements in ' + typeKey, 'E_CONTENT');
      } else if (typeKey !== 'xs:anyType') {
        checkText(node, typeKey, path, fixed);
      }
      return;
    }

    const t = table.types[typeKey];
    if (t.kind === 'simple') {
      if (elementsOf(node).length > 0) {
        emit(node, path, 'unexpected child elements in simple type', 'E_CONTENT');
      } else {
        checkText(node, typeKey, path, fixed);
      }
      return;
    }

    if (t.text) {
      checkText(node, t.text, path, fixed);
    } else if (!t.mixed && hasNonWsText(node)) {
      emit(node, path, 'unexpected text content in element-only type', 'E_TEXT');
    }

    checkAttrs(node, t, path, curNs);

    const kids = elementsOf(node);
    const names = kids.map(e => local(e[0]));
    if (!t.content) {
      if (kids.length > 0) {
        emit(node, path, 'unexpected child elements', 'E_CONTENT');
      }
    } else {
      if (!match(t.content, names, 0).has(names.length)) {
        emit(node, path, 'content mismatch [' + names.join(' ') + ']', 'E_CONTENT');
      }
      const any = hasAny(t.content);
      kids.map((kid, i) => {
        const p = particleOfChild(t.content, names[i]);
        if (p === undefined) {
          if (!any) { emit(kid, path + '/' + names[i], 'not allowed', 'E_ELEM_UNKNOWN'); }
          return; // xs:any subtree not checked
        }
        const childKeys = p.keys || (p.ref && table.rootKeys && table.rootKeys[names[i]]);
        rec(kid, p.type, path + '/' + names[i], curNs, p.fixed, childKeys, inheritedKeys);
      });
    }

    if (keys) {
      const keyCode = msg => msg.startsWith('keyref') ? 'E_KEYREF' : (msg.startsWith('duplicate') ? 'E_KEY_DUP' : 'E_KEY_MISSING');
      evalConstraints(node, keys, table, (n, msg) => emit(n, nodePaths.get(n) || path, msg, keyCode(msg)), inheritedKeys, nodeTypes);
    }
  };

  const rname = local(root[0]);
  const rootKeys = table.rootKeys && table.rootKeys[rname];
  rec(root, table.roots[rname], rname, {xml: XML}, undefined, rootKeys, null);

  for (const ref of idrefs) {
    if (!ids.has(ref.val)) {
      emit(ref.node, ref.path, `unresolved xs:IDREF '${ref.val}'`, 'E_IDREF');
    }
  }

  return errors;
};

module.exports = check;
