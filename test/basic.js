'use strict';

const chai = require('chai');
const ml2on = require('../lib/ml2on.js');

const expect = chai.expect;

describe('basic', () => {
  it('one', done => {
    expect(ml2on).to.be.a('function');
    done();
  });
});

/* eslint-env mocha */
