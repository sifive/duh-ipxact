'use strict';

const chai = require('chai');

const lib = require('../lib/index.js');

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

});

/* eslint-env mocha */
