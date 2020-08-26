'use strict';

const mergeTail = require('./merge-tail.js');

const porter = node => {
  let info = mergeTail(node);
  // console.log(info);

  let width;
  let vectors = info.wire.vectors;
  if (vectors === undefined) {
    let vector = info.wire.vector;
    if (vector === undefined) {
      width = 1;
    } else {
      if (Number.isInteger(vector.left) && (vector.right === 0)) {
        width = vector.left + 1;
      } else {
        throw new Error(JSON.stringify(info, null, 2));
      }
    }
  } else {
    let vector = info.wire.vectors.vector;
    if (vector === undefined) {
      width = 1;
    } else {
      if (Number.isInteger(vector.left) && (vector.right === 0)) {
        width = vector.left + 1;
      } else {
        throw new Error(JSON.stringify(info, null, 2));
      }
    }
  }

  let res;

  // res = {
  //   description: info.description,
  //   direction: info.wire.direction,
  //   width: width
  // };

  if (info.wire.direction === 'out') {
    res = -width;
  } else
  if (info.wire.direction === 'in') {
    res = width;
  } else
  if (info.wire.direction === 'inout') {
    res = {
      direction: 'inout',
      width: width
    };
  } else {
    throw new Error(JSON.stringify(info, null, 2));
  }

  return {[info.name]: res};
};

module.exports = porter;
