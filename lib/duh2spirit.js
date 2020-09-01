'use strict';

const spirit = require('./spirit.js');
const ns = require('./ns.js');

const $ = spirit();

var escapeMap = {
  '&': '&amp;',
  '"': '&quot;',
  '<': '&lt;',
  '>': '&gt;'
};

const toHex = val => {
  if (typeof val === 'string') {
    return val;
  }
  return '0x' + (val >>> 0).toString(16);
};

const xscape = val => {
  if (typeof val !== 'string') {
    return val;
  }
  return val.replace(/([&"<>])/g, (_, e) => escapeMap[e]);
};

const attr = (node, attr) => attr
  .trim()
  .split(/\s+/)
  .map(e => (node[e] !== undefined) ? [$[e], xscape(node[e])] : null)
  .filter(e => e);

const enumeratedValues = field => Array.isArray(field.enumeratedValues)
  ? [[$.enumeratedValues].concat(field.enumeratedValues.map(e =>
    [$.enumeratedValue].concat(attr(e, 'name description value'))
  ))]
  : [];

const component = (p, version) => [$.component, ns[version]()]
  .concat(attr(p, 'vendor library name version'));

const fields = node => node.map(e => [$.field]
  .concat(attr(e, 'name description bitOffset bitWidth access modifiedWriteValue readAction'))
  .concat(enumeratedValues(e))
);

const registers = node => node.map(e => [$.register]
  .concat(attr(e, 'name description addressOffset size volatile'))
  .concat([[$.reset,
    [$.value, toHex(e.resetValue)],
    [$.mask, toHex(e.resetMask)]
  ]])
  .concat(fields(e.fields))
);

const addressBlocks = node => node.map(e => [$.addressBlock]
  .concat(attr(e, 'name baseAddress range width'))
  .concat(registers(e.registers))
);

const memoryMaps = node => [$.memoryMaps]
  .concat(node.map(e => [$.memoryMap, {}, [$.name, e.name]]
    .concat(addressBlocks(e.addressBlocks))
  ));

module.exports = (node, version) =>
  component(node.component, version || 'spirit14')
    .concat([memoryMaps(node.component.memoryMaps || [])]);
