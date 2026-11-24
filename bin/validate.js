#!/usr/bin/env node
'use strict';

// Validate XML files (default: tmp/) against their detected IP-XACT / SPIRIT XSD schema.
// Uses vanilla JS validator (lib/xsd/validate.js) by default with grouped diagnostics
// and source-code snippets; pass --xmllint to use external xmllint.
//
// usage: node bin/validate.js [options] [file-or-dir ...]

const fs = require('node:fs/promises');
const path = require('node:path');
const {execFile} = require('node:child_process');
const {promisify, parseArgs} = require('node:util');
const onml = require('onml');

const {detect} = require('../lib/versions.js');
const {validate, groupErrors, formatReport, formatCorpusSummary} = require('../lib/xsd/validate.js');

const execFileAsync = promisify(execFile);
const root = path.resolve(__dirname, '..');

const usage = `Usage: node bin/validate.js [options] [file-or-dir ...]

Options:
  --all        show every error occurrence (disable per-file grouping)
  --summary    print only summary and top failure causes
  --json       emit machine-readable JSON report
  --no-color   disable ANSI colors
  --xmllint    validate using external xmllint instead of vanilla JS checker
  -h, --help   display help`;

const fileExists = async p => {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
};

const collectXml = async targets => {
  const files = [];
  for (const target of targets) {
    const abs = path.resolve(root, target);
    if (!(await fileExists(abs))) {
      console.error(`skip (not found): ${target}`);
      continue;
    }
    const stat = await fs.stat(abs);
    if (stat.isFile()) {
      files.push(abs);
    } else if (stat.isDirectory()) {
      const entries = await fs.readdir(abs, {recursive: true, withFileTypes: true});
      for (const e of entries) {
        if (e.isFile() && e.name.endsWith('.xml')) {
          files.push(path.join(e.parentPath || abs, e.name));
        }
      }
    }
  }
  return files.sort();
};

const checkXmllint = async () => {
  try {
    await execFileAsync('xmllint', ['--version']);
  } catch {
    console.error('error: xmllint not found in PATH');
    process.exit(1);
  }
};

const validateWithJs = async (file, opts) => {
  const rel = path.relative(root, file);
  const xml = await fs.readFile(file, 'utf8');
  const res = validate(xml);
  const rendered = (!res.ok && !opts.summary && !opts.json)
    ? formatReport(res, {file: rel, source: xml, group: !opts.all, color: opts.color})
    : '';
  return {
    file: rel,
    ok: res.ok,
    version: res.version || 'unknown',
    errors: res.errors,
    groups: res.ok ? 0 : groupErrors(res.errors).length,
    rendered
  };
};

const validateWithXmllint = async file => {
  const rel = path.relative(root, file);
  let doc;
  try {
    doc = onml.parse(await fs.readFile(file, 'utf8'));
  } catch (err) {
    return {file: rel, ok: false, version: 'parse-error', errors: [{code: 'E_PARSE', message: err.message}], rendered: err.message};
  }

  const ver = detect(doc);
  if (!ver) {
    return {file: rel, ok: false, version: 'unknown', errors: [{code: 'E_NS_UNKNOWN', message: 'unrecognized IP-XACT / SPIRIT namespace'}], rendered: 'unrecognized IP-XACT / SPIRIT namespace'};
  }

  const xsd = path.join(root, 'accellera.org', 'XMLSchema', ver.dir, 'index.xsd');
  if (!(await fileExists(xsd))) {
    const msg = `missing schema: ${path.relative(root, xsd)} (run "npm run fetch")`;
    return {file: rel, ok: false, version: ver.id, errors: [{code: 'E_SCHEMA', message: msg}], rendered: msg};
  }

  try {
    await execFileAsync('xmllint', ['--noout', '--schema', xsd, file], {maxBuffer: 16 * 1024 * 1024});
    return {file: rel, ok: true, version: ver.id, errors: [], rendered: ''};
  } catch (err) {
    const detail = (err.stderr || err.stdout || err.message || '').trim();
    const lines = detail ? detail.split('\n') : [];
    return {file: rel, ok: false, version: ver.id, errors: lines.map(m => ({code: 'E_XMLLINT', message: m})), rendered: detail};
  }
};

const main = async () => {
  let parsed;
  try {
    parsed = parseArgs({
      options: {
        all: {type: 'boolean', default: false},
        summary: {type: 'boolean', default: false},
        json: {type: 'boolean', default: false},
        'no-color': {type: 'boolean', default: false},
        xmllint: {type: 'boolean', default: false},
        help: {type: 'boolean', short: 'h', default: false}
      },
      allowPositionals: true
    });
  } catch (err) {
    console.error(err.message);
    console.log(usage);
    process.exit(1);
  }

  const {values, positionals} = parsed;
  if (values.help) {
    console.log(usage);
    return;
  }

  const targets = positionals.length ? positionals : ['tmp'];
  if (values.xmllint) {
    await checkXmllint();
  }

  const files = await collectXml(targets);
  if (files.length === 0) {
    console.log('no XML files found');
    return;
  }

  const color = values['no-color'] ? false : Boolean(process.stdout.isTTY && !process.env.NO_COLOR);
  const results = [];
  let passed = 0;
  let failed = 0;

  for (const file of files) {
    const res = values.xmllint
      ? await validateWithXmllint(file)
      : await validateWithJs(file, {all: values.all, summary: values.summary, json: values.json, color});
    results.push(res);
    if (res.ok) {
      passed++;
      if (!values.summary && !values.json) {
        console.log(`PASS [${res.version}] ${res.file}`);
      }
    } else {
      failed++;
      if (!values.summary && !values.json) {
        const counts = res.groups
          ? ` (${res.groups} unique, ${res.errors.length} total)`
          : '';
        console.log(`FAIL [${res.version}] ${res.file}${counts}`);
        if (res.rendered) {
          console.log(res.rendered);
        }
      }
    }
  }

  if (values.json) {
    const payload = {
      passed,
      failed,
      total: files.length,
      files: results.map(({file, ok, version, errors}) => ({file, ok, version, errors}))
    };
    console.log(JSON.stringify(payload, null, 2));
  } else {
    if (failed > 0 && (values.summary || files.length > 1)) {
      const corpus = formatCorpusSummary(results, {color});
      if (corpus) {
        console.log('\n' + corpus);
      }
    }
    console.log(`\nSummary: ${passed}/${files.length} passed, ${failed} failed`);
  }

  if (failed > 0) {
    process.exit(1);
  }
};

main().catch(err => {
  console.error(err);
  process.exit(1);
});
