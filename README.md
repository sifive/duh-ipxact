[![NPM version](https://img.shields.io/npm/v/duh-ipxact.svg)](https://www.npmjs.org/package/duh-ipxact)
[![Actions Status](https://github.com/sifive/duh-ipxact/workflows/Tests/badge.svg)](https://github.com/sifive/duh-ipxact/actions)

IP-XACT import / export package

## Use

### DUH -> SPIRIT

```
npx duh-ipxact duh2spirit <myDuh>.json5 <mySpirit>.xml
```

### IPXACT -> DUH

```
npx duh-ipxact ipxact2duh <myIpxact>.xml <myDuh>.json5
```

### Fetch IPXACT schemas

```
npx duh-ipxact fetch
```

### Validate SPIRIT file

```
xmllint --schema accellera.org/XMLSchema/IPXACT/1685-2014/index.xsd <myIpxact>.xml
```

### Validate IPXACT file

```
xmllint --schema accellera.org/XMLSchema/SPIRIT/1685-2009/index.xsd <mySpirit>.xml
```

## License
Apache 2.0 [LICENSE](LICENSE).
