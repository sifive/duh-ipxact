'use strict';

const duhCore = require('duh-core');
const spirit = require('./spirit.js');
const ns = require('./ns.js');

const {isTarget, isInitiator} = duhCore.interfaceMode;

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
  .concat(
    attr(e, 'name description bitOffset bitWidth access modifiedWriteValue readAction'),
    enumeratedValues(e)
  ));

const registers = node => node.map(e => [$.register]
  .concat(
    attr(e, 'name description addressOffset size volatile'),
    [[$.reset,
      [$.value, toHex(e.resetValue)],
      [$.mask, toHex(e.resetMask)]
    ]],
    fields(e.fields)
  ));

const addressBlocks = node => node.map(e => [$.addressBlock]
  .concat(
    attr(e, 'name baseAddress range width usage'),
    registers(e.registers || [])
  ));

const memoryMaps = node => [$.memoryMaps]
  .concat(node.map(e => [$.memoryMap, {}, [$.name, e.name]]
    .concat(addressBlocks(e.addressBlocks))
  ));

const modelPorts = comp => {
  const model = comp.model || {};
  const ports = model.ports || {};
  const portNames = Object.keys(ports);
  if (portNames.length === 0) {
    return [];
  }
  return [[$.model, [$.ports].concat(portNames.map(portName => {
    const dir = (ports[portName] > 0) ? 'in' : 'out';
    return [$.port, [$.name, portName], [$.wire, [$.direction, dir]]];
  }))]];
};

const portMaps = pm => {
  const lnames = Object.keys(pm);
  if (lnames.length === 0) {
    return [];
  }
  return [[$.portMaps].concat(lnames.map(lname => {
    return [$.portMap,
      [$.logicalPort, [$.name, lname]],
      [$.physicalPort, [$.name, pm[lname]]]
    ];
  }))];
};

const cpus = comp => {
  const els = comp.cpus || [];
  if (els.length === 0) {
    return [];
  }
  return [[$.cpus].concat(comp.cpus.map(cpu => [$.cpu,
    [$.name, cpu.name],
    [$.addressSpaceRef, {[$.addressSpaceRef]: cpu.addressSpaceRef}]
  ]))];
};

const busInterfaces = comp => {
  const bis = comp.busInterfaces || [];
  if (bis.length === 0) {
    return [];
  }
  return [[$.busInterfaces].concat(bis.map(bi => {
    const abstractionType = bi.abstractionTypes[0];
    const abstractionRef = abstractionType.abstractionRef;
    return [$.busInterface,
      [$.name, bi.name],
      [$.busType, {
        [$.vendor]: bi.busType.vendor,
        [$.library]: bi.busType.library,
        [$.name]: bi.busType.name,
        [$.version]: bi.busType.version
      }],
      [$.abstractionType, {
        [$.vendor]: abstractionRef.vendor,
        [$.library]: abstractionRef.library,
        [$.name]: abstractionRef.name,
        [$.version]: abstractionRef.version
      }]
    ].concat(
      isInitiator(bi) ? [[$.master]] : [],
      isTarget(bi)
        ? [[$.slave].concat(
          bi.memoryMapRef
            ? [[$.memoryMapRef, {[$.memoryMapRef]: bi.memoryMapRef}]]
            : []
        )]
        : [],
      portMaps(abstractionType.portMaps)
    );
  }))];
};

module.exports = (node, version) => {
  const comp = node.component;
  return component(comp, version || 'spirit14')
    .concat(
      cpus(comp),
      busInterfaces(comp),
      [memoryMaps(comp.memoryMaps || [])],
      modelPorts(comp)
    );
};
