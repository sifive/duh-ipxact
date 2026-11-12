# IPXACT support

status: in progress (v9 — P0 done, see §9.1; next: P1)

Support all IP-XACT features in DuH.

Make a proper mapping of XML style document to JSON representation.

## 1. Baseline (what exists today)

Repos (`../duh*`): `duh-ipxact` (this), `duh-schema` (JSON schema), `duh-core`
(read/validate/expand), `duh` (CLI, Verilog), `duh-bus`, `duh-systemrdl`, `duhportinf`.

### Import — `lib/ml2on.js`

- Hand-written LUTs (`boolList`, `numList`, `objList`, `mergeList`, `mergeArray`,
  `mergeSkip`, ...) over element local names; anything not listed falls through
  as raw onml arrays or is silently merged/dropped.
- Namespace detected from root tag prefix (`spirit:` / `ipxact:`), not from `xmlns` URI.
- Lossy spots:
  - `vendorExtensions` → `true` (content lost)
  - `parameters`, `choices`, `abstractionTypes` → raw onml arrays
  - `port`: only `[N:0]` vectors, else throws; `description`, typeDefs, drivers,
    `transactional` ports lost
  - `portMaps`: `viewRef: 'RTLview'` hard-coded; `partSelect`, `logicalTieOff`,
    vectors lost; logical→physical as string only
  - `mirroredSlave` → `initiator`, `mirroredMaster` → `target` (mode lost);
    `system`, `monitor`, `mirroredSystem` unhandled
  - register `dim`, `alternateRegisters`, `isPresent`, `accessHandles`,
    field `writeValueConstraint`, `reset` per `resetTypeRef` lost/collapsed
  - `toNumber` handles `'h/'b/'d` only; 2014+ SV expressions kept as raw string
- Ends with `duhCore.uniquifyNames(duh)` (mutates).

### Export — `lib/duh2spirit.js`

- Component only. SPIRIT 1.4 + 1685-2009 only (no 2014 / 2022). `spirit:` prefix hard-coded.
- Emits: VLNV, `cpus`, `busInterfaces` (first abstractionType only, master/slave only),
  `memoryMaps/addressBlock/register/field/enumeratedValue`, `model/ports`.
- Bugs/gaps: port width dropped (no `vector`), `inout` → `out`, `reset` emitted
  even when undefined, `addressUnitBits`/`registerFiles`/`access` on block not
  emitted, no `parameters`, `fileSets`, `views`, `addressSpaces`, `description`
  on most nodes.
- No export for `abstractionDefinition`, `busDefinition`, `design`, `catalog`.

### DUH schema (`../duh-schema`, v1.0.0)

Covers: component (VLNV, busInterfaces, model.ports, addressSpaces, memoryMaps,
fileSets/parameters as untyped object/array), memoryMap → addressBlock →
register / registerFile (non-recursive) → field → enumeratedValues,
abstractionDefinition (wire ports only), busDefinition (VLNV + description),
design (instances, links, connections, adHocConnections), catalog.

Missing vs IP-XACT 2014 (329 element names in XSD): views / instantiations /
model parameters, typed parameters & choices, transactional ports, port typeDefs
& drivers, clock drivers, bank / subspaceMap / localMemoryMap, alternateRegisters,
dim arrays, accessHandles, indirectInterfaces, channels, remapStates,
whitebox, cpus (in schema), generators / generatorChain, abstractor,
designConfiguration, constraintSets, busDefinition fields (directConnection,
isAddressable, maxMasters/maxSlaves, systemGroupNames), vendorExtensions.

### Infra

- `test/basic.js` only checks exports; no fixtures, no round-trip tests.
- `package.json` deps stale: `duh-core ^0.16` / `duh-schema ^0.11` while local
  siblings are `1.0.0`.
- `fetch` downloads 2014 + 2009 XSDs; no 1.4 / 2022.

## 2. Decisions

- **D1 — DuH = superset.** DuH model is a superset of every IP-XACT version
  (SPIRIT 1.4, 1685-2009, 1685-2014, 1685-2022) and of SystemRDL. Version
  specifics live only in per-version import / export transforms.
- **D2 — Compact forms case by case**, only where lossless. §7 list approved.
- **D3 — DuH schema hand-owned** (not generated from XSD). XSDs feed
  transforms and coverage checks only. Existing schema kept as close as
  possible to current form; every change listed in §6.
- **D4 — `vendorExtensions` opaque**, stored in JSON-friendly raw form
  (§4.3). No extension registry.
- **D5 — Expressions as strings** with DuH-defined grammar, canonical parser
  and stringify (§5). Used for evaluation and constraints in both directions.
- **D6 — `initiator` / `target`** are DuH terms. `master` / `slave` accepted
  only as import transformation.
- **D7 — Test inputs.** Owner-provided XML in `tmp/` (git-ignored, never
  committed, never named in plans / code / commits). Committed tests use a
  synthetic ZOO derived from it (§8).
- **D8 — XSD parsing with `onml`** (`../../drom/onml/`, v2.3.0).
- **D9 — DuH covers more than IP-XACT** natively (SystemRDL and other
  sources), not via `vendorExtensions`. `SystemRDL → DuH → IP-XACT` may lose
  RDL-only properties IP-XACT cannot represent natively (reported as
  diagnostics, not smuggled into `vendorExtensions`).
- **D10 — DuH file = aggregate.** One DuH file may combine several imports
  (IP-XACT, SystemRDL, Verilog, ...) plus manual fixes. Export uses only the
  exportable subset of the model for its target. No per-file "source format"
  hint is needed for export.
  - Import always creates a **new** DuH file; never merges.
  - Merging DuH files is a **separate tool** (out of scope of this plan).
- **D11 — Expression lib lives in `duh-core`** (`duh-core/lib/expr/`).
- **D12 — `pSchema`** is any valid JSON Schema describing parameters
  (types, ranges, choices) — **not parameter values**. Values live in
  `parameters`. IP-XACT parameter splits on import: constraints → `pSchema`,
  value + IP-XACT-only attributes → `parameters`; joined back on export (§6.8).
  `pSchema` uses standard JSON Schema keywords only — no extra / prefixed
  keys, so nothing conflicts with IP-XACT names.
- **D13 — VLNV string canonical:** `vlnv: 'vendor/library/name/version'`
  is canonical DuH form; object `{vendor, library, name, version}` accepted
  on read.
- **D14 — Concatenation Verilog style:** arrays in `portMaps` = `{a, b, c}`,
  first element = MSB.
- **D15 — Defaults:** import / export store and write only what is written
  (§10); DuH default table kept identical to IP-XACT / SPIRIT defaults.
- **D16 — `parameters[]` wins** over `pSchema` when both carry `type` /
  choices and disagree on export; diagnostic emitted.

## 3. Goal

1. Every element/attribute of every supported IP-XACT version has a defined
   home in DuH — nothing silently dropped (unknown → opaque, never lost).
2. Lossless round-trip `XML(vN) → DuH → XML(vN)` (modulo whitespace,
   attribute order, comments, canonical number / expression spelling).
3. Cross-version `XML(vN) → DuH → XML(vM)` where semantics allow; diagnostics
   where not.
4. SystemRDL concepts representable in same model.
5. Export from an aggregated DuH (D10) works: target-unsupported data
   skipped with diagnostics, never an error unless required data is missing.

## 4. Architecture

```
            import(v)                         export(v)
IP-XACT vN ───────────▶  DuH core model  ───────────▶ IP-XACT vM
SystemRDL  ───────────▶  (superset)      ───────────▶ SystemRDL / headers / ...
```

### 4.1 Core model

- Union of concepts across versions, one name per concept (D6).
- Version-only constructs still get a core home (1.4/2009 `signals` vs
  2014+ `ports`; 2009 `views` vs 2014 `views` + `instantiations`; 2009
  register-level reset vs 2014 field-level resets).
- SystemRDL-only properties are first-class DuH fields (D9). On IP-XACT
  export with no IP-XACT equivalent → dropped with diagnostic.
- Import creates new DuH file only (D10).

### 4.2 Version transforms

Per version `lib/v/<version>/{import,export}.js`:

- `import`: XML (onml) → DuH. Version detected from root `xmlns` URI, not prefix.
- `export`: DuH → XML, element order from XSD sequence tables.
- Diagnostics list `{path, feature, action: 'dropped'|'downgraded'|'opaque'}`
  instead of silent loss.
- XSD tables generated with `onml` from `accellera.org/` XSDs: element order
  on emit + coverage-check test (every XSD element handled or explicitly
  listed opaque / unsupported).
- `master`/`slave`, `onMaster`/`onSlave`, `maxMasters`/`maxSlaves`,
  `mirroredMaster`/`mirroredSlave` ↔ initiator / target names on import / export (D6).

### 4.3 vendorExtensions raw form (D4)

- Stored as JsonML (what `onml.parse` returns): arrays of
  `[tag, {attrs}, ...children]`. Pure JSON, survives json5 round-trip.
- Self-contained namespaces: `xmlns:*` declarations needed by subtree copied
  onto subtree root attrs on import; re-declared on export as needed.
- Allowed wherever IP-XACT allows `vendorExtensions`, same key name.

```js
register: {
  name: 'CTRL', addressOffset: 0, size: 32,
  vendorExtensions: [
    ['foo:bar', {'xmlns:foo': 'http://example.com/foo'}, ['foo:baz', {}, '1']]
  ]
}
```

### 4.4 onml notes

- `onml.parse` drops comments, processing instructions, XML declaration;
  CDATA kept as `'<![CDATA[...]]>'` string; whitespace trimmed by default.
- → round-trip compares canonicalized XML without comments.
- Possible onml improvements (own repo): optional comment preservation,
  namespace helper (prefix ↔ URI resolve). Bump dep `^2.1.0` → `^2.3.0`.

## 5. Expressions (D5)

- **Storage:** string. Pure literals may be JSON numbers (or `0x…` strings
  above 2^53, as `bigInt` today).
- **Grammar** (DuH-defined, documented as EBNF): superset of
  - IP-XACT 2014/2022 SystemVerilog-subset expressions (operators,
    `$clog2`, `$pow`, ternary, sized literals `8'hFF`, parameter refs by id),
  - SPIRIT 1.4/2009 numeric forms (`0x`, `'h`, `'b`, `'d`, `k`/`M`/`G` suffix)
    — 2009 `spirit:dependency` XPath expressions handled by transform, not grammar,
  - SystemRDL expressions (same SV-ish core + RDL literals / refs).
- **Canonical parser:** string → JSON AST. Hand-written (Pratt), no deps,
  browser-capable (antlr4 approach removed from duh-core earlier).
- **Canonical stringify:** AST → string; `stringify(parse(s))` is fixpoint;
  per-target dialect printers for export (2009 vs 2014 vs RDL).
- **Evaluate:** AST + env → value (BigInt-safe).
- **Constraints, both directions:** forward (params → widths/offsets) and
  backward (known widths → infer / check params), e.g. port width
  `DATA_W/8` given 4 → `DATA_W = 32`.
- **Solver scope: beyond linear / single-unknown** — systems of constraints
  over many parameters, non-linear ops (`$clog2`, `**`, `%`, shifts,
  ternary), integer / bit-width domains. Sketch: constraint propagation
  (interval + bit-width) → symbolic inversion where possible → bounded search
  for remaining unknowns; report under / over-constrained sets. `pSchema`
  (`minimum`, `maximum`, `enum`, `multipleOf`) feeds domains.
- Home: `duh-core/lib/expr/` (D11): `parse`, `stringify(ast, dialect)`,
  `evaluate`, `solve`.

## 6. Proposed DuH schema changes (`../duh-schema`)

Legend: **A** additive (old docs stay valid), **R** relaxing,
**B** breaking / renaming (old form still accepted until migration), **F** fix.

### 6.1 Common

1. A — `vendorExtensions` (JsonML array, opaque) on every node where IP-XACT has it.
2. A — nameGroup on all named nodes: `displayName`, `shortDescription` (2022), `description`.
3. A — `isPresent` (expression) on nodes that have it in 2014+.
4. R — `expression`: drop `maxLength: 256`; all numeric props become
   `oneOf [uint|int|bigInt, expression]` consistently (today mixed).
5. A — `parameters`: typed array items `{name, value, type, resolve,
   minimum, maximum, choiceRef, parameterId, vectors, arrays, ...}` (today
   untyped `array`); `choices` array at component / busDefinition level.

### 6.2 component

6. A — `description`, `displayName`.
7. F — `cpus` (emitted by exporter, missing in schema): `[{name, addressSpaceRefs, ...}]`.
8. A — `addressSpaces`: `addressUnitBits`, `segments`, `localMemoryMap`, `executableImage`.
9. R — `model.required: ['ports']` → optional (memory-only / doc-only components).
10. A — `model.views`, `model.instantiations`
    (`componentInstantiations`, `designInstantiations`,
    `designConfigurationInstantiations`), `moduleParameters`.
11. A — `otherClockDrivers`, `resetTypes`, `channels`, `remapStates`,
    `indirectInterfaces`, `componentGenerators` (typed), `whiteboxElements`,
    `choices`.
12. A — `fileSets`: keep `{name: [files]}`; files may be string (today) or
    object `{name, fileType, isIncludeFile, logicalName, define, ...}`.
13. A — `pSchema`: any valid JSON Schema (D12), validated against JSON Schema
    meta-schema (ajv). Today only seen in `duh/test/comp1.json5`, absent in schema.

### 6.3 ports (`model.ports`)

14. A — wire object: `vectors: [{left, right}]` (multi-dim, non-`[N:0]`)
    as alternative to `width`.
15. A — `direction`: add `phantom`.
16. A — wire: `wireTypeDefs`, `drivers` (`defaultValue`, `clockDriver`,
    `singleShotDriver`), `qualifier`, `constraintSets`, `isPresent`.
17. A — `transactional` ports alternative to `wire`.
18. A — `arrays` (2014 port arrays).

### 6.4 busInterface

19. B — `interfaceMode` enum: canonical `initiator`, `target`,
    `mirroredInitiator`, `mirroredTarget`, `system`, `mirroredSystem`,
    `monitor`; `master`/`slave` stay accepted (deprecated) until `duh`
    (`lib/infer-channels.js`, `test/comp1.json5`) migrates.
20. A — `addressSpaceRef` (initiator), `group` (system), monitor
    `interfaceMode` sub-mode, `baseAddress`, `transparentBridges`.
21. A — `connectionRequired`, `bitsInLau`, `bitSteering`, `endianness`, `parameters`.
22. F — `abstractionTypes[].abstractionRef` (VLNV; used by exporter, missing in schema).
23. A — `abstractionTypes[].viewRef` → `viewRefs` array (2014 allows many); keep single.
24. A — `portMaps`: keep both forms (both in use — see `duh-bus/docs/portMaps.md`,
    `duh-bus/docs/clocks.md`); formalize value grammar (port slicer /
    bit-field / concatenation):
    - `'port'` — full physical port
    - `'port[3]'` — bit-select; `'port[7:0]'` — slice
    - `{port: 'port', label: 'rx_done', ...}` — object with more
    - `['port2[7:0]', 'port0', 'port1[0]', {...}]` — concatenation, Verilog
      style (D14): first = MSB, like `{port2[7:0], port0, port1[0]}`
    - top-level array `portMaps: ['irq0', 'irq1']` — positional mapping;
      by D14 = `{irq0, irq1}` → `irq1` = bit 0. Check existing users
      (`duh-bus/docs/clocks.md` example) agree with this reading.
    Today schema: object values only `string | string[]` (no `{port}` object),
    array items only `string` → extend. Add IP-XACT-only extras:
    `logicalTieOff`, `isInformative`, logical-side `range`, physical
    `partSelect` with expressions.
24b. A — `abstractionTypes[].clock` (used in `duh-bus/docs/clocks.md`, absent in schema).

### 6.5 memoryMap / addressBlock / register / field

25. R — `memoryMap.required: ['addressBlocks']` → optional;
    A — `banks`, `subspaceMaps`, `memoryRemaps`, `shared`, description.
26. A — addressBlock: `description`, `isPresent`, `typeIdentifier`, `parameters`.
27. A — `registerFiles` recursive (uncomment), `dim`, `description`.
28. F — register `volatile` (exporter emits it, schema lacks it).
29. A — register: `dim`, `isPresent`, `typeIdentifier`, `accessHandles`,
    `alternateRegisters`, `resets: [{resetTypeRef, value, mask}]` full form
    (keep `resetValue`/`resetMask`).
30. A — field: `displayName`, `isPresent`, `typeIdentifier`,
    `writeValueConstraint`, `resets` full form, `fieldAccessPolicies` (2022).
31. A — `access`: values added in 2022 (verify against XSD).
32. A — enumeratedValue: `usage` (read / write / read-write); `value` → `oneOf [int, bigInt, expression]`.
33. A — SystemRDL field / register props first-class (`hwAccess` already
    emitted by `duh-systemrdl`, plus `counter`, `intr`, `singlepulse`,
    `swmod`, `swacc`, `rclr`, `woclr`, ...) — list to curate; map to
    `readAction` / `modifiedWriteValue` where equivalent.

### 6.6 abstractionDefinition / busDefinition

34. B — `onInitiator` / `onTarget` canonical; `onMaster` / `onSlave`
    deprecated. A — `onSystem: [{group, ...}]`.
35. R — port `required: ['description', 'wire']` → `oneOf wire | transactional`.
36. A — `extends` (VLNV), `qualifier` (2022 extended qualifiers), `logicalName`
    alias, port `width` expression on role.
37. A — busDefinition: `directConnection`, `isAddressable`,
    `maxInitiators` / `maxTargets`, `systemGroupNames`, `broadcast`,
    `extends`, `parameters`, `choices`.

### 6.6b VLNV (D13)

- B — `vlnv` string canonical on all VLNV-bearing nodes (component,
  busDefinition, abstractionDefinition, design, busType, abstractionRef,
  instance `ref`, ...); object form still valid. Schema keeps
  `oneOf vlnvs`; docs + generators (`duh` template, importers) emit string.
- `duh-core`: helper `vlnv.parse(str) → {vendor, library, name, version}`,
  `vlnv.stringify(obj)`; `aVLNV`, `findVLNV` accept both forms.
- Pattern review: today `version` segment `[a-zA-Z0-9_.-]+`, vendor `uri`
  pattern — check against IP-XACT `xs:token` / `xs:Name` rules so every
  imported VLNV fits (else escape rule / diagnostic).

### 6.7 design / catalog / new docs

38. A — design `componentInstances` config (`configurableElementValues`),
    `interconnections` full form (`activeInterface`, `hierInterface`,
    `monitorInterconnection`) next to compact `connections`.
39. A — adHocConnection `tiedValue`, `partSelect`, `externalPortReference`.
40. F — portReference `kind: 'extrenal'` typo → `external` (keep old alias).
41. F — catalog `busDefinitions.items` refs `abstractionDefinition` → split
    `busDefinitions` / `abstractionDefinitions`.
42. A — catalog: IP-XACT reference style (`ipxactFile: {vlnv, name}`) next
    to inlined docs; `abstractors`, `generatorChains`, `designConfigurations`,
    `typeDefinitions`, `catalogs`.
43. A — new top-level docs: `designConfiguration`, `abstractor`,
    `generatorChain`, `typeDefinitions` (2022).
44. ~~source-format hint~~ — dropped (D10).

### 6.8 IP-XACT parameter ↔ `parameters` + `pSchema` (D12, experimental)

One IP-XACT `parameter` splits into two DuH places, keyed by parameter name:

| IP-XACT parameter              | DuH `parameters[]` (values)  | DuH `pSchema` (JSON Schema) |
|--------------------------------|------------------------------|-----------------------------|
| `name`                         | `name`                       | `properties` key            |
| `value`                        | `value` (expression string / number) | —                   |
| `displayName`, `description`   | `displayName`, `description` | `title`, `description`      |
| `type`: bit, byte, shortint, int, longint | `type`            | `type: 'integer'` (+ range by width / `sign`) |
| `type`: shortreal, real        | `type`                       | `type: 'number'`            |
| `type`: string (default)       | (omitted)                    | `type: 'string'`            |
| `minimum`, `maximum` literal   | —                            | `minimum`, `maximum`        |
| `minimum`, `maximum` expression | `minimum`, `maximum`        | — (not JSON Schema-expressible) |
| `choiceRef` → `choices/choice/enumeration` | `choiceRef`; component `choices` | `enum` / `oneOf [{const, title}]` |
| `vectors` (`[L:R]`)            | `vectors`                    | integer range `0 .. 2^w-1`  |
| `arrays`                       | `arrays`                     | `type: 'array'`, `items`, `minItems` / `maxItems` |
| `resolve`: immediate / user (2014); 2009 also dependent (+ `dependency` XPath), generated | `resolve` (+ `dependency`) | — |
| `parameterId`, `prompt`, `order`, `configGroups`, `isPresent`, `sign` | same names | — |

- IP-XACT-only attributes stay in `parameters[]` under IP-XACT names; `pSchema`
  holds only standard JSON Schema keywords (no `x-` keys).
- Some info appears in both (`type`, `choices`): `parameters[]` keeps IP-XACT
  form for exact round-trip; `pSchema` is derived view. On export, if only
  `pSchema` present → derive IP-XACT `type` / `minimum` / `maximum` / choices from it.
- Export: JSON Schema features without IP-XACT equivalent (`pattern`,
  `allOf`, nested objects, ...) dropped with diagnostic.
- `pSchema` also feeds expression solver domains (§5).

## 7. Compact forms discovered (for curation)

Existing in code / DuH files today:

| #  | Compact                                   | Full                                     | Lossless?                    |
|----|-------------------------------------------|------------------------------------------|------------------------------|
| C1 | ports `{name: ±width}` (number)           | `[{name, wire: {direction, vectors}}]`   | only in/out, `[N:0]`         |
| C2 | ports `{name: '-EXPR'}` (string width)    | same, width expression                   | only in/out, `[EXPR-1:0]`?   |
| C3 | ports `{name: {direction, width}}`        | same                                     | `[N:0]` only                 |
| C4 | portMaps `{logical: 'physical'}`          | `portMap` list                           | no tieOff / informative      |
| C4b| portMaps `{logical: 'p[7:0]'}` / `'p[3]'` (slice / bit-select) | physical `partSelect` | yes             |
| C5 | portMaps `{logical: ['p1', 'p2[3:0]']}` (concat) | portMaps with logical ranges      | if physical widths known     |
| C5b| portMaps `['irq0', 'irq1']` (positional)   | portMaps with logical index / range     | if semantics defined         |
| C6 | `abstractionTypes[].viewRef` omitted / `'RTLview'` | explicit viewRef(s)             | if default agreed            |
| C7 | VLNV object `{vendor, library, name, version}` (accepted) | VLNV attrs               | yes                          |
| C8 | `vlnv: 'v/l/n/v'` string — **canonical** (D13) | VLNV attrs                         | yes                          |
| C9 | `busType: 'string'` (non-standard)        | VLNV                                     | DuH-only                     |
| C10| `interfaceMode` + sibling `memoryMapRef` / `addressSpaceRef` | mode choice element  | yes                          |
| C11| `resetValue` / `resetMask` (register, field) | `resets: [{resetTypeRef, value, mask}]` | single default reset only  |
| C12| `fileSets: {name: ['file', ...]}`         | `fileSet` list with file objects         | no file attributes           |
| C13| design `connections` `{source, target}` / `import` / `export` with `[inst, bus]` | `interconnections` / `hierConnections` | no active/monitor extras |
| C14| design `links` with symbolic string ends  | resolved `[inst, bus]` pairs             | after resolution             |
| C15| abstractionDefinition `ports: {logicalName: {...}}` | `ports` list                   | yes (names unique)           |
| C16| `onInitiator: {presence, width, direction}` flat | role element                      | yes                          |
| C17| Verilog / SV literals → JSON numbers      | literal strings                          | spelling lost (`'h` vs `0x`) |
| C18| `vector [N:0]` → `width: N+1`             | `vectors: [{left, right}]`               | right = 0 only               |
| C19| booleans `true` vs `'true'` text          | text                                     | yes                          |
| C20| wrapper elements (`registers`, `fields`, ...) → arrays | wrapper + items             | yes                          |
| C21| SystemRDL `sw` → `access`, `hw` → `hwAccess` | RDL props                             | yes                          |

Candidates (not yet in DuH):

| #  | Compact                                   | Full                                     | Lossless?                    |
|----|-------------------------------------------|------------------------------------------|------------------------------|
| C22| `parameters: {name: value}`               | typed parameter list                     | no type / range / resolve    |
| C23| single `abstractionTypes` → object        | array of one                             | yes                          |
| C24| any named list → object keyed by name (like ports) | array with `name`               | if order irrelevant (!)      |
| C25| omit defaults (`addressUnitBits: 8`, `testable: true`, `presence: optional`, `volatile: false`, ...) | explicit | only if export re-emits? — explicit-vs-default distinction lost |
| C26| `vectors: [{left, right}]` → `'[L:R]'` string | object                               | yes                          |
| C27| field `bitOffset` + `bitWidth` → `bits: '[H:L]'` | two numbers                       | yes                          |
| C28| enumeratedValues `{name: value}` map      | list                                     | no description / usage       |
| C29| IP-XACT parameter → `parameters` + `pSchema` split (§6.8) | parameter list            | yes if both kept             |
| C30| 2009 `signals` (abstraction) ↔ 2014 `ports` | version rename                         | yes (transform, not compact) |

## 8. Test ZOO (D7)

- `tmp/` — owner-provided private XML, git-ignored, local only.
  No file / vendor / IP names from it in plans, code, tests, commits.
- `pub/` — owner-provided public XML (surveyed too; not leak-checked).
- `bin/zoo-survey.js` (local tool): walk `tmp/`, detect version per file,
  report element-path histogram + XSD coverage (which elements / combos occur).
  Output local only (under `tmp/`).
- `test/zoo/<version>/<feature>.xml` — **synthetic**, committed:
  - hand-written or generated from survey patterns, small, one feature focus each;
  - neutral identifiers (`example.com`, `lib`, `comp0`, `reg0`, `f0`, ...),
    synthetic descriptions / values;
  - XSD-valid (`xmllint --schema`);
  - together cover every XSD element of each version (coverage test).
- Local leak guard (`bin/zoo-check.js`, runs only if `tmp/` exists): fail if
  any identifier / description token from `tmp/` appears in `test/zoo/`.
- Tests: round-trip per zoo file, cross-version where defined, schema
  validation of DuH output, expression parse/stringify fixpoint.

## 9. Phases (sketch)

- **P0 — harness:** XSD table generator (onml); zoo survey on `tmp/`;
  first zoo files; round-trip + coverage test runner; fix stale deps
  (`duh-core`, `duh-schema` → 1.x, `onml` → 2.3); add 1.4 + 2022 XSDs to `fetch`.
- **P1 — expressions:** grammar, parser, stringify, evaluate, constraint solve.
- **P2 — schema changes** §6 (approved), F-items first.
- **P3 — 2014 transforms** + `vendorExtensions` raw form; round-trip green.
- **P4 — 2009, 1.4, 2022** + cross-version diagnostics.
- **P5 — compact forms** (§7, approved), each with lossless test.
- **P6 — non-component docs:** busDefinition, abstractionDefinition, design,
  designConfiguration, catalog, abstractor, generatorChain, typeDefinitions.
- **P7 — SystemRDL alignment** with `duh-systemrdl` (§6 item 33).
- **P8 — downstream:** `duh`, `duh-systemrdl`, `duhportinf`, `duh-bus`
  (incl. `master`/`slave` → `initiator`/`target` migration).

### 9.1 P0 — done

- Deps: `duh-core` ^1.0.0, `duh-schema` ^1.0.0, `onml` ^2.3.0.
- `fetch`: all 4 versions (`lib/ipxact-schemas.js`, lists crawled from
  `index.xsd` includes); global `fetch` (follows redirects, fails on HTTP
  error — old `http.get` silently saved 301 pages).
- `lib/versions.js`: version ids (`spirit-1.4`, `spirit-2009`, `ipxact-2014`,
  `ipxact-2022`), namespaces, `detect(root)` by `xmlns` URI.
- `lib/xsd/table.js` + `bin/xsd-tables.js` (`npm run xsd`) →
  `lib/xsd/<id>.json` content-model tables (elements: 243 / 262 / 329 / 436).
- `lib/xsd/walk.js` (typed traversal), `lib/xsd/check.js` (structural check:
  order, occurrence, required attrs, enumerations; no keyref / facets
  beyond enum). Agrees with `xmllint` on all inputs.
- `bin/zoo-survey.js` (`npm run zoo:survey`), `bin/zoo-check.js`
  (`npm run zoo:check`, leak guard, skipped without `tmp/`).
- `test/zoo/<id>/*.xml`: 13 synthetic files (minimal component per version;
  memory map, bus interface, ports + parameter, vendorExtensions for 2009 /
  2014; bus interface for 2022). All `xmllint`-valid.
- `test/zoo.js`: per file version / structural check / xmllint / import +
  round-trip ratchet against `test/zoo/status.json`; coverage ratchet.
  `npm run zoo:update` accepts new state.
- Baseline: import ok 11/13 (ports with non-`[N:0]` vectors throw),
  round-trip 0/13; zoo coverage 5 / 49 / 62 / 35 elements.

Survey findings (counts only):
- Inputs today: 2014 + 2009 components only; real files use 40–47 XSD
  elements each version — memory maps, bus interfaces, ports, enumerations,
  `dim`, `vendorExtensions` (2014).
- Real files may be XSD-invalid (e.g. non-standard `access` values) →
  importer must keep unknown enum values verbatim + diagnostic, never throw.

## 10. Defaults: explicit vs implicit (proposal)

Many IP-XACT elements are optional with a schema default
(`addressUnitBits` = 8, `testable` = true, `presence` = optional,
`volatile` = false, `endianness` = little, `bitsInLau` = 8, ...).
XML can say same thing two ways: element omitted (implicit default) or
element present with default value (explicit). Semantics equal, text differs.

If import fills defaults (or export omits them), re-export cannot tell which
spelling original used → `XML → DuH → XML` differs textually, though
semantically equal.

Proposal:
- **Import stores only what is written.** No default filling at import.
- **Export writes only what is stored.** No default omission / insertion.
- → explicit / implicit preserved for free; round-trip exact.
- Consumers needing effective values use `duh-core` helper
  (e.g. `withDefaults(node)` / `effective(node, prop)`), default table per
  property in one place.
- Cross-version export: if target version lacks a default (or differs),
  export writes explicit value.
- Default table (D15) mirrors IP-XACT / SPIRIT defaults; where versions
  disagree, table is per version and DuH picks newest (2022) as effective
  default, with export writing explicit value for older targets.
- C25 (omit defaults as compact form) then not a transform at all — it is
  just "author did not write it".

## 11. Open questions

None blocking. Resolved: merge out of scope (D10), `pSchema` scope (D12),
overlap policy (D16), §6 / §7 approved.
