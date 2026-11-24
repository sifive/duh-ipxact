'use strict';

// Validate lexical values against XSD built-in and derived simple types.
// Returns error message string, or null if valid.

const RE_INT = /^[+-]?\d+$/;
const RE_NON_NEG = /^(?:\+?\d+|-0+)$/;
const RE_POS_INT = /^\+?0*[1-9]\d*$/;
const RE_FLOAT = /^(?:NaN|-?INF|[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)$/;
const RE_NAME = /^[\p{L}_:][\p{L}\p{N}.\-:_]*$/u;
const RE_NCNAME = /^[\p{L}_][\p{L}\p{N}.\-_]*$/u;
const RE_NMTOKEN = /^[\p{L}\p{N}.\-:_]+$/u;

const INT_MIN = -2147483648n;
const INT_MAX = 2147483647n;

const patternCache = new Map();

const compilePattern = pat => {
  let re = patternCache.get(pat);
  if (re) { return re; }
  let out = '';
  let inClass = false;
  for (let i = 0; i < pat.length; i++) {
    const ch = pat[i];
    if (ch === '\\' && i + 1 < pat.length) {
      const next = pat[i + 1];
      if (next === 'i') {
        out += inClass ? '\\p{L}_:' : '[\\p{L}_:]';
        i++;
        continue;
      }
      if (next === 'c') {
        out += inClass ? '\\p{L}\\p{N}.\\-:_': '[\\p{L}\\p{N}.\\-:_]';
        i++;
        continue;
      }
      out += ch + next;
      i++;
      continue;
    }
    if (ch === '[') {
      inClass = true;
    } else if (ch === ']') {
      inClass = false;
    }
    out += ch;
  }
  re = new RegExp('^(?:' + out + ')$', 'u');
  patternCache.set(pat, re);
  return re;
};

const normalizeWs = (val, mode) => {
  if (mode === 'preserve') { return val; }
  if (mode === 'replace') { return val.replace(/[\t\r\n]/g, ' '); }
  return val.replace(/[\t\r\n]/g, ' ').replace(/ +/g, ' ').trim();
};

const builtinWs = name => {
  if (name === 'xs:string' || name === 'xs:anySimpleType' || name === 'xs:anyType') {
    return 'preserve';
  }
  if (name === 'xs:normalizedString') {
    return 'replace';
  }
  return 'collapse';
};

const resolveWs = (table, typeKey) => {
  if (!typeKey) { return 'preserve'; }
  if (typeKey.startsWith('xs:')) { return builtinWs(typeKey); }
  const st = table.types[typeKey];
  if (!st || st.kind !== 'simple') { return 'preserve'; }
  if (st.whiteSpace) { return st.whiteSpace; }
  if (st.list) { return 'collapse'; }
  if (st.base) { return resolveWs(table, st.base); }
  return 'collapse';
};

const builtins = {
  'xs:boolean': v => (v === 'true' || v === 'false' || v === '1' || v === '0')
    ? null
    : `invalid xs:boolean '${v}'`,
  'xs:integer': v => RE_INT.test(v) ? null : `invalid xs:integer '${v}'`,
  'xs:int': v => {
    if (!RE_INT.test(v)) { return `invalid xs:int '${v}'`; }
    const n = BigInt(v);
    return (n >= INT_MIN && n <= INT_MAX) ? null : `xs:int out of range '${v}'`;
  },
  'xs:nonNegativeInteger': v => RE_NON_NEG.test(v) ? null : `invalid xs:nonNegativeInteger '${v}'`,
  'xs:positiveInteger': v => RE_POS_INT.test(v) ? null : `invalid xs:positiveInteger '${v}'`,
  'xs:float': v => RE_FLOAT.test(v) ? null : `invalid xs:float '${v}'`,
  'xs:double': v => RE_FLOAT.test(v) ? null : `invalid xs:double '${v}'`,
  'xs:Name': v => RE_NAME.test(v) ? null : `invalid xs:Name '${v}'`,
  'xs:ID': v => RE_NCNAME.test(v) ? null : `invalid xs:ID '${v}'`,
  'xs:IDREF': v => RE_NCNAME.test(v) ? null : `invalid xs:IDREF '${v}'`,
  'xs:NMTOKEN': v => RE_NMTOKEN.test(v) ? null : `invalid xs:NMTOKEN '${v}'`,
  'xs:NMTOKENS': v => {
    if (!v) { return 'invalid xs:NMTOKENS \'\''; }
    for (const p of v.split(' ')) {
      if (!RE_NMTOKEN.test(p)) { return `invalid xs:NMTOKENS '${v}'`; }
    }
    return null;
  }
};

const checkBuiltin = (name, raw) => {
  const fn = builtins[name];
  if (!fn) { return null; }
  return fn(normalizeWs(raw, builtinWs(name)));
};

const cmpNum = (a, b) => {
  if (RE_INT.test(a) && RE_INT.test(b)) {
    const ba = BigInt(a);
    const bb = BigInt(b);
    return ba < bb ? -1 : (ba > bb ? 1 : 0);
  }
  const na = Number(a);
  const nb = Number(b);
  if (Number.isNaN(na) || Number.isNaN(nb)) { return NaN; }
  return na < nb ? -1 : (na > nb ? 1 : 0);
};

const isIdType = (table, typeKey) => {
  if (typeKey === 'xs:ID') { return 'ID'; }
  if (typeKey === 'xs:IDREF') { return 'IDREF'; }
  if (!typeKey || typeKey.startsWith('xs:')) { return null; }
  const st = table.types[typeKey];
  if (!st || st.kind !== 'simple') { return null; }
  return st.base ? isIdType(table, st.base) : null;
};

const checkLength = (st, len, label) => {
  if (st.minLength !== undefined && len < Number(st.minLength)) {
    return `${label} length ${len} < minLength ${st.minLength}`;
  }
  if (st.maxLength !== undefined && len > Number(st.maxLength)) {
    return `${label} length ${len} > maxLength ${st.maxLength}`;
  }
  if (st.length !== undefined && len !== Number(st.length)) {
    return `${label} length ${len} !== length ${st.length}`;
  }
  return null;
};

const checkFacets = (st, v) => {
  if (st.enum && !st.enum.includes(v)) {
    return `value '${v}' not in enumeration {${st.enum.join(', ')}}`;
  }
  if (st.pattern && !st.pattern.some(p => compilePattern(p).test(v))) {
    return `value '${v}' does not match pattern ${st.pattern.join(' | ')}`;
  }
  const lenErr = checkLength(st, v.length, `value '${v}'`);
  if (lenErr) { return lenErr; }
  if (st.minInclusive !== undefined && cmpNum(v, st.minInclusive) < 0) {
    return `value '${v}' < minInclusive ${st.minInclusive}`;
  }
  if (st.maxInclusive !== undefined && cmpNum(v, st.maxInclusive) > 0) {
    return `value '${v}' > maxInclusive ${st.maxInclusive}`;
  }
  return null;
};

const checkValue = (table, typeKey, raw) => {
  if (!typeKey) { return null; }
  if (typeKey.startsWith('xs:')) {
    return checkBuiltin(typeKey, raw);
  }
  const st = table.types[typeKey];
  if (!st || st.kind !== 'simple') { return null; }

  if (st.union) {
    return st.union.some(m => checkValue(table, m, raw) === null)
      ? null
      : `value '${raw.trim()}' does not match any union member of ${typeKey}`;
  }

  const v = normalizeWs(raw, resolveWs(table, typeKey));

  if (st.list) {
    const items = v ? v.split(' ') : [];
    for (const item of items) {
      const err = checkValue(table, st.list, item);
      if (err) { return err; }
    }
    return checkLength(st, items.length, 'list');
  }

  if (st.base) {
    const baseErr = checkValue(table, st.base, v);
    if (baseErr) { return baseErr; }
  }

  return checkFacets(st, v);
};

module.exports = {checkValue, isIdType, normalizeWs};
