'use strict';

// Synthetic IP-XACT zoo: test/zoo/<version>/*.xml
//
// Per file: version detect, structural XSD check, xmllint (if available),
// import (ml2on), round-trip XML → DuH → XML.
// import / round-trip outcomes are ratcheted against test/zoo/status.json:
// a change in either direction fails; run `UPDATE_ZOO=1 npm test` to accept.
// XSD element coverage of zoo per version must not decrease.

const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');
const onml = require('onml');
const {expect} = require('chai');

const {versions, detect} = require('../lib/versions.js');
const check = require('../lib/xsd/check.js');
const {walk} = require('../lib/xsd/walk.js');
const ml2on = require('../lib/ml2on.js');
const duh2spirit = require('../lib/duh2spirit.js');
const canon = require('./lib/canon.js');

const root = path.resolve(__dirname, '..');
const zooDir = path.join(__dirname, 'zoo');
const statusFile = path.join(zooDir, 'status.json');
const update = !!process.env.UPDATE_ZOO;

const status = fs.existsSync(statusFile)
  ? JSON.parse(fs.readFileSync(statusFile, 'utf8'))
  : {files: {}, coverage: {}};
const actual = {files: {}, coverage: {}};

const hasXmllint = (() => {
  try { execFileSync('xmllint', ['--version'], {stdio: 'ignore'}); return true; } catch { return false; }
})();

// exporters available today (P0 baseline)
const exporters = {
  'spirit-1.4': duh => duh2spirit(duh, 'spirit14'),
  'spirit-2009': duh => duh2spirit(duh, 'spirit2009')
};

const tryIt = fn => {
  try { return {ok: true, res: fn()}; } catch (err) { return {ok: false, err}; }
};

describe('zoo', () => {

  after(() => {
    if (update) {
      fs.writeFileSync(statusFile, JSON.stringify(actual, null, 2) + '\n');
    }
  });

  versions.map(v => {
    const dir = path.join(zooDir, v.id);
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.xml')).sort() : [];
    const table = require('../lib/xsd/' + v.id + '.json');
    const used = new Set();

    describe(v.id, () => {

      files.map(fname => {
        const rel = v.id + '/' + fname;
        const file = path.join(dir, fname);
        const str = fs.readFileSync(file, 'utf8');
        const doc = onml.parse(str);

        describe(fname, () => {

          it('version', () => {
            expect(detect(doc)).to.equal(v);
          });

          it('structural XSD check', () => {
            walk(table, doc, (node, {name, type}) => { if (type && type !== '*') { used.add(name); } });
            expect(check(table, doc)).to.deep.equal([]);
          });

          it('xmllint', function () {
            const xsd = path.join(root, 'accellera.org', 'XMLSchema', v.dir, 'index.xsd');
            if (!hasXmllint || !fs.existsSync(xsd)) { this.skip(); }
            execFileSync('xmllint', ['--noout', '--schema', xsd, file], {stdio: 'pipe'});
          });

          it('import / round-trip (ratchet)', () => {
            const imp = tryIt(() => ml2on(onml.parse(str)));
            let rt = 'fail';
            if (imp.ok && exporters[v.id]) {
              const exp = tryIt(() => onml.stringify(exporters[v.id](imp.res)));
              if (exp.ok && tryIt(() => expect(canon(exp.res)).to.deep.equal(canon(str))).ok) {
                rt = 'ok';
              }
            }
            const res = {import: imp.ok ? 'ok' : 'fail', roundtrip: rt};
            actual.files[rel] = res;
            if (!update) {
              expect(res).to.deep.equal((status.files || {})[rel]);
            }
          });
        });
      });

      describe('coverage', () => it('XSD element coverage (ratchet)', () => {
        actual.coverage[v.id] = {used: used.size, total: table.elements.length};
        if (!update) {
          const base = (status.coverage || {})[v.id] || {used: 0};
          expect(used.size).to.be.at.least(base.used);
        }
      }));
    });
  });
});

/* eslint-env mocha */
