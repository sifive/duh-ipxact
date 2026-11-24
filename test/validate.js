'use strict';

const {expect} = require('chai');
const {validate, formatError, groupErrors, formatReport, formatCorpusSummary} = require('../lib/xsd/validate.js');

const NS14 = 'http://www.accellera.org/XMLSchema/IPXACT/1685-2014';

const wrap14 = body => [
  '<?xml version="1.0" encoding="UTF-8"?>',
  `<ipxact:component xmlns:ipxact="${NS14}">`,
  '  <ipxact:vendor>example.com</ipxact:vendor>',
  '  <ipxact:library>lib</ipxact:library>',
  '  <ipxact:name>comp0</ipxact:name>',
  '  <ipxact:version>1.0</ipxact:version>',
  ...body,
  '</ipxact:component>',
  ''
].join('\n');

describe('xsd validate', () => {
  it('valid minimal ipxact-2014 component', () => {
    const res = validate(wrap14([]));
    expect(res).to.deep.equal({ok: true, version: 'ipxact-2014', errors: []});
  });

  it('reports line and column for invalid enumeration', () => {
    const xml = wrap14([
      '  <ipxact:memoryMaps>',
      '    <ipxact:memoryMap>',
      '      <ipxact:name>mm0</ipxact:name>',
      '      <ipxact:addressBlock>',
      '        <ipxact:name>ab0</ipxact:name>',
      '        <ipxact:baseAddress>0</ipxact:baseAddress>',
      '        <ipxact:range>4</ipxact:range>',
      '        <ipxact:width>32</ipxact:width>',
      '        <ipxact:access>BOGUS</ipxact:access>',
      '      </ipxact:addressBlock>',
      '    </ipxact:memoryMap>',
      '  </ipxact:memoryMaps>'
    ]);
    const res = validate(xml);
    expect(res.ok).to.equal(false);
    expect(res.version).to.equal('ipxact-2014');
    expect(res.errors).to.have.lengthOf(1);
    expect(res.errors[0].line).to.equal(15);
    expect(res.errors[0].column).to.equal(9);
    expect(res.errors[0].message).to.include('not in enumeration');
    expect(formatError(res.errors[0], 'a.xml')).to.match(/^a\.xml:15:9: /);
  });

  it('rejects unexpected attribute', () => {
    const xml = wrap14([
      '  <ipxact:memoryMaps>',
      '    <ipxact:memoryMap bogus="1">',
      '      <ipxact:name>mm0</ipxact:name>',
      '    </ipxact:memoryMap>',
      '  </ipxact:memoryMaps>'
    ]);
    const res = validate(xml);
    expect(res.ok).to.equal(false);
    expect(res.errors.some(e => e.message.includes('unexpected attribute bogus'))).to.equal(true);
  });

  it('checks xs:key uniqueness (duplicate memoryMap name)', () => {
    const xml = wrap14([
      '  <ipxact:memoryMaps>',
      '    <ipxact:memoryMap><ipxact:name>dup</ipxact:name></ipxact:memoryMap>',
      '    <ipxact:memoryMap><ipxact:name>dup</ipxact:name></ipxact:memoryMap>',
      '  </ipxact:memoryMaps>'
    ]);
    const res = validate(xml);
    expect(res.ok).to.equal(false);
    expect(res.errors.some(e => e.message.includes('duplicate key') && e.line === 9)).to.equal(true);
  });

  it('checks xs:keyref (dangling memoryMapRef)', () => {
    const xml = wrap14([
      '  <ipxact:busInterfaces>',
      '    <ipxact:busInterface>',
      '      <ipxact:name>bi0</ipxact:name>',
      '      <ipxact:busType vendor="v" library="l" name="b" version="1"/>',
      '      <ipxact:slave>',
      '        <ipxact:memoryMapRef memoryMapRef="missing_mm"/>',
      '      </ipxact:slave>',
      '    </ipxact:busInterface>',
      '  </ipxact:busInterfaces>'
    ]);
    const res = validate(xml);
    expect(res.ok).to.equal(false);
    expect(res.errors.some(e => e.message.includes('keyref') && e.message.includes('missing_mm'))).to.equal(true);
  });

  it('rejects unrecognized namespace and malformed XML', () => {
    const r1 = validate('<foo xmlns="http://example.com/unknown"/>');
    expect(r1.ok).to.equal(false);
    expect(r1.version).to.equal(null);

    const r2 = validate('<unclosed>');
    expect(r2.ok).to.equal(false);
    expect(r2.version).to.equal(null);
  });

  it('groups identical errors and renders source snippet', () => {
    const xml = wrap14([
      '  <ipxact:memoryMaps>',
      '    <ipxact:memoryMap>',
      '      <ipxact:name>mm0</ipxact:name>',
      '      <ipxact:addressBlock>',
      '        <ipxact:name>ab0</ipxact:name>',
      '        <ipxact:baseAddress>0</ipxact:baseAddress>',
      '        <ipxact:range>4</ipxact:range>',
      '        <ipxact:width>32</ipxact:width>',
      '        <ipxact:register>',
      '          <ipxact:name>r0</ipxact:name>',
      '          <ipxact:addressOffset>0</ipxact:addressOffset>',
      '          <ipxact:size>32</ipxact:size>',
      '          <ipxact:field><ipxact:name>f0</ipxact:name><ipxact:bitOffset>0</ipxact:bitOffset><ipxact:bitWidth>1</ipxact:bitWidth><ipxact:access>WARL</ipxact:access></ipxact:field>',
      '          <ipxact:field><ipxact:name>f1</ipxact:name><ipxact:bitOffset>1</ipxact:bitOffset><ipxact:bitWidth>1</ipxact:bitWidth><ipxact:access>WARL</ipxact:access></ipxact:field>',
      '        </ipxact:register>',
      '      </ipxact:addressBlock>',
      '    </ipxact:memoryMap>',
      '  </ipxact:memoryMaps>'
    ]);
    const res = validate(xml);
    expect(res.ok).to.equal(false);
    expect(res.errors).to.have.lengthOf(2);
    expect(res.errors[0].code).to.equal('E_ENUM');

    const groups = groupErrors(res.errors);
    expect(groups).to.have.lengthOf(1);
    expect(groups[0].count).to.equal(2);

    const out = formatReport(res, {file: 'x.xml', source: xml, color: false});
    expect(out).to.include('error[E_ENUM]:');
    expect(out).to.include('╭─▶ x.xml:19:');
    expect(out).to.include('<ipxact:access>WARL</ipxact:access>');
    expect(out).to.include('^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^');
    expect(out).to.include('= note: 1 more identical occurrence (lines 20)');

    const corpus = formatCorpusSummary([res], {color: false});
    expect(corpus).to.include('Top failure causes:');
    expect(corpus).to.include('E_ENUM');
  });
});
