'use strict';

const onml = require('onml');

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

const toNumber = str => {
  const m16 = str.match('\'h([0-9a-zA-Z]+)');
  if (m16) {
    return Number('0x' + m16[1].trim());
  }
  const m2 = str.match('\'b([01]+)');
  if (m2) {
    return Number('0b' + m2[1].trim());
  }
  const m10 = str.match('\'d([0-9]+)');
  if (m10) {
    return Number(m2[1].trim());
  }
  return Number(str);
};

// const portsReduce = node => {
//   let res = {};
//   const arr = node.full;
//   for (let i = 2; i < arr.length; i++) {
//     const port = arr[i].port;
//     res[port.logicalName] = port;
//   }
//   return res;
// };
//
// const toNumber = val => {
//   const num = Number(val);
//   return (isNaN(num) || ((num |0) !== num)) ? val : num;
// };

const luter = str =>
  str.trim().split(/\s+/).reduce((res, e) => {
    res[e] = true;
    return res;
  }, {});

const boolList = luter(`
  volatile
  isClock isReset isAddress isData isAddressable
  directConnection
  requiresDriver
`);
/*
*/

const numList = luter(`
  width
  bitOffset
  bitWidth
  value
  defaultValue
  baseAddress
  range
  addressOffset
  size
  resetValue
  left right
  clockPeriod clockPulseOffset clockPulseValue clockPulseDuration
`);
/*
*/

const objList = luter(`
  vendor library name version
  description displayName
  fileType
  presence
  direction
  logicalName
  access
  busSignalName
  componentSignalName
  fileSetRef
  modelName
  moduleName
  localName
  envIdentifier
  language
`);
/*
abstractionRef
memoryMaps
*/

const mergeList = luter(`
  onMaster onSlave
  wire
  port
  abstractionDefinition
  busDefinition
  ports
  values
  slave
  clockDriver
  hwModel
`);
/*
component
*/

const namedProps = luter(`
  logicalPort physicalPort
`);
/*
*/

const mergeArray = luter(`
  reset
  enumeratedValue
  field
  register
  register
  signalName
  memoryMap
  file
  fileSet
  choice
  signal
  portMap
  view
  addressBlock
`);
/*
abstractionType
busInterface
*/

const mergeSkip = luter(`
  resets
  enumeratedValues
  qualifier
  signalMap
  fileSets
  choices
  signals
  views
  memoryMaps
  portMaps
`);
/*
abstractionTypes
busInterfaces
*/

let ns, ns1;

module.exports = obj => {
  ns   = obj[0].split(':')[0] + ':';
  ns1  = (ns === 'spirit:') ? ns : '';

  let res = ['root', {}, obj];

  onml.traverse(res, {
    leave: function (node) {
      const name = node.name.split(':')[1] || node.name;

      const iter = (lut, cb, newname) => {
        if (lut[name]) {
          const res = {};
          res[newname || name] = cb();
          this.replace(res);
          return true;
        }
      };

      if (iter(boolList, () => node.full[2] === 'true')) return;
      if (iter(numList, () => toNumber(node.full[2]))) return;
      if (iter(objList, () => node.full[2])) return;
      if (iter(mergeList, () => mergeTail(node))) return;
      if (iter(namedProps, () => node.full[2].name)) return;
      if (iter(mergeArray, () => [mergeTail(node)], name + 's')) return;

      if (mergeSkip[name]) {
        this.replace(mergeTail(node));
        return;
      }

      switch (node.name) {
      case ns + 'busType':
        this.replace({
          busType: {
            vendor:  node.attr[ns1 + 'vendor'],
            library: node.attr[ns1 + 'library'],
            name:    node.attr[ns1 + 'name'],
            version: node.attr[ns1 + 'version']
          },
          interfaceMode: 'slave'
        });
        break;

      // case ns + 'vendorExtensions':   this.replace({vendorExtensions: []}); break;

      // case 'spirit:memoryMaps':      this.replace(mergeTail(node)); break;
      // case 'spirit:busInterfaces':      this.replace(mergeTail(node)); break;
      // case 'spirit:fileSet':      this.replace(mergeTail(node)); break;
      // case 'spirit:signals':      this.replace(mergeTail(node)); break;

      // case ns + 'parameter':      this.replace({parameters: [{attr: node.full[1], value: node.full[2]}]}); break;
      // case ns + 'enumeration':    this.replace({enumerations: [{attr: node.full[1], value: node.full[2]}]}); break;

      // case 'spirit:signal':         this.replace({signals: [mergeTail(node)]}); break;

      // case 'spirit:signalMap':          this.replace(mergeTail(node)); break;

      }
    }
  });
  return res[2];
};

/* eslint complexity:1 */
