[![NPM version](https://img.shields.io/npm/v/duh-ipxact.svg)](https://www.npmjs.org/package/duh-ipxact)
[![Actions Status](https://github.com/sifive/duh-ipxact/workflows/Tests/badge.svg)](https://github.com/sifive/duh-ipxact/actions)

IP-XACT import / export package

## Use

```
duh-ipxact <command>

Commands:
  duh-ipxact duh2spirit14 duh [spirit]  convert DUH file to Spirit 1.4 file
  duh-ipxact duh2spirit duh [spirit]    convert DUH file to Spirit 2009 file
  duh-ipxact ipxact2duh ipxact [duh]    convert IPXACT file to DUH file
  duh-ipxact fetch                      download IPXACT, SPIRIT schemas

Options:
  --version      Show version number                                   [boolean]
  --verbose, -v                                                 [default: false]
  --help         Show help                                             [boolean]

```

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
xmllint --schema accellera.org/XMLSchema/SPIRIT/1685-2009/index.xsd <mySpirit>.xml
```

### Validate IPXACT file

```
xmllint --schema accellera.org/XMLSchema/IPXACT/1685-2014/index.xsd <myIpxact>.xml
```

## License
Apache 2.0 [LICENSE](LICENSE).
