#!/usr/bin/env node
'use strict';

// Search GitHub (via `gh`) for real-world IP-XACT / SPIRIT XML corpora across
// all 4 standard versions and all 9 document kinds, harvesting coherent
// multi-kind document trees with preserved VLNV / relative folder structure
// into `pub/<version>/<user>--<repo>/...` (surveyed by `npm run zoo:survey`).
//
// Modes:
//   tree (default)  group sniffed XMLs per (repo, version), score by distinct
//                   document kinds & resolved internal VLNV cross-references,
//                   and harvest whole interconnected trees (+ _tree.json index).
//   file            pick largest individual files per new (version, kind, producer, vendor).
//
// Document kinds per version:
//   all 4 versions: component, busDefinition, abstractionDefinition, design,
//                   designConfiguration, abstractor, generatorChain
//   2014 + 2022:    catalog
//   2022 only:      typeDefinitions
//
// Usage:
//   bin/find-ipxact.js [options]
//     --mode MODE          tree (default) or file
//     --version LIST       comma list of versions (default: spirit-1.4,spirit-2009,ipxact-2014,ipxact-2022)
//     --kind LIST          comma list of root kinds (default: all 9 IP-XACT document kinds)
//     --corpus DIR         local corpus root; stored in DIR/<version>/ (default: pub)
//     --min-size N         min file size, k/M/G suffix (default: 200)
//     --max-size N         max file size (default: 50M)
//     --query STR          override search queries (repeatable)
//     --pages N            code-search pages per query, 100 hits/page (default: 1)
//     --max-repos N        max repos to scan trees per version/kind bucket (default: 40)
//     --max-per-repo N     file mode: max extra tree .xml files per repo (default: 30)
//     --max-tree-files N   tree mode: max .xml files to inspect/harvest per repo (default: 200)
//     --min-kinds N        tree mode: min distinct document kinds in a tree (default: 2)
//     --max-trees N        tree mode: max trees to pick per version (default: 10)
//     --vlnv-layout        tree mode --fetch: organize files as <vendor>/<library>/<name>/<ver>/<file>
//     --no-trees           only inspect files returned directly by code search
//     --per-key N          file mode: keep N biggest files per new version/kind/producer/vendor (default: 1)
//     --all                include already-present trees/files and trees below --min-kinds
//     --no-lfs             do not resolve git-lfs pointers
//     --fetch              download picks into <corpus>/<version>/
//     --out FILE           JSON report (default: tmp/find-ipxact.json)
//     --cache FILE         cache (default: tmp/find-ipxact-cache.json)
//
// Requires: gh (authenticated), node >= 22.

const {spawn} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const {versions: SUPPORTED, byId: VER_BY_ID} = require('../lib/versions.js');

// ---------------------------------------------------------------- versions, kinds & queries
const COMMON_KINDS = [
  'component',
  'busDefinition',
  'abstractionDefinition',
  'design',
  'designConfiguration',
  'abstractor',
  'generatorChain'
];

const KINDS_BY_VER = {
  'spirit-1.4': [...COMMON_KINDS],
  'spirit-2009': [...COMMON_KINDS],
  'ipxact-2014': [...COMMON_KINDS, 'catalog'],
  'ipxact-2022': [...COMMON_KINDS, 'catalog', 'typeDefinitions']
};

const ALL_VERSIONS = SUPPORTED.map(v => v.id);
const ALL_KINDS = [...COMMON_KINDS, 'catalog', 'typeDefinitions'];
const IPXACT_ROOTS = new Set(ALL_KINDS);

const EXTRA_COMPONENT_TERMS = {
  'spirit-1.4': ['memoryMaps', 'busInterfaces'],
  'spirit-2009': ['memoryMaps', 'busInterfaces', 'xilinx', 'PeakRDL', 'kactus2', 'arm.com'],
  'ipxact-2014': ['memoryMaps', 'busInterfaces', 'PeakRDL', 'kactus2', 'rggen', 'accellera'],
  'ipxact-2022': ['memoryMaps', 'busInterfaces']
};

const queriesFor = (ver, kind) => {
  const v = VER_BY_ID[ver];
  const ns = `"XMLSchema/${v.dir}"`;
  const p = v.prefix;

  if (kind === 'component') {
    const base = [`${ns} "${p}:component" extension:xml`];
    for (const term of EXTRA_COMPONENT_TERMS[ver] || []) {
      const isTag = term === 'memoryMaps' || term === 'busInterfaces';
      base.push(`${ns} "${isTag ? `${p}:${term}` : term}" extension:xml`);
    }
    return base;
  }
  if (kind === 'design') {
    return [
      `${ns} "${p}:design" extension:xml`,
      `${ns} "componentInstances" extension:xml`
    ];
  }
  return [`${ns} "${kind}" extension:xml`];
};

const NS_TO_VER = new Map([
  ...SUPPORTED.map(v => [v.ns, v.id]),
  ['http://www.spiritconsortium.org/XMLSchema/SPIRIT/1.0', 'spirit-1.0'],
  ['http://www.spiritconsortium.org/XMLSchema/SPIRIT/1.1', 'spirit-1.1'],
  ['http://www.spiritconsortium.org/XMLSchema/SPIRIT/1.2', 'spirit-1.2'],
  ['http://www.spiritconsortium.org/XMLSchema/SPIRIT/1.5', 'spirit-1.5']
]);

// ---------------------------------------------------------------- options
const printHelp = () => {
  const src = fs.readFileSync(__filename, 'utf8').split('\n');
  const start = src.findIndex(l => l.startsWith('//'));
  const doc = [];
  for (let k = start; k < src.length && src[k].startsWith('//'); k++) {
    doc.push(src[k].slice(3));
  }
  console.log(doc.join('\n'));
};

const validateOpt = opt => {
  if (opt.mode !== 'tree' && opt.mode !== 'file') {
    console.error(`unknown mode ${opt.mode} (expected: tree, file)`);
    process.exit(2);
  }
  for (const v of opt.version) {
    if (!KINDS_BY_VER[v]) {
      console.error(`unknown version ${v} (expected: ${ALL_VERSIONS.join(', ')})`);
      process.exit(2);
    }
  }
  for (const k of opt.kind) {
    if (!IPXACT_ROOTS.has(k)) {
      console.error(`unknown kind ${k} (expected: ${ALL_KINDS.join(', ')})`);
      process.exit(2);
    }
  }
};

const parseArgs = argv => {
  const opt = {
    mode: 'tree',
    version: [...ALL_VERSIONS],
    kind: [...ALL_KINDS],
    corpus: 'pub',
    minSize: '200',
    maxSize: '50M',
    pages: 1,
    maxRepos: 40,
    maxPerRepo: 30,
    maxTreeFiles: 200,
    minKinds: 2,
    maxTrees: 10,
    vlnvLayout: false,
    trees: true,
    perKey: 1,
    all: false,
    lfs: true,
    fetch: false,
    out: 'tmp/find-ipxact.json',
    cache: 'tmp/find-ipxact-cache.json',
    query: []
  };

  const splitList = (s, lower) => s.split(',')
    .map(x => (lower ? x.trim().toLowerCase() : x.trim()))
    .filter(Boolean);

  const handlers = {
    '--mode': v => { opt.mode = v().toLowerCase(); },
    '--version': v => { opt.version = splitList(v(), true); },
    '--kind': v => { opt.kind = splitList(v(), false); },
    '--corpus': v => { opt.corpus = v(); },
    '--min-size': v => { opt.minSize = v(); },
    '--max-size': v => { opt.maxSize = v(); },
    '--query': v => { opt.query.push(v()); },
    '--pages': v => { opt.pages = +v(); },
    '--max-repos': v => { opt.maxRepos = +v(); },
    '--max-per-repo': v => { opt.maxPerRepo = +v(); },
    '--max-tree-files': v => { opt.maxTreeFiles = +v(); },
    '--min-kinds': v => { opt.minKinds = +v(); },
    '--max-trees': v => { opt.maxTrees = +v(); },
    '--vlnv-layout': () => { opt.vlnvLayout = true; },
    '--no-trees': () => { opt.trees = false; },
    '--per-key': v => { opt.perKey = +v(); },
    '--all': () => { opt.all = true; },
    '--no-lfs': () => { opt.lfs = false; },
    '--fetch': () => { opt.fetch = true; },
    '--out': v => { opt.out = v(); },
    '--cache': v => { opt.cache = v(); },
    '-h': () => { printHelp(); process.exit(0); },
    '--help': () => { printHelp(); process.exit(0); }
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const fn = handlers[a];
    if (!fn) {
      console.error(`unknown arg ${a}`);
      process.exit(2);
    }
    fn(() => argv[++i]);
  }
  validateOpt(opt);
  return opt;
};

const opt = parseArgs(process.argv.slice(2));

const parseSize = s => {
  const m = String(s).match(/^(\d+(?:\.\d+)?)([kKmMgG]?)$/);
  if (!m) { throw new Error(`bad size ${s}`); }
  return Math.round(+m[1] * ({'': 1, k: 1e3, m: 1e6, g: 1e9})[m[2].toLowerCase()]);
};
const MIN = parseSize(opt.minSize);
const MAX = parseSize(opt.maxSize);
const corpusDir = ver => path.join(opt.corpus, ver);

// ---------------------------------------------------------------- producer classifier
const FAMILIES = [
  ['vivado', /xilinx|vivado|amd\.com/i],
  ['quartus', /altera|quartus|qsys|platform designer|intel\.com/i],
  ['kactus2', /kactus2|tut\.fi|tuni\.fi/i],
  ['peakrdl', /peakrdl|systemrdl/i],
  ['rggen', /\brggen\b/i],
  ['cheby', /\bcheby\b|cern\.ch|ohwr\.org/i],
  ['corsair', /\bcorsair\b/i],
  ['agnisys', /agnisys|idesignspec/i],
  ['magillem', /magillem|arteris/i],
  ['socrates', /socrates|arm\.com|\barm\b/i],
  ['synopsys', /synopsys|coreconsultant|snps/i],
  ['cadence', /cadence|jasper|xcelium/i],
  ['siemens', /mentor|siemens|tessent/i],
  ['semifore', /semifore|csrcompiler/i],
  ['sifive', /sifive|\bduh\b/i],
  ['openhw', /openhw|cv32|cva6|pulp-platform/i],
  ['lowrisc', /lowrisc|opentitan|reggen/i],
  ['lattice', /lattice/i],
  ['microchip', /microchip|microsemi|actel/i],
  ['analog', /analog\.com|adi\b/i],
  ['nxp', /nxp\.com|freescale/i],
  ['ti', /\bti\.com\b|texas instruments/i],
  ['accellera', /accellera|spiritconsortium/i],
  ['fusesoc', /fusesoc|edalize/i],
  ['spinalhdl', /spinalhdl/i],
  ['chisel', /\bchisel\b|diplomacy/i],
  ['litex', /\blitex\b/i],
  ['cocotb', /cocotb/i],
  ['esa', /\besa\.int\b|gaisler|grlib/i]
];

const classify = text => {
  if (!text) { return 'other'; }
  for (const [name, re] of FAMILIES) {
    if (re.test(text)) { return name; }
  }
  return 'other';
};

// ---------------------------------------------------------------- XML sniffing
const FEATURE_RE = [
  ['mem', /<(?:[\w-]+:)?memoryMaps\b/],
  ['bus', /<(?:[\w-]+:)?busInterfaces\b/],
  ['ports', /<(?:[\w-]+:)?(?:ports|signals)\b/],
  ['model', /<(?:[\w-]+:)?model\b/],
  ['params', /<(?:[\w-]+:)?parameters\b/],
  ['files', /<(?:[\w-]+:)?fileSets\b/],
  ['vext', /<(?:[\w-]+:)?vendorExtensions\b/],
  ['addr', /<(?:[\w-]+:)?addressSpaces\b/],
  ['cpu', /<(?:[\w-]+:)?cpus\b/],
  ['remap', /<(?:[\w-]+:)?remapStates\b/],
  ['inst', /<(?:[\w-]+:)?componentInstances\b/],
  ['conn', /<(?:[\w-]+:)?interconnections\b/],
  ['adHoc', /<(?:[\w-]+:)?adHocConnections\b/],
  ['viewCfg', /<(?:[\w-]+:)?viewConfiguration\b/],
  ['gen', /<(?:[\w-]+:)?generator\b/],
  ['cat', /<(?:[\w-]+:)?ipxactFile\b/],
  ['tdef', /<(?:[\w-]+:)?(?:memoryMapDefinitions|registerDefinitions|fieldDefinitions)\b/]
];

const grabTag = (head, tag) => {
  const re = new RegExp(`<(?:[\\w-]+:)?${tag}\\b[^>]*>([^<]+)</(?:[\\w-]+:)?${tag}>`);
  const m = head.match(re);
  return m ? m[1].trim() : '';
};

// Extract referenced VLNVs from XML tags carrying vendor/library/name/version attrs
const extractRefs = head => {
  const refs = new Set();
  const tagRe = /<[\w:-]+\s+[^>]*\b(?:[\w-]+:)?vendor\s*=\s*["'][^"']+["'][^>]*>/g;
  const attr = (s, k) => {
    const m = s.match(new RegExp(`\\b(?:[\\w-]+:)?${k}\\s*=\\s*["']([^"']+)["']`));
    return m ? m[1].trim() : '';
  };
  let m;
  while ((m = tagRe.exec(head)) !== null) {
    const tag = m[0];
    const v = attr(tag, 'vendor');
    const l = attr(tag, 'library');
    const n = attr(tag, 'name');
    const r = attr(tag, 'version');
    if (v && l && n && r) {
      refs.add(`${v}/${l}/${n}/${r}`);
    }
  }
  return [...refs];
};

const parseXmlns = attrs => {
  const xmlns = {};
  const nsRe = /xmlns(?::([A-Za-z_][\w.-]*))?\s*=\s*["']([^"']+)["']/g;
  let m;
  while ((m = nsRe.exec(attrs)) !== null) {
    xmlns[m[1] || ''] = m[2].trim();
  }
  return xmlns;
};

const detectVersion = (xmlns, rootPrefix) => {
  const direct = NS_TO_VER.get(xmlns[rootPrefix]);
  if (direct) { return direct; }
  for (const uri of Object.values(xmlns)) {
    if (NS_TO_VER.has(uri)) { return NS_TO_VER.get(uri); }
  }
  return null;
};

const extractRoot = head => {
  const comments = [];
  const stripped = head
    .replace(/<!--([\s\S]*?)-->/g, (_, c) => { comments.push(c.trim()); return ' '; })
    .replace(/<\?[\s\S]*?\?>/g, ' ')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, ' ');
  const m = stripped.match(/<([A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?)(\s[^>]*)?>/);
  if (!m) { return null; }
  const full = m[1];
  const idx = full.indexOf(':');
  return {
    prefix: idx >= 0 ? full.slice(0, idx) : '',
    local: idx >= 0 ? full.slice(idx + 1) : full,
    xmlns: parseXmlns(m[2] || ''),
    comments
  };
};

// Returns {version, root, vendor, library, name, rev, vlnv, refs, family, producer, features, lfs?, lfsSize?}
const sniff = buf => {
  const head = buf.toString('utf8', 0, Math.min(buf.length, 65536));
  if (head.startsWith('version https://git-lfs')) {
    return {version: 'lfs', lfsSize: +(head.match(/\nsize (\d+)/)?.[1] ?? 0)};
  }
  if (!head.trimStart().startsWith('<')) {
    return {version: 'non-xml'};
  }

  const root = extractRoot(head);
  if (!root) { return {version: 'non-xml'}; }

  const version = detectVersion(root.xmlns, root.prefix);
  if (!version || !IPXACT_ROOTS.has(root.local)) {
    return {version: 'other-xml', root: root.local};
  }

  const vendor = grabTag(head, 'vendor');
  const library = grabTag(head, 'library');
  const name = grabTag(head, 'name');
  const rev = grabTag(head, 'version');
  const vlnv = vendor && library && name && rev ? `${vendor}/${library}/${name}/${rev}` : '';

  const commentText = root.comments.slice(0, 5).join(' ').replace(/\s+/g, ' ').slice(0, 300);
  const extraNs = Object.entries(root.xmlns)
    .filter(([, uri]) => !NS_TO_VER.has(uri) && !/w3\.org/.test(uri))
    .map(([k, uri]) => `${k}=${uri}`)
    .join(' ');
  const clue = [commentText, extraNs, vendor].filter(Boolean).join(' | ');
  const genMatch = commentText.match(/(?:generated|created|exported)\s+by\s+([^.;,\n]{2,50})/i);

  return {
    version,
    root: root.local,
    vendor,
    library,
    name,
    rev,
    vlnv,
    refs: extractRefs(head),
    family: classify(clue),
    producer: (genMatch && genMatch[1].trim()) || vendor || '(none)',
    features: FEATURE_RE.filter(([, re]) => re.test(head)).map(([k]) => k)
  };
};

// ---------------------------------------------------------------- utils
const sleep = ms => new Promise(r => setTimeout(r, ms));
const human = n => (
  n >= 1e9 ? (n / 1e9).toFixed(2) + 'G' :
    n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' :
      n >= 1e3 ? (n / 1e3).toFixed(0) + 'k' :
        String(n)
);
const log = (...a) => console.error(...a);
const pad = (s, n) => String(s).padEnd(n).slice(0, n);
const sanitizeSeg = s => String(s || '_').replace(/[^\w.-]/g, '_');

const CACHE_VER = 2;
let cache = fs.existsSync(opt.cache) ? JSON.parse(fs.readFileSync(opt.cache, 'utf8')) : {};
if (cache.ver !== CACHE_VER) {
  cache = {ver: CACHE_VER, search: cache.search ?? {}, trees: cache.trees ?? {}};
}
cache.search ??= {};
cache.trees ??= {};
cache.heads ??= {};

const saveCache = () => {
  fs.mkdirSync(path.dirname(opt.cache), {recursive: true});
  fs.writeFileSync(opt.cache, JSON.stringify(cache));
};

const run = (cmd, args) => new Promise(resolve => {
  const p = spawn(cmd, args, {stdio: ['ignore', 'pipe', 'pipe']});
  const out = [];
  const err = [];
  p.stdout.on('data', d => out.push(d));
  p.stderr.on('data', d => err.push(d));
  const t = setTimeout(() => p.kill(), 120000);
  p.on('close', status => {
    clearTimeout(t);
    resolve({
      status,
      stdout: Buffer.concat(out).toString('utf8'),
      stderr: Buffer.concat(err).toString('utf8')
    });
  });
});

const gh = async (args, {retries = 5} = {}) => {
  for (let attempt = 0; ; attempt++) {
    const r = await run('gh', ['api', ...args]);
    if (r.status === 0) {
      return JSON.parse(r.stdout || 'null');
    }
    const err = (r.stderr || '') + (r.stdout || '');
    if (/rate limit|secondary|abuse|HTTP 403|HTTP 429/i.test(err) && attempt < retries) {
      const wait = 15000 * (attempt + 1);
      log(`  rate limited, waiting ${wait / 1000}s ...`);
      await sleep(wait);
      continue;
    }
    if (/HTTP 5\d\d/.test(err) && attempt < retries) {
      await sleep(3000);
      continue;
    }
    throw new Error(`gh api ${args.join(' ')}: ${err.trim().split('\n')[0]}`);
  }
};

const encPath = p => p.split('/').map(encodeURIComponent).join('/');
const rawUrl = (repo, p) => `https://raw.githubusercontent.com/${repo}/HEAD/${encPath(p)}`;
const lfsUrl = (repo, p) => `https://media.githubusercontent.com/media/${repo}/HEAD/${encPath(p)}`;

const fetchBytes = async (url, bytes) => {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {Range: `bytes=0-${bytes - 1}`},
        signal: AbortSignal.timeout(30000)
      });
      if (!res.ok) { throw new Error(`HTTP ${res.status}`); }
      const contentRange = res.headers.get('content-range');
      const totalFromRange = contentRange ? +(contentRange.match(/\/(\d+)$/)?.[1] ?? 0) : 0;
      const contentLength = +(res.headers.get('content-length') ?? 0);
      const reader = res.body.getReader();
      const chunks = [];
      let n = 0;
      while (n < bytes) {
        const {done, value} = await reader.read();
        if (done) { break; }
        chunks.push(value);
        n += value.length;
      }
      reader.cancel().catch(() => {});
      const buf = Buffer.concat(chunks).subarray(0, bytes);
      return {buf, size: totalFromRange || contentLength || buf.length};
    } catch (e) {
      if (attempt >= 2 || /HTTP 4\d\d/.test(e.message)) { throw e; }
      await sleep(1000);
    }
  }
};

const downloadFile = async (url, dst) => {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, {signal: AbortSignal.timeout(60000)});
      if (!res.ok) { throw new Error(`HTTP ${res.status}`); }
      const buf = Buffer.from(await res.arrayBuffer());
      fs.mkdirSync(path.dirname(dst), {recursive: true});
      fs.writeFileSync(dst, buf);
      return buf.length;
    } catch (e) {
      if (attempt >= 2 || /HTTP 4\d\d/.test(e.message)) { throw e; }
      await sleep(1000);
    }
  }
};

const fetchHead = async (repo, p, bytes = 32768) => {
  const key = `${repo}/${p}`;
  if (cache.heads[key]) { return cache.heads[key]; }
  let h;
  try {
    const {buf, size} = await fetchBytes(rawUrl(repo, p), bytes);
    h = {...sniff(buf), fetchedSize: size};
    if (h.version === 'lfs' && opt.lfs) {
      const lfsSize = h.lfsSize;
      const lfsRes = await fetchBytes(lfsUrl(repo, p), bytes);
      h = {...sniff(lfsRes.buf), lfs: true, lfsSize, fetchedSize: lfsSize || lfsRes.size};
    }
  } catch (e) {
    h = {version: 'error', error: e.message};
  }
  cache.heads[key] = h;
  return h;
};

const pool = async (items, n, fn) => {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({length: n}, async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k], k);
    }
  }));
  return out;
};

const commonDirPrefix = paths => {
  const dirs = paths.map(p => {
    const d = path.posix.dirname(p);
    return d === '.' ? [] : d.split('/');
  });
  if (!dirs.length) { return ''; }
  let prefix = dirs[0];
  for (let i = 1; i < dirs.length && prefix.length; i++) {
    let j = 0;
    while (j < prefix.length && j < dirs[i].length && prefix[j] === dirs[i][j]) { j++; }
    prefix = prefix.slice(0, j);
  }
  return prefix.join('/');
};

const familyKey = c => `${c.version}|${c.root}|${c.family}`;
const detailKey = c => `${c.version}|${c.root}|${c.family}|${(c.vendor || '').toLowerCase()}`;

const SKIP_XML_RE = /(?:^|\/)(?:pom|package|build|settings|checkstyle|junit|coverage|doxygen|androidmanifest|strings|styles|colors|layout|csproj|vcxproj|plist|manifest|sitemap|rss|atom|feed|svg|xsl|xslt|xsd|wsdl|cmakelists)\.xml$|(?:^|\/)(?:doxygen|javadoc|node_modules|\.git|\.github|\.vscode|\.idea|cmake|gradle|maven|android|ios|res\/values)\//i;
const LIKELY_IPXACT_RE = /(?:component|ipxact|spirit|busdef|absdef|abstraction|abstractor|design|designcfg|designconfig|generator|catalog|typedef|csr|regmap|registers?|memorymap|hw_?ip|ip_?repo)/i;

// ---------------------------------------------------------------- 1. corpus inventory
const listXmlLocal = dir => {
  const res = [];
  if (!fs.existsSync(dir)) { return res; }
  for (const e of fs.readdirSync(dir, {recursive: true, withFileTypes: true})) {
    if (e.isFile() && e.name.toLowerCase().endsWith('.xml')) {
      res.push(path.join(e.parentPath || dir, e.name));
    }
  }
  return res.sort();
};

const loadCorpus = () => {
  const corpus = [];
  for (const fp of listXmlLocal(opt.corpus)) {
    const st = fs.statSync(fp);
    const fd = fs.openSync(fp, 'r');
    const buf = Buffer.alloc(Math.min(65536, st.size));
    fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    const h = sniff(buf);
    if (!opt.version.includes(h.version)) { continue; }
    if (!opt.kind.includes(h.root)) { continue; }
    corpus.push({file: fp, size: st.size, ...h});
  }

  const haveFamily = new Map();
  const haveDetail = new Map();
  for (const c of corpus) {
    const fk = familyKey(c);
    const dk = detailKey(c);
    haveFamily.set(fk, Math.max(haveFamily.get(fk) ?? 0, c.size));
    haveDetail.set(dk, Math.max(haveDetail.get(dk) ?? 0, c.size));
  }
  log(`corpus: ${corpus.length} files in ${opt.corpus}/, ${haveFamily.size} distinct version/kind/producers`);
  return {corpus, haveFamily, haveDetail};
};

// ---------------------------------------------------------------- 2. code search
const buildSearchPlan = () => {
  if (opt.query.length) {
    return opt.query.map(q => ({bucket: 'custom', q}));
  }
  const plan = [];
  for (const ver of opt.version) {
    const valid = KINDS_BY_VER[ver];
    for (const kind of opt.kind) {
      if (!valid.includes(kind)) { continue; }
      for (const q of queriesFor(ver, kind)) {
        plan.push({bucket: `${ver}|${kind}`, q});
      }
    }
  }
  return plan;
};

const searchRepos = async () => {
  // Search API: 10 req/min for code search. Throttle ~6.5s between calls.
  const directHits = new Map();
  const repos = new Map();
  const perBucketRepos = new Map();
  let lastSearch = 0;

  const searchOnce = async query => {
    const found = [];
    for (let page = 1; page <= opt.pages; page++) {
      const key = `${query}#${page}`;
      let items = cache.search[key];
      if (!items) {
        const wait = lastSearch + 6500 - Date.now();
        if (wait > 0) { await sleep(wait); }
        lastSearch = Date.now();
        try {
          const r = await gh([
            '-X', 'GET', 'search/code',
            '-f', `q=${query}`,
            '-f', 'per_page=100',
            '-f', `page=${page}`
          ]);
          items = (r.items || []).map(it => ({
            repo: it.repository.full_name,
            path: it.path,
            sha: it.sha || ''
          }));
          cache.search[key] = items;
          saveCache();
        } catch (e) {
          log(`  search failed: ${e.message}`);
          break;
        }
      }
      found.push(...items);
      if (items.length < 100) { break; }
    }
    return found;
  };

  for (const {bucket, q} of buildSearchPlan()) {
    if (!perBucketRepos.has(bucket)) { perBucketRepos.set(bucket, []); }
    const items = await searchOnce(q);
    let added = 0;
    for (const it of items) {
      if (!repos.has(it.repo)) {
        repos.set(it.repo, {buckets: new Set(), queries: new Set(), dirs: new Set()});
        added++;
      }
      const r = repos.get(it.repo);
      if (!r.buckets.has(bucket)) {
        r.buckets.add(bucket);
        perBucketRepos.get(bucket).push(it.repo);
      }
      r.queries.add(q);
      r.dirs.add(path.posix.dirname(it.path));

      const hk = `${it.repo}/${it.path}`;
      if (!directHits.has(hk)) {
        directHits.set(hk, {repo: it.repo, path: it.path, sha: it.sha, size: null, queries: new Set()});
      }
      directHits.get(hk).queries.add(q);
    }
    log(`[${bucket}] search ${q}: ${items.length} hits, +${added} repos (total ${repos.size})`);
  }
  return {directHits, repos, perBucketRepos};
};

// ---------------------------------------------------------------- 3. repo trees
const fetchRepoTree = async repo => {
  if (cache.trees[repo]) { return cache.trees[repo]; }
  let tree;
  try {
    const r = await gh([`repos/${repo}/git/trees/HEAD?recursive=1`]);
    tree = (r.tree || [])
      .filter(t => t.type === 'blob' && t.path.toLowerCase().endsWith('.xml') && !SKIP_XML_RE.test(t.path))
      .map(t => ({path: t.path, size: t.size, sha: t.sha}));
  } catch (e) {
    log(`  tree ${repo}: ${e.message}`);
    tree = [];
  }
  cache.trees[repo] = tree;
  return tree;
};

const inHitSubtree = (p, hitRoots) => {
  for (const r of hitRoots) {
    if (!r || p === r || p.startsWith(r + '/')) { return true; }
  }
  return false;
};

const collectCandidates = async ({directHits, repos, perBucketRepos}) => {
  const byPath = new Map();
  for (const [hk, hit] of directHits) {
    byPath.set(hk, {repo: hit.repo, path: hit.path, sha: hit.sha, size: hit.size, queries: [...hit.queries]});
  }
  if (!opt.trees) {
    log(`direct hits: ${byPath.size} candidate files (--no-trees)`);
    return byPath;
  }

  const scan = new Set();
  for (const [, list] of perBucketRepos) {
    for (const r of list.slice(0, opt.maxRepos)) { scan.add(r); }
  }
  const repoList = [...scan];
  const isLfsSized = s => s >= 100 && s <= 300;
  const maxExtras = opt.mode === 'tree' ? opt.maxTreeFiles : opt.maxPerRepo;
  let treesDone = 0;

  await pool(repoList, 4, async repo => {
    const tree = await fetchRepoTree(repo);
    const hitDirs = repos.get(repo).dirs;
    const hitPrefix = commonDirPrefix([...hitDirs].map(d => (d === '.' ? 'x' : `${d}/x`)));
    const hitRoots = new Set([...hitDirs, ...(hitPrefix ? [hitPrefix] : [])]);
    const inBounds = tree.filter(t => (t.size >= MIN && t.size <= MAX) || (opt.lfs && isLfsSized(t.size)));

    for (const t of inBounds) {
      const c = byPath.get(`${repo}/${t.path}`);
      if (c) {
        c.size = t.size;
        c.sha = t.sha || c.sha;
      }
    }

    const extras = inBounds
      .filter(t => !byPath.has(`${repo}/${t.path}`))
      .map(t => ({
        ...t,
        score: (hitDirs.has(path.posix.dirname(t.path)) ? 3 : 0) +
          (inHitSubtree(t.path, hitRoots) ? 2 : 0) +
          (LIKELY_IPXACT_RE.test(t.path) ? 1 : 0)
      }))
      .filter(t => t.score > 0 || inBounds.length <= maxExtras)
      .sort((a, b) => b.score - a.score || b.size - a.size)
      .slice(0, maxExtras);

    for (const t of extras) {
      byPath.set(`${repo}/${t.path}`, {
        repo, path: t.path, size: t.size, sha: t.sha, queries: [...repos.get(repo).queries]
      });
    }
    if (++treesDone % 25 === 0) {
      log(`  trees ${treesDone}/${repoList.length}`);
      saveCache();
    }
  });
  saveCache();
  log(`trees: ${repoList.length} repos scanned, ${byPath.size} candidate files`);
  return byPath;
};

// ---------------------------------------------------------------- 4. tree assembly & scoring
const treeSlug = repo => repo.replace('/', '--');

const buildTrees = found => {
  const grouped = new Map(); // repo|version -> files[]
  for (const c of found) {
    const k = `${c.repo}|${c.version}`;
    if (!grouped.has(k)) { grouped.set(k, []); }
    grouped.get(k).push(c);
  }

  const trees = [];
  for (const files of grouped.values()) {
    const {repo, version} = files[0];
    const kinds = [...new Set(files.map(f => f.root))].sort();
    const families = [...new Set(files.map(f => f.family))].sort();
    const prefix = commonDirPrefix(files.map(f => f.path));
    const vlnvSet = new Set(files.map(f => f.vlnv).filter(Boolean));

    let totalRefs = 0;
    let resolvedRefs = 0;
    for (const f of files) {
      for (const ref of f.refs || []) {
        if (ref === f.vlnv) { continue; }
        totalRefs++;
        if (vlnvSet.has(ref)) { resolvedRefs++; }
      }
    }

    const dstDir = path.join(corpusDir(version), treeSlug(repo));
    trees.push({
      repo,
      version,
      prefix,
      url: `https://github.com/${repo}/tree/HEAD${prefix ? '/' + encPath(prefix) : ''}`,
      dstDir,
      exists: fs.existsSync(dstDir),
      kinds,
      families,
      fileCount: files.length,
      totalSize: files.reduce((a, b) => a + b.size, 0),
      vlnvCount: vlnvSet.size,
      resolvedRefs,
      totalRefs,
      files: files.sort((a, b) => a.path.localeCompare(b.path))
    });
  }
  return trees;
};

const pickTrees = trees => {
  const byVer = new Map();
  for (const t of trees) {
    if (!opt.all && (t.exists || t.kinds.length < opt.minKinds)) { continue; }
    if (!byVer.has(t.version)) { byVer.set(t.version, []); }
    byVer.get(t.version).push(t);
  }

  const picks = [];
  for (const ver of opt.version) {
    const list = (byVer.get(ver) || []).sort((a, b) => (
      b.kinds.length - a.kinds.length ||
      b.resolvedRefs - a.resolvedRefs ||
      b.fileCount - a.fileCount ||
      b.totalSize - a.totalSize
    ));
    const seenShas = new Set();
    let kept = 0;
    for (const t of list) {
      if (!opt.all) {
        const shas = t.files.map(f => f.sha).filter(Boolean);
        const dup = shas.length ? shas.filter(s => seenShas.has(s)).length / shas.length : 0;
        if (dup >= 0.7) { continue; }
        for (const s of shas) { seenShas.add(s); }
      }
      picks.push(t);
      if (!opt.all && ++kept >= opt.maxTrees) { break; }
    }
  }
  return picks;
};

// ---------------------------------------------------------------- 5. report & fetch
const printMatrix = (corpus, found) => {
  const count = items => {
    const m = new Map();
    for (const c of items) {
      const k = `${c.version}|${c.root}`;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  };
  const cMap = count(corpus);
  const fMap = count(found);

  console.log('\n== coverage matrix (corpus / found)');
  console.log(pad('kind', 22) + opt.version.map(v => pad(v, 13)).join(''));
  for (const kind of opt.kind) {
    const cols = opt.version.map(ver => {
      if (!KINDS_BY_VER[ver].includes(kind)) { return pad('-', 13); }
      const k = `${ver}|${kind}`;
      return pad(`${cMap.get(k) ?? 0} / ${fMap.get(k) ?? 0}`, 13);
    });
    console.log(pad(kind, 22) + cols.join(''));
  }
};

const printCorpus = corpus => {
  console.log('\n== corpus');
  const stats = new Map();
  for (const c of corpus) {
    const k = familyKey(c);
    const s = stats.get(k) ?? {n: 0, vendors: new Set(), max: 0};
    s.n++;
    if (c.vendor) { s.vendors.add(c.vendor); }
    s.max = Math.max(s.max, c.size);
    stats.set(k, s);
  }
  for (const ver of opt.version) {
    const rows = [...stats].filter(([k]) => k.startsWith(ver + '|')).sort();
    if (!rows.length) {
      console.log(`${pad(ver, 12)} (empty: ${corpusDir(ver)}/)`);
      continue;
    }
    for (const [k, s] of rows) {
      const [, kind, fam] = k.split('|');
      console.log(
        `${pad(ver, 12)} ${pad(kind, 21)} ${pad(fam, 12)} ${String(s.n).padStart(3)} files  max ${pad(human(s.max), 7)} ${[...s.vendors].slice(0, 4).join(' | ')}`
      );
    }
  }
};

const printFilePicks = picks => {
  console.log(`\n== candidate files (${picks.length}; N=new producer, v=new vendor, >=larger than corpus max, L=git-lfs)`);
  for (const c of picks) {
    const flag = (c.newFamily ? 'N' : c.newVendor ? 'v' : ' ') +
      (c.largerThanCorpus ? '>' : ' ') +
      (c.lfs ? 'L' : ' ');
    const feats = c.features?.length ? `[${c.features.join(',')}]` : '';
    console.log(
      `${flag} ${pad(c.version, 12)} ${pad(c.root, 21)} ${pad(c.family, 12)} ${pad(human(c.size), 7)} ${pad(c.producer, 24)} ${pad(feats, 24)} ${c.url}`
    );
  }
};

const printTreePicks = picks => {
  console.log(`\n== candidate trees (${picks.length}; N=new tree, refs=resolved/total internal VLNV refs)`);
  for (const t of picks) {
    const flag = t.exists ? ' ' : 'N';
    const refs = `${t.resolvedRefs}/${t.totalRefs} refs`;
    const fams = t.families.slice(0, 3).join(',');
    console.log(
      `${flag} ${pad(t.version, 12)} ${pad(`${t.kinds.length} kinds`, 8)} ${pad(`${t.fileCount} files`, 10)} ${pad(human(t.totalSize), 7)} ${pad(refs, 13)} ${pad(fams, 18)} ${t.url}`
    );
    console.log(`    kinds: ${t.kinds.join(', ')}`);
  }
};

const printSniffSummary = uniq => {
  const byVer = {};
  for (const c of uniq) {
    byVer[c.version] = (byVer[c.version] ?? 0) + 1;
  }
  console.log(`\nsniffed: ${Object.entries(byVer).map(([k, v]) => `${k}=${v}`).join(' ')}`);
};

const targetPathFor = (t, f) => {
  if (opt.vlnvLayout && f.vendor && f.library && f.name && f.rev) {
    return path.join(
      t.dstDir,
      sanitizeSeg(f.vendor),
      sanitizeSeg(f.library),
      sanitizeSeg(f.name),
      sanitizeSeg(f.rev),
      path.basename(f.path).replace(/\s/g, '_')
    );
  }
  const rel = t.prefix ? path.posix.relative(t.prefix, f.path) : f.path;
  return path.join(t.dstDir, ...rel.split('/'));
};

const fetchTrees = async picks => {
  for (const t of picks) {
    fs.mkdirSync(t.dstDir, {recursive: true});
    const manifestFiles = [];
    let ok = 0;
    let fail = 0;
    await pool(t.files, 6, async f => {
      const dst = targetPathFor(t, f);
      const rel = path.relative(t.dstDir, dst).split(path.sep).join('/');
      if (fs.existsSync(dst)) {
        ok++;
      } else {
        try {
          await downloadFile(f.download, dst);
          ok++;
        } catch (e) {
          fail++;
          log(`  FAIL ${f.url}: ${e.message}`);
          return;
        }
      }
      manifestFiles.push({
        path: rel,
        repoPath: f.path,
        kind: f.root,
        vlnv: f.vlnv,
        family: f.family,
        size: f.size,
        sha: f.sha,
        url: f.url
      });
    });

    const manifest = {
      repo: t.repo,
      version: t.version,
      prefix: t.prefix,
      url: t.url,
      layout: opt.vlnvLayout ? 'vlnv' : 'subtree',
      kinds: t.kinds,
      resolvedRefs: t.resolvedRefs,
      totalRefs: t.totalRefs,
      files: manifestFiles.sort((a, b) => a.path.localeCompare(b.path))
    };
    fs.writeFileSync(path.join(t.dstDir, '_tree.json'), JSON.stringify(manifest, null, 2) + '\n');
    log(`tree  ${t.dstDir}/ (${ok} ok${fail ? `, ${fail} fail` : ''}, kinds: ${t.kinds.join(',')})`);
  }
};

const fetchFiles = async picks => {
  await pool(picks, 6, async c => {
    const dir = corpusDir(c.version);
    const [user, repo] = c.repo.split('/');
    const sub = path.basename(path.dirname(c.path)) || 'x';
    const base = path.basename(c.path).replace(/\s/g, '_');
    const fam = sanitizeSeg(c.family);
    const dst = path.join(dir, `${c.root}--${fam}--${user}--${repo}--${sub}--${base}`);
    if (fs.existsSync(dst)) {
      log(`have  ${dst}`);
      return;
    }
    try {
      const n = await downloadFile(c.download, dst);
      log(`ok    ${dst} ${human(n)}`);
    } catch (e) {
      log(`FAIL  ${c.url}: ${e.message}`);
      fs.rmSync(dst, {force: true});
    }
  });
};

// ---------------------------------------------------------------- main
const dedupeCandidates = byPath => {
  if (opt.mode === 'tree') {
    // Keep per-repo files intact so every tree has all its own files
    return [...byPath.values()];
  }
  const bySha = new Map();
  for (const c of byPath.values()) {
    const key = c.sha || `${c.repo}/${c.path}`;
    if (!bySha.has(key) || bySha.get(key).repo > c.repo) {
      bySha.set(key, c);
    }
  }
  return [...bySha.values()];
};

const pickFiles = (found, haveFamily, haveDetail) => {
  for (const c of found) {
    const fk = familyKey(c);
    c.newFamily = !haveFamily.has(fk);
    c.newVendor = !haveDetail.has(detailKey(c));
    c.largerThanCorpus = c.size > (haveFamily.get(fk) ?? 0);
  }
  const groups = new Map();
  for (const c of found.filter(x => opt.all || x.newFamily || x.newVendor)) {
    const k = opt.all ? (c.sha || `${c.repo}/${c.path}`) : detailKey(c);
    if (!groups.has(k)) { groups.set(k, []); }
    groups.get(k).push(c);
  }
  return [...groups.values()]
    .flatMap(g => g.sort((a, b) => b.size - a.size).slice(0, opt.all ? 1 : opt.perKey))
    .sort((a, b) => (
      a.version.localeCompare(b.version) ||
      a.root.localeCompare(b.root) ||
      a.family.localeCompare(b.family) ||
      b.size - a.size
    ));
};

const main = async () => {
  const {corpus, haveFamily, haveDetail} = loadCorpus();
  const searchRes = await searchRepos();
  const byPath = await collectCandidates(searchRes);
  const items = dedupeCandidates(byPath);

  let done = 0;
  await pool(items, 8, async c => {
    const h = await fetchHead(c.repo, c.path);
    Object.assign(c, h);
    c.size = h.lfs ? (h.lfsSize || c.size || h.fetchedSize || 0) : (c.size ?? h.fetchedSize ?? 0);
    if (++done % 25 === 0) {
      log(`  headers ${done}/${items.length}`);
      saveCache();
    }
  });
  saveCache();

  const found = items.filter(c => (
    opt.version.includes(c.version) &&
    opt.kind.includes(c.root) &&
    c.size >= MIN &&
    c.size <= MAX
  ));
  for (const c of found) {
    c.url = `https://github.com/${c.repo}/blob/HEAD/${encPath(c.path)}`;
    c.download = c.lfs ? lfsUrl(c.repo, c.path) : rawUrl(c.repo, c.path);
  }

  printCorpus(corpus);
  printMatrix(corpus, found);

  let report;
  if (opt.mode === 'tree') {
    const allTrees = buildTrees(found);
    const picks = pickTrees(allTrees);
    printTreePicks(picks);
    printSniffSummary(items);
    report = {mode: 'tree', corpus, picks, trees: allTrees};
    if (opt.fetch) { await fetchTrees(picks); }
  } else {
    const picks = pickFiles(found, haveFamily, haveDetail);
    printFilePicks(picks);
    printSniffSummary(items);
    report = {mode: 'file', corpus, picks, all: found};
    if (opt.fetch) { await fetchFiles(picks); }
  }

  fs.mkdirSync(path.dirname(opt.out), {recursive: true});
  fs.writeFileSync(opt.out, JSON.stringify(report, null, 2));
  log(`report: ${opt.out}`);
};

main().catch(err => {
  console.error(err);
  process.exit(1);
});
