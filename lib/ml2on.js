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
}

module.exports = obj => {
  let res = ['root', {}, obj];
  onml.traverse(res, {
    leave: function (node) {
      switch (node.name) {
      case 'spirit:busType':
        this.replace({
          busType: {
            vendor:  node.attr['spirit:vendor'],
            library: node.attr['spirit:library'],
            name:    node.attr['spirit:name'],
            version: node.attr['spirit:version'],
          }
        });
        break;
      case 'spirit:vendor':     this.replace({vendor: node.full[2]}); break;
      case 'spirit:library':     this.replace({library: node.full[2]}); break;
      case 'spirit:name':     this.replace({name: node.full[2]}); break;
      case 'spirit:version':     this.replace({version: node.full[2]}); break;

      case 'spirit:presence':     this.replace({presence: node.full[2]}); break;
      case 'spirit:width':        this.replace({width: Number(node.full[2])}); break;
      case 'spirit:direction':    this.replace({direction: node.full[2]}); break;
      case 'spirit:isClock':      this.replace({isClock: node.full[2]}); break;
      case 'spirit:defaultValue': this.replace({defaultValue: node.full[2]}); break;
      case 'spirit:logicalName':  this.replace({logicalName: node.full[2]}); break;
      case 'spirit:description':  this.replace({description: node.full[2]}); break;
      case 'spirit:vendorExtensions':  this.replace({vendorExtensions: []}); break;

      case 'spirit:requiresDriver':  this.replace({requiresDriver: node.full[2]}); break; // FIXME

      case 'spirit:onMaster':     this.replace({onMaster: mergeTail(node)}); break;
      case 'spirit:onSlave':      this.replace({onSlave: mergeTail(node)}); break;
      case 'spirit:qualifier':    this.replace({qualifier: mergeTail(node)}); break;
      case 'spirit:wire':         this.replace({wire: mergeTail(node)}); break;
      case 'spirit:port':         this.replace({port: mergeTail(node)}); break;
      case 'spirit:abstractionDefinition': this.replace({abstractionDefinition: mergeTail(node)}); break;

      case 'spirit:ports':        this.replace({ports: portsReduce(node)}); break;
      }
    }
  })
  return res[2];
};
