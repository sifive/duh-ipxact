'use strict';

const chai = require('chai');
const onml = require('onml');

const lib = require('../lib/index.js');
const toBigInt = require('../lib/to-bigint.js');

const expect = chai.expect;

describe('basic', () => {

  it('one', () => {
    expect(lib.ml2on).to.be.a('function');
  });

  it('duh2spirit is function', () => {
    expect(lib.duh2spirit).to.be.a('function');
  });

  it('ipxactSchemas is array', () => {
    expect(lib.ipxactSchemas).to.be.a('array');
  });

  it('toBigInt parses hex, bin, oct, dec, verilog literals and 64-bit values', () => {
    const mk = s => ({full: ['spirit:baseAddress', {}, s]});
    expect(toBigInt(mk('0x80000000000000'))).to.equal(0x80000000000000n);
    expect(toBigInt(mk('0x80000000000004'))).to.equal(0x80000000000004n);
    expect(toBigInt(mk('\'h8000_0000_0000_0004'))).to.equal(0x8000000000000004n);
    expect(toBigInt(mk('64\'hff'))).to.equal(0xffn);
    expect(toBigInt(mk('\'b1010'))).to.equal(10n);
    expect(toBigInt(mk('\'o77'))).to.equal(63n);
    expect(toBigInt(mk('\'d42'))).to.equal(42n);
    expect(toBigInt(mk(''))).to.equal(0n);
    expect(toBigInt(mk('$param'))).to.equal('$param');
  });

  it('ml2on parses address fields as BigInt and duh2spirit serializes them', () => {
    const xml = `<spirit:component xmlns:spirit="http://www.spiritconsortium.org/XMLSchema/SPIRIT/1685-2009">
      <spirit:vendor>v</spirit:vendor><spirit:library>l</spirit:library><spirit:name>n</spirit:name><spirit:version>1</spirit:version>
      <spirit:memoryMaps><spirit:memoryMap><spirit:name>CPU</spirit:name>
        <spirit:addressBlock>
          <spirit:name>hi</spirit:name>
          <spirit:baseAddress>0x80000000000004</spirit:baseAddress>
          <spirit:range>0x100000000</spirit:range>
          <spirit:width>32</spirit:width>
          <spirit:usage>register</spirit:usage>
          <spirit:register>
            <spirit:name>r0</spirit:name>
            <spirit:addressOffset>0x10</spirit:addressOffset>
            <spirit:size>32</spirit:size>
            <spirit:field><spirit:name>f0</spirit:name><spirit:bitOffset>0</spirit:bitOffset><spirit:bitWidth>32</spirit:bitWidth></spirit:field>
          </spirit:register>
        </spirit:addressBlock>
      </spirit:memoryMap></spirit:memoryMaps>
    </spirit:component>`;
    const duh = lib.ml2on(onml.parse(xml));
    const ab = duh.component.memoryMaps[0].addressBlocks[0];
    expect(ab.baseAddress).to.equal(0x80000000000004n);
    expect(ab.range).to.equal(0x100000000n);
    expect(ab.registers[0].addressOffset).to.equal(0x10n);
    const out = onml.stringify(lib.duh2spirit(duh, 'spirit2009'));
    expect(out).to.include('0x80000000000004');
    expect(out).to.include('0x100000000');
  });

});

/* eslint-env mocha */
