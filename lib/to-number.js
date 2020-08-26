'use strict';

const toNumber = node => {
  const str = node.full[2] || '';

  if (typeof str !== 'string') {
    throw new Error(JSON.stringify(node.full, null, 2));
  }

  const m16 = str.match(/^'h([0-9a-zA-Z]+)$/);
  if (m16) {
    return Number('0x' + m16[1].trim());
  }

  const m2 = str.match('\'b([01]+)');
  if (m2) {
    return Number('0b' + m2[1].trim());
  }

  const m10 = str.match('\'d([0-9]+)');
  if (m10) {
    return Number(m10[1].trim());
  }

  const res = Number(str);
  return Number.isNaN(res) ? str : res;
};

module.exports = toNumber;
