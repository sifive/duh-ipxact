'use strict';

// Modern diagnostic grouping and source-snippet rendering (rustc / miette / Biome style).
// Zero dependencies; TTY-aware ANSI colors (respects NO_COLOR).

const makeColors = enabled => {
  if (!enabled) {
    const id = s => s;
    return {red: id, bold: id, dim: id, cyan: id, yellow: id, green: id};
  }
  return {
    red: s => `\x1b[31m${s}\x1b[0m`,
    bold: s => `\x1b[1m${s}\x1b[0m`,
    dim: s => `\x1b[2m${s}\x1b[0m`,
    cyan: s => `\x1b[36m${s}\x1b[0m`,
    yellow: s => `\x1b[33m${s}\x1b[0m`,
    green: s => `\x1b[32m${s}\x1b[0m`
  };
};

const defaultColor = () => Boolean(process.stdout.isTTY && !process.env.NO_COLOR);

// Group identical (code, path, message) errors while preserving first-seen order.
const groupErrors = errors => {
  const map = new Map();
  for (const err of errors) {
    const key = `${err.code || 'E_XSD'}\0${err.path || ''}\0${err.message}`;
    let g = map.get(key);
    if (!g) {
      g = {first: err, count: 1, others: []};
      map.set(key, g);
    } else {
      g.count++;
      g.others.push(err);
    }
  }
  return Array.from(map.values());
};

// Expand tabs to spaces so caret alignment matches rendered text.
const expandTabs = (line, tabWidth = 2) => {
  let out = '';
  const colMap = [0]; // 0-based source col -> display col
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\t') {
      const spaces = tabWidth - (out.length % tabWidth);
      out += ' '.repeat(spaces);
    } else {
      out += line[i];
    }
    colMap.push(out.length);
  }
  return {text: out, colMap};
};

// Window very long lines around the error span so output stays readable.
const windowLine = (text, startCol, spanLen, maxWidth = 110) => {
  if (text.length <= maxWidth) {
    return {text, startCol, spanLen};
  }
  const margin = 24;
  const winStart = Math.max(0, startCol - margin);
  const winEnd = Math.min(text.length, winStart + maxWidth);
  const prefix = winStart > 0 ? '…' : '';
  const suffix = winEnd < text.length ? '…' : '';
  const slice = prefix + text.slice(winStart, winEnd) + suffix;
  const adjStart = startCol - winStart + prefix.length;
  const adjSpan = Math.max(1, Math.min(spanLen, slice.length - adjStart - suffix.length));
  return {text: slice, startCol: adjStart, spanLen: adjSpan};
};

const renderSnippet = (err, lines, c) => {
  if (err.line === undefined || !lines || err.line < 1 || err.line > lines.length) {
    return [];
  }
  const ln = err.line;
  const prevLn = ln > 1 ? ln - 1 : null;
  const gutterW = String(ln).length;
  const pad = n => String(n).padStart(gutterW);
  const emptyGutter = ' '.repeat(gutterW);

  const rawLine = lines[ln - 1].replace(/\r$/, '');
  const {text: expLine, colMap} = expandTabs(rawLine);
  const srcStart = Math.max(0, Math.min((err.column || 1) - 1, rawLine.length));
  let srcEnd;
  if (err.endLine === ln && err.endColumn !== undefined && err.endColumn > (err.column || 1)) {
    srcEnd = Math.min(err.endColumn - 1, rawLine.length);
  } else {
    // Highlight opening tag or remaining line on multi-line element
    const gt = rawLine.indexOf('>', srcStart);
    srcEnd = gt !== -1 ? gt + 1 : Math.max(srcStart + 1, rawLine.length);
  }
  const dispStart = colMap[srcStart] || 0;
  const dispEnd = colMap[srcEnd] || (dispStart + 1);
  const win = windowLine(expLine, dispStart, Math.max(1, dispEnd - dispStart));

  const out = [];
  if (prevLn !== null) {
    const prevText = expandTabs(lines[prevLn - 1].replace(/\r$/, '')).text;
    const prevSlice = prevText.length > 110 ? prevText.slice(0, 109) + '…' : prevText;
    out.push(`  ${c.dim(pad(prevLn) + ' │')} ${c.dim(prevSlice)}`);
  }
  out.push(`  ${c.cyan(pad(ln) + ' │')} ${win.text}`);
  out.push(`  ${c.dim(emptyGutter + ' │')} ${' '.repeat(win.startCol)}${c.red(c.bold('^'.repeat(win.spanLen)))}`);
  return out;
};

const formatOthersNote = (others, c) => {
  const sample = others
    .slice(0, 5)
    .map(e => (e.line !== undefined ? String(e.line) : '?'));
  const extra = others.length > 5 ? `, +${others.length - 5} more` : '';
  const where = sample.length ? ` (lines ${sample.join(', ')}${extra})` : '';
  const noun = others.length === 1 ? 'occurrence' : 'occurrences';
  return `  ${c.yellow('= note:')} ${others.length} more identical ${noun}${where}`;
};

const formatDiagnostic = (err, opts = {}) => {
  const c = makeColors(opts.color !== undefined ? opts.color : defaultColor());
  const code = err.code || 'E_XSD';
  const lines = [];

  lines.push(`${c.red(c.bold(`error[${code}]`))}${c.bold(':')} ${err.message}`);

  const locParts = [];
  if (opts.file) { locParts.push(opts.file); }
  if (err.line !== undefined) {
    locParts.push(err.column !== undefined ? `${err.line}:${err.column}` : String(err.line));
  }
  if (locParts.length) {
    lines.push(`  ${c.cyan('╭─▶')} ${locParts.join(':')}`);
  }

  if (opts.sourceLines) {
    lines.push(...renderSnippet(err, opts.sourceLines, c));
  }

  if (err.path) {
    lines.push(`  ${c.dim('╰─ path:')} ${c.dim(err.path)}`);
  }

  if (opts.others && opts.others.length > 0) {
    lines.push(formatOthersNote(opts.others, c));
  }

  return lines.join('\n');
};

const formatReport = (res, opts = {}) => {
  if (res.ok || !res.errors || res.errors.length === 0) {
    return '';
  }
  const group = opts.group !== false;
  const sourceLines = typeof opts.source === 'string' ? opts.source.split('\n') : undefined;
  const color = opts.color !== undefined ? opts.color : defaultColor();

  if (!group) {
    return res.errors
      .map(err => formatDiagnostic(err, {file: opts.file, sourceLines, color}))
      .join('\n\n');
  }

  const groups = groupErrors(res.errors);
  return groups
    .map(g => formatDiagnostic(g.first, {file: opts.file, sourceLines, color, others: g.others}))
    .join('\n\n');
};

// Normalize dynamic values inside error messages for corpus-level cause tallying.
const normalizeCause = msg => msg
  .replace(/'[^']*'/g, '\'…\'')
  .replace(/\[[^\]]*\]/g, '[…]');

const formatCorpusSummary = (entries, opts = {}) => {
  const c = makeColors(opts.color !== undefined ? opts.color : defaultColor());
  const top = opts.top || 10;
  const causes = new Map();

  for (const entry of entries) {
    if (entry.ok || !entry.errors) { continue; }
    const seenInFile = new Set();
    for (const err of entry.errors) {
      const code = err.code || 'E_XSD';
      const norm = normalizeCause(err.message);
      const key = `${code}\0${norm}`;
      let rec = causes.get(key);
      if (!rec) {
        rec = {code, message: norm, count: 0, files: 0};
        causes.set(key, rec);
      }
      rec.count++;
      if (!seenInFile.has(key)) {
        seenInFile.add(key);
        rec.files++;
      }
    }
  }

  if (causes.size === 0) { return ''; }

  const sorted = Array.from(causes.values()).sort((a, b) => b.files - a.files || b.count - a.count);
  const out = [c.bold('Top failure causes:')];
  for (const item of sorted.slice(0, top)) {
    const fStr = `${item.files} ${item.files === 1 ? 'file' : 'files'}`;
    out.push(`  ${c.red(item.code.padEnd(14))} ${c.yellow(String(item.count).padStart(6))}x (${fStr.padStart(10)})  ${item.message}`);
  }
  if (sorted.length > top) {
    out.push(c.dim(`  … and ${sorted.length - top} more distinct cause(s)`));
  }
  return out.join('\n');
};

module.exports = {
  groupErrors,
  formatDiagnostic,
  formatReport,
  formatCorpusSummary
};
