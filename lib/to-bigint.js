'use strict';

const toBigInt = node => {
  const str = node.full[2] || '';

  if (typeof str !== 'string') {
    throw new Error(JSON.stringify(node.full, null, 2));
  }

  const s = str.trim();
  if (s === '') {
    return 0n;
  }

  const m16 = s.match(/^(?:\d+)?'h([0-9a-fA-F_]+)$/);
  if (m16) {
    return BigInt('0x' + m16[1].replace(/_/g, ''));
  }

  const m2 = s.match(/^(?:\d+)?'b([01_]+)$/);
  if (m2) {
    return BigInt('0b' + m2[1].replace(/_/g, ''));
  }

  const m8 = s.match(/^(?:\d+)?'o([0-7_]+)$/);
  if (m8) {
    return BigInt('0o' + m8[1].replace(/_/g, ''));
  }

  const m10 = s.match(/^(?:\d+)?'d([0-9_]+)$/);
  if (m10) {
    return BigInt(m10[1].replace(/_/g, ''));
  }

  try {
    return BigInt(s.replace(/_/g, ''));
  } catch {
    return str;
  }
};

module.exports = toBigInt;
