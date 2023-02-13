'use strict';

const onml = require('onml');
const duhCore = require('duh-core');

const porter = require('./porter.js');
const mergeTail = require('./merge-tail.js');
const toNumber = require('./to-number.js');

const portMapper = node => {
  const arr = node.full;
  let res = {};
  for (let i = 2; i < arr.length; i++) {
    const portMap = arr[i].portMap;
    res[portMap.logicalPort] = portMap.physicalPort;
  }
  return {
    viewRef: 'RTLview',
    portMaps: res
  };
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

const luter = str =>
  str.trim().split(/\s+/).reduce((res, e) => {
    res[e] = true;
    return res;
  }, {});

// ['foo', {}, 'true'] -> {foot: true}
const boolList = luter(`
  volatile
  isClock isReset isAddress isData isAddressable
  directConnection
  requiresDriver
  testable
`);

// ['foo', {}, '42'] -> {foo: 42}
const numList = luter(`
  width
  bitOffset
  bitWidth
  value
  mask
  defaultValue
  baseAddress
  range
  addressOffset
  addressUnitBits
  size
  resetValue
  left right
  clockPeriod clockPulseOffset clockPulseValue clockPulseDuration
`);

// ['foo', {}, 'bar'] -> 'bar'
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
  modelName
  moduleName
  localName
  envIdentifier
  language
  usage
  componentInstantiationRef
  readAction
  modifiedWriteValue
  instanceName
`);
/*
abstractionRef
memoryMaps
*/

// ['ns:foo', {}, {a:1}, {b:2}] -> {foo: {a:1, b:2}}
const mergeList = luter(`
  onMaster onSlave
  wire
  abstractionDefinition
  busDefinition
  values
  vectors
  vector
  clockDriver
  hwModel
  ports
  views
  model
  portMap
  component
  componentInstantiation
  design
  fileSets
  fileSetRef
`);
/*
master
slave
port
*/

const namedProps = luter(`
  logicalPort
  physicalPort
`);
/*
*/


// ['foo', {}, {a:1}, {b:2}] -> {foos: [{a:1, b:2}]}
const mergeArray = luter(`
  reset
  enumeratedValue
  field
  register
  signalName
  memoryMap
  file
  instantiations
  signal
  view
  addressBlock
  registerFile
  busInterface
  componentInstance
  interconnection
  adHocConnection
  hierConnection
`);
/*
portMap
*/

// ['foo', {}, {a}, {b}, {..}] -> {a, b, ..}
const mergeSkip = luter(`
  resets
  enumeratedValues
  qualifier
  signalMap
  signals
  views
  memoryMaps
  busInterfaces
  abstractionType
  componentInstances
  interconnections
  adHocConnections
  hierConnections
`);
/*


  abstractionTypes
parameters
fileSets
portMaps
*/

// ['foo', {...}] -> {...}
const propsList = luter(`
  memoryMapRef
  abstractionRef
  componentRef
`);

let ns, ns1;

module.exports = obj => {
  ns   = obj[0].split(':')[0] + ':';
  ns1  = (ns === 'spirit:') ? ns : '';

  let res = ['root', {}, obj];

  onml.traverse(res, {
    leave: function (node) {
      const name = node.name.split(':')[1] || node.name;
      const tail = mergeTail(node);

      const iter = (lut, cb, newname) => {
        if (lut[name]) {
          const res = {};
          let res1;
          try {
            res1 = cb();
          } catch (err) {
            console.log(err);
            console.log(name);
          }
          res[newname || name] = res1;
          this.replace(res);
          return true;
        }
      };
      // if (iter(justList, () => true)) return;
      if (iter(propsList, () => node.full[1])) return;
      if (iter(boolList, () => node.full[2] === 'true')) return;
      if (iter(numList, () => toNumber(node))) return;
      if (iter(objList, () => (node.full[2] || '').trim())) return;
      if (iter(mergeList, () => tail)) return;
      if (iter(namedProps, () => node.full[2].name)) return;
      if (iter(mergeArray, () => [tail], name + 's')) return;

      if (mergeSkip[name]) {
        this.replace(tail);
        return;
      }

      switch (node.name) {

      case ns + 'enumeration':
        this.replace({enumeration: Object.assign({}, node.attr, {value: node.full[2]})});
        break;

      case ns + 'busType':
      // case ns + 'abstractionType':
        this.replace({
          [name]: {
            vendor:  node.attr[ns1 + 'vendor'],
            library: node.attr[ns1 + 'library'],
            name:    node.attr[ns1 + 'name'],
            version: node.attr[ns1 + 'version']
          }
        });
        break;

      case ns + 'port':
        this.replace(porter(node));
        break;

      case ns + 'parameter':
        this.replace(tail); // {[tail.name]: tail.value});
        break;

      case ns + 'choices':
      case ns + 'choice':
      case ns + 'parameters':
      case ns + 'abstractionTypes':
        this.replace((n => {
          let res = n.full.slice(2);
          return {[name]: res};
        })(node));
        break;

      case ns + 'vendorExtensions':
        this.replace(true);
        // this.replace((n => {
        //   let res = n.full.slice(2);
        //   return {[name]: res};
        // })(node));
        break;

      case ns + 'master':
      case ns + 'mirroredSlave':
        this.replace({
          interfaceMode: 'initiator',
          addressSpaceRef: (tail.addressSpaceRef || {}).addressSpaceRef
        });
        break;

      case ns + 'slave':
      case ns + 'mirroredMaster':
        this.replace({
          interfaceMode: 'target',
          memoryMapRef: (tail.memoryMapRef || {}).memoryMapRef
        });
        break;

      case ns + 'fileSet':
        this.replace({[tail.name]: tail.files});
        break;

      case ns + 'portMaps':
        this.replace(portMapper(node));
        break;

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

  const duh = res[2];
  duhCore.uniquifyNames(duh);
  return duh;
};

/* eslint complexity:0 */
