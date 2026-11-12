'use strict';

// XSD files per standard version, as hosted under accellera.org/XMLSchema.
// Lists derived by crawling xs:include / xs:import from each index.xsd
// (commented-out includes in 1685-2022 index.xsd skipped: files do not exist).

const common = `
  abstractionDefinition abstractor autoConfigure busDefinition busInterface
  commonStructures component constraints design designConfig file fileType
  generator identifier index memoryMap model port signalDrivers simpleTypes
  subInstances
`;

const list = str => str.trim().split(/\s+/);

const versions = {
  'SPIRIT/1.4':       list(common + ' configurable'),
  'SPIRIT/1685-2009': list(common + ' configurable'),
  'IPXACT/1685-2014': list(common + ' catalog configurable xml'),
  'IPXACT/1685-2022': list(common + ' catalog typeDefinitions xml')
};

const res = [];
Object.keys(versions).map(ver => {
  versions[ver].map(leaf => {
    res.push(['accellera.org', 'XMLSchema', ver, leaf + '.xsd'].join('/'));
  });
});

module.exports = res;
