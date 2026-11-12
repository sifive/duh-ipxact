'use strict';

// Supported IP-XACT / SPIRIT standard versions.
// id: short key used across code / tests (test/zoo/<id>/, lib/xsd/<id>.json)

const versions = [{
  id: 'spirit-1.4',
  dir: 'SPIRIT/1.4',
  ns: 'http://www.spiritconsortium.org/XMLSchema/SPIRIT/1.4',
  prefix: 'spirit'
}, {
  id: 'spirit-2009',
  dir: 'SPIRIT/1685-2009',
  ns: 'http://www.spiritconsortium.org/XMLSchema/SPIRIT/1685-2009',
  prefix: 'spirit'
}, {
  id: 'ipxact-2014',
  dir: 'IPXACT/1685-2014',
  ns: 'http://www.accellera.org/XMLSchema/IPXACT/1685-2014',
  prefix: 'ipxact'
}, {
  id: 'ipxact-2022',
  dir: 'IPXACT/1685-2022',
  ns: 'http://www.accellera.org/XMLSchema/IPXACT/1685-2022',
  prefix: 'ipxact'
}];

const byNs = versions.reduce((res, v) => Object.assign(res, {[v.ns]: v}), {});
const byId = versions.reduce((res, v) => Object.assign(res, {[v.id]: v}), {});

// detect version of parsed (onml) document root by xmlns URI
const detect = root => {
  const attr = root[1] || {};
  const tag = root[0];
  const p = tag.includes(':') ? tag.split(':')[0] : '';
  const uri = attr[p ? ('xmlns:' + p) : 'xmlns'];
  return byNs[uri];
};

module.exports = {versions, byNs, byId, detect};
