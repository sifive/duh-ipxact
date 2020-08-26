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

  if (
    (info.name === undefined) ||
    (info.wire === undefined) ||
    (info.wire.direction === undefined)
  ) {
    throw new Error(JSON.stringify(info, null, 2));
  }

  // if (info.description) {
  //   return {[info.name]: {
  //     description: info.description,
  //     direction: info.wire.direction,
  //     width: width
  //   }};
  // }

  if (info.wire.direction === 'out') {
    return {[info.name]: -width};
  }

  if (info.wire.direction === 'in') {
    return {[info.name]: width};
  }

  return {[info.name]: {
    direction: info.wire.direction,
    width: width
  }};
};

module.exports = porter;
