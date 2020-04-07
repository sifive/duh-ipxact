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

const component = p => [$.component, ns.spirit14()]
  .concat(attr(p, 'vendor library name version'));

const fields = node => node.map(e => [$.field]
  .concat(attr(e, 'name description bitOffset bitWidth access'))
  .concat(enumeratedValues(e))
);

const registers = node => node.map(e => [$.register]
  .concat(attr(e, 'name description addressOffset size'))
  .concat([[$.reset,
    [$.value, '0x' + (e.resetValue >>> 0).toString(16)],
    [$.mask, '0x' + (e.resetMask >>> 0).toString(16)]
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

module.exports = node =>
  component(node.component)
    .concat([memoryMaps(node.component.memoryMaps || [])]);
