'use strict';

const onml = require('onml');

const mergeTail = node => {
  let res = {};
  const arr = node.full;
  for (let i = 2; i < arr.length; i++) {
    res = Object.assign(res, arr[i]);
  }
  return res;
};

const portsReduce = node => {
  let res = {};
  const arr = node.full;
  for (let i = 2; i < arr.length; i++) {
    const port = arr[i].port;
    res[port.logicalName] = port;
  }
  return res;
};

const toNumber = val => {
  const num = Number(val);
  return (isNaN(num) || ((num |0) !== num)) ? val : num;
};

const objList = [
  'vendor',
  'library',
  'name',
  'version',
  'presence',
  'direction',
  'logicalName',
  'description'
];

const boolList = [
  'isClock',
  'isReset',
  'isAddress',
  'isData',
  'isAddressable',
  'directConnection',
  'requiresDriver'
];

module.exports = obj => {
  let res = ['root', {}, obj];
  onml.traverse(res, {
    leave: function (node) {

      objList.some(e => {
        if (node.name === ('spirit:' + e)) {
          const res = {};
          res[e] = node.full[2];
          this.replace(res);
          return true;
        }
      });

      boolList.some(e => {
        if (node.name === ('spirit:' + e)) {
          const res = {};
          res[e] = (node.full[2] === 'true');
          this.replace(res);
          return true;
        }
      });

      switch (node.name) {
      case 'spirit:busType':
        this.replace({
          busType: {
            vendor:  node.attr['spirit:vendor'],
            library: node.attr['spirit:library'],
            name:    node.attr['spirit:name'],
            version: node.attr['spirit:version']
          }
        });
        break;
      case 'spirit:width':        this.replace({width: Number(node.full[2])}); break;
      case 'spirit:defaultValue': this.replace({defaultValue: toNumber(node.full[2])}); break;
      case 'spirit:vendorExtensions':  this.replace({vendorExtensions: []}); break;


      case 'spirit:onMaster':     this.replace({onMaster: mergeTail(node)}); break;
      case 'spirit:onSlave':      this.replace({onSlave: mergeTail(node)}); break;
      case 'spirit:qualifier':    this.replace(mergeTail(node)); break;
      case 'spirit:wire':         this.replace({wire: mergeTail(node)}); break;
      case 'spirit:port':         this.replace({port: mergeTail(node)}); break;
      case 'spirit:abstractionDefinition': this.replace({abstractionDefinition: mergeTail(node)}); break;
      case 'spirit:busDefinition': this.replace({busDefinition: mergeTail(node)}); break;

      case 'spirit:ports':        this.replace({ports: portsReduce(node)}); break;
      }
    }
  });
  return res[2];
};
