'use strict';

const chai = require('chai');
const ml2on = require('../lib/ml2on.js');
const duh2spirit = require('../lib/duh2spirit.js');

const expect = chai.expect;

describe('basic', () => {

  it('one', done => {
    expect(ml2on).to.be.a('function');
    done();
  });

  it('duh2spirit is function', done => {
    expect(duh2spirit).to.be.a('function');
    done();
  });

});

/* eslint-env mocha */
