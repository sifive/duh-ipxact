'use strict';

module.exports = () => `
component
  vendor library name version
  cpus
    cpu
      addressSpaceRef
  busInterfaces
    busInterface
      busType abstractionType master slave
      portMaps
        portMap
          logicalPort physicalPort
  memoryMaps
    memoryMap
      addressBlock
        baseAddress
      range width usage
      register
        addressOffset size
        resets
          reset
            value mask
        field description bitOffset bitWidth access modifiedWriteValue readAction volatile
          enumeratedValues
            enumeratedValue
              name description value
  model
    ports
      port
        wire
          direction
`
  .trim()
  .split(/\s+/)
  .reduce((res, e) => {
    res[e] = 'spirit:' + e;
    return res;
  }, {});
