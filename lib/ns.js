'use strict';

// IP-XACT namespaces

let spirit = 'http://www.spiritconsortium.org/XMLSchema';
let spirit14 = spirit + '/SPIRIT/1.4';
let spirit09 = spirit + '/SPIRIT/1685-2009';
let xsi = 'http://www.w3.org/2001/XMLSchema-instance';

exports.spirit14 = obj => Object.assign((obj || {}), {
  'xmlns:spirit': spirit14,
  'xmlns:xsi': xsi,
  'xsi:schemaLocation': spirit14 + ' ' + spirit14 + '/index.xsd'
});

exports.spirit2009 = obj => Object.assign((obj || {}), {
  'xmlns:spirit': spirit09,
  'xmlns:xsi': xsi,
  // 'xmlns:arm': 'http://www.arm.com/SPIRIT/1685-2009',
  'xsi:schemaLocation': spirit09 + ' ' + spirit09 + '/index.xsd'
});
