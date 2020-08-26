'use strict';

const mergeTail = node => {
  let res = {};
  const arr = node.full;
  for (let i = 2; i < arr.length; i++) {
    const ai = arr[i];
    Object.keys(ai).map(key => {
      if (res[key] === undefined) {
        res[key] = ai[key];
      } else if (Array.isArray(res[key])) {
        res[key] = res[key].concat(ai[key]);
      } else {
        res[key] = ai[key];
      }
    });
  }
  return res;
};

module.exports = mergeTail;
