'use strict';

const spirit = require('./spirit.js');

const $ = spirit();

const attr = (node, attr) => attr
  .trim()
  .split(/\s+/)
  .map(e => (node[e] !== undefined) ? [$[e], node[e]] : null)
  .filter(e => e);

const enumeratedValues = field => Array.isArray(field.enumeratedValues)
  ? [[$.enumeratedValues].concat(field.enumeratedValues.map(e =>
    [$.enumeratedValue].concat(attr(e, 'name description value'))
  ))]
  : [];

const component = p => [$.component, {
  'xmlns:spirit': 'http://www.spiritconsortium.org/XMLSchema/SPIRIT/1.4',
  'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
  'xsi:schemaLocation': 'http://www.spiritconsortium.org/XMLSchema/SPIRIT/1.4 http://www.spiritconsortium.org/XMLSchema/SPIRIT/1.4/index.xsd'
}]
  .concat(attr(p, 'vendor library name version'));

const fields = node => node.map(e => [$.field]
  .concat(attr(e, 'name description bitOffset bitWidth access'))
  .concat(enumeratedValues(e))
);

const registers = node => node.map(e => [$.register]
  .concat(attr(e, 'name description addressOffset access size'))
  .concat([[$.reset,
    [$.value, 0],
    [$.mask, '0xFFFFFFFF']
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
    .concat([memoryMaps(node.component.memoryMaps)]);
