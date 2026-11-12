[![NPM version](https://img.shields.io/npm/v/duh-ipxact.svg)](https://www.npmjs.org/package/duh-ipxact)
[![Actions Status](https://github.com/sifive/duh-ipxact/workflows/Tests/badge.svg)](https://github.com/sifive/duh-ipxact/actions)

# duh-ipxact

Import / export bridge between **DUH** and **IP-XACT / SPIRIT**.

- **DUH** is a compact [JSON5](https://json5.org/) description of an IP component — ports, bus interfaces, register maps, and model info. It is the native format used by the [`duh-core`](https://github.com/sifive/duh-core) tooling.
- **IP-XACT** (IEEE 1685) and its predecessor **SPIRIT** are verbose XML standards for describing the same IP metadata, consumed by many EDA tools.

`duh-ipxact` converts in both directions:

```
DUH (.json5)  ⇄  IP-XACT / SPIRIT (.xml)
```

| Direction | Command | Source | Target |
|-----------|---------|--------|--------|
| Export    | `duh2spirit`, `duh2spirit14` | DUH JSON5 | SPIRIT XML |
| Import    | `ipxact2duh` | IP-XACT XML | DUH JSON5 |

## Install

Run without installing:

```
npx duh-ipxact <command>
```

Or install globally / as a dependency:

```
npm install -g duh-ipxact
```

## Usage

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

If the output file argument is omitted, the result is printed to `stdout`.

### DUH → SPIRIT

SPIRIT 2009 (IEEE 1685-2009):

```
npx duh-ipxact duh2spirit <myDuh>.json5 <mySpirit>.xml
```

SPIRIT 1.4:

```
npx duh-ipxact duh2spirit14 <myDuh>.json5 <mySpirit>.xml
```

### IP-XACT → DUH

```
npx duh-ipxact ipxact2duh <myIpxact>.xml <myDuh>.json5
```

### Fetch schemas

Download the IP-XACT and SPIRIT XSD schemas (into `accellera.org/...`) for local validation:

```
npx duh-ipxact fetch
```

### Validate output

Validate a generated SPIRIT file:

```
xmllint --schema accellera.org/XMLSchema/SPIRIT/1685-2009/index.xsd <mySpirit>.xml
```

Validate an IP-XACT file:

```
xmllint --schema accellera.org/XMLSchema/IPXACT/1685-2014/index.xsd <myIpxact>.xml
```

## Pipe helpers

Two extra binaries read from `stdin` and write to `stdout`, for use in shell pipelines:

```
cat <myDuh>.json5   | node bin/duh2spirit.js  > <mySpirit>.xml
cat <myIpxact>.xml  | node bin/ipxact2duh.js   > <myDuh>.json5
```

## Batch import

`bin/import.js` walks a directory tree, converting every `*.xml` IP-XACT file it
finds into a matching `*.json5` DUH file, mirroring the directory layout:

```
import/**/*.xml   →   specs/**/*.json5
```

Run it from a directory that contains an `import/` folder:

```
node bin/import.js
```

Outputs land under `specs/`, preserving sub-paths.

## How conversion works

- **Export** (`duh2spirit.js`) walks the DUH object and emits a SPIRIT XML tree
  via [`onml`](https://www.npmjs.com/package/onml), wrapping tags in the
  `spirit:` namespace and attaching the schema URIs for the requested version.
- **Import** (`ml2on.js`) parses IP-XACT XML with `onml` and folds the verbose
  node tree into compact DUH. Ports collapse to signed widths
  (`in` → `+width`, `out` → `-width`); Verilog-style literals (`'h`, `'b`, `'d`)
  are parsed to numbers.

## License

Apache 2.0 — see [LICENSE](LICENSE).

## Development

```
npm run fetch        # download SPIRIT 1.4 / 2009, IP-XACT 2014 / 2022 XSDs into accellera.org/
npm run xsd          # regenerate lib/xsd/<version>.json content-model tables
npm test             # lint + tests (incl. synthetic zoo in test/zoo/)
npm run zoo:update   # accept new zoo import / round-trip / coverage state
npm run zoo:survey   # local: survey real-world XML in tmp/ pub/ → tmp/survey.json
npm run zoo:check    # local: leak guard, test/zoo/ must not contain data from tmp/
```

See [plans/feature-coverage.md](plans/feature-coverage.md).
