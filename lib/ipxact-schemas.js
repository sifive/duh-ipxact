'use strict';

let tree = {
  'accellera.org': {XMLSchema: {
    IPXACT: {
      '1685-2014': [
        'abstractionDefinition',
        'abstractor',
        'autoConfigure',
        'busDefinition',
        'busInterface',
        'catalog',
        'commonStructures',
        'component',
        'configurable',
        'constraints',
        'design',
        'designConfig',
        'file',
        'fileType',
        'generator',
        'identifier',
        'index',
        'memoryMap',
        'model',
        'port',
        'signalDrivers',
        'simpleTypes',
        'subInstances',
        'xml'
      ]
    },
    SPIRIT: {
      '1685-2009': [
        'abstractionDefinition',
        'abstractor',
        'autoConfigure',
        'busDefinition',
        'busInterface',
        'commonStructures',
        'component',
        'configurable',
        'constraints',
        'design',
        'designConfig',
        'file',
        'fileType',
        'generator',
        'identifier',
        'index',
        'memoryMap',
        'model',
        'port',
        'signalDrivers',
        'simpleTypes',
        'subInstances'
      ]
    }
  }}
};

let res = [];

let rec = (path, node) => {
  if (Array.isArray(node)) { // leaf
    node.map(leaf => res.push((path.concat(leaf + '.xsd')).join('/')));
  } else
  if (typeof node === 'object') { // branch
    Object.keys(node).map(key => rec(path.concat(key), node[key]));
  } else {
    throw new Error(typeof node, path);
  }
  return res;
};

module.exports = rec([], tree);
