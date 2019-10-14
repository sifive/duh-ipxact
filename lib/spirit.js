'use strict';

module.exports = () => `
component
  vendor library name version
  memoryMaps
    memoryMap
      addressBlock
        baseAddress
      range width
      register
        addressOffset size
        resets
          reset
            value mask
        field description bitOffset bitWidth access modifiedWriteValue volatile
          enumeratedValues
            enumeratedValue
              name description value
`
  .trim()
  .split(/\s+/)
  .reduce((res, e) => {
    res[e] = 'spirit:' + e;
    return res;
  }, {});
