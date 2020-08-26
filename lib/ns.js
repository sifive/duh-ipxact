'use strict';

// IP-XACT namespaces

const spirit = 'http://www.spiritconsortium.org/XMLSchema';
const spirit14 = spirit + '/SPIRIT/1.4';
const spirit09 = spirit + '/SPIRIT/1685-2009';
const xsi = 'http://www.w3.org/2001/XMLSchema-instance';

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
