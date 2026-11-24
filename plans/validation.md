# Vanilla JS IP-XACT / SPIRIT XSD Validation

status: done

Pure-JavaScript XSD validator for IP-XACT / SPIRIT XML documents across all four
supported standards (`spirit-1.4`, `spirit-2009`, `ipxact-2014`, `ipxact-2022`),
with source-location tracking via `onml@2.4.0` and grouped diagnostics.

## 1. Architecture

```
XML string
  │
  ▼ onml.parse(xml, {loc: new WeakMap()})
JSONML tree + WeakMap<node, {start, end}>
  │
  ▼ lib/versions.js detect(doc)  (by root xmlns URI)
lib/xsd/<version>.json           (precompiled from accellera.org/XMLSchema/)
  │
  ▼ lib/xsd/check.js             (+ types.js, keys.js)
{ok, version, errors: [{code, line, column, offset, endLine, endColumn, endOffset, path, message}]}
  │
  ▼ lib/xsd/report.js
Grouped box-drawing snippets + corpus cause summary
```

### Source locations (`onml@2.4.0`)

`onml` was extended with a `WeakMap` side-table (`config.loc: true | WeakMap | Map`
and `onml.loc(node)`) so JSONML nodes remain pure (`JSON.stringify`, `onml.stringify`,
and `deep.equal` unaffected). Element spans `{start, end}` (`{line, column, offset}`,
1-based line/column, 0-based offset) are computed via binary search over newline
offsets from `sax` `startTagPosition - 1` and `position`.

## 2. Files

| File | Role |
|---|---|
| `lib/xsd/table.js` | Compiles `accellera.org/XMLSchema/<dir>/*.xsd` into `lib/xsd/<id>.json`. Extracts element particles (with `ref` flag), attributes (with `default`/`fixed`/`anyAttr`), `complexContent` inherited `text`, `simpleContent/restriction` facets, and `xs:key` / `xs:unique` / `xs:keyref` (`rootKeys` + local `keys`). |
| `lib/xsd/<id>.json` | Regenerated tables (`npm run xsd`) for `spirit-1.4`, `spirit-2009`, `ipxact-2014`, `ipxact-2022`. |
| `lib/xsd/types.js` | Validates all 14 `xs:*` built-in types used by IP-XACT (`Name`, `string`, `boolean`, `token`, `nonNegativeInteger`, `NMTOKEN`, `int`, `float`, `positiveInteger`, `ID`, `double`, `NMTOKENS`, `anyURI`, `IDREF`) and facets (`enumeration`, `pattern` with `\i`/`\c` → Unicode regex translation, `minInclusive`/`maxInclusive`, `minLength`/`maxLength`/`length`, `whiteSpace`, `union`, `list`). |
| `lib/xsd/keys.js` | Evaluates XSD restricted XPath `selector`/`field` expressions for `xs:key`, `xs:unique`, and `xs:keyref`, including schema attribute `default` fallback. |
| `lib/xsd/check.js` | Full validator: element names, target namespace, `sequence`/`choice` order & occurrence, attributes (required, unexpected, `anyAttr` `##any`/`##other`, types, `fixed`), element-only text checks, `xs:ID`/`xs:IDREF`, identity constraints, error codes, and `{loc, detailed}` output. Backward-compatible `check(table, doc) → string[]`. |
| `lib/xsd/report.js` | Diagnostic grouping (`groupErrors`), `rustc`/`miette`/`Biome`-style box-drawing source snippets with tab-aligned caret underlines and horizontal windowing (`formatDiagnostic`, `formatReport`), and multi-file cause ranking (`formatCorpusSummary`). Zero deps, TTY-aware ANSI colors (respects `NO_COLOR`). |
| `lib/xsd/validate.js` | High-level API: `validate(xml)`, `formatError`, plus re-exports from `report.js`. Exported as `require('duh-ipxact').validate`. |
| `bin/validate.js` | CLI validator (defaults to `tmp/`; accepts files/dirs). Flags: `--all`, `--summary`, `--json`, `--no-color`, `--xmllint`, `-h/--help`. |
| `test/validate.js` | Unit tests for valid docs, line/col reporting, enums, unexpected attrs, `xs:key`, `xs:keyref`, unknown ns, malformed XML, grouping, snippets, and corpus summary. |

## 3. Diagnostic Codes

`E_PARSE`, `E_EMPTY`, `E_NS_UNKNOWN`, `E_NS`, `E_CONTENT`, `E_ELEM_UNKNOWN`,
`E_TEXT`, `E_ATTR_MISSING`, `E_ATTR_UNKNOWN`, `E_FIXED`, `E_ENUM`, `E_PATTERN`,
`E_RANGE`, `E_LENGTH`, `E_TYPE`, `E_KEY_DUP`, `E_KEY_MISSING`, `E_KEYREF`,
`E_ID_DUP`, `E_IDREF`.

## 4. Verification & Differential Testing vs `xmllint`

- **`npm test`**: 68 passing (`test/basic.js`, `test/validate.js`, `test/zoo.js`).
- **`test/zoo/`**: 13/13 PASS (JS and `xmllint` agree).
- **`tmp/`**: JS and `xmllint` agree on pass/fail and exact error line numbers.
- **`pub/` (4,024 public XML files across all 4 versions)**:
  - JS results: 3,113 PASS, 911 FAIL (`spirit-1.4`: 160/137, `spirit-2009`: 1,128/151, `ipxact-2014`: 950/576, `ipxact-2022`: 875/46, unknown: 0/1).
  - Differential vs `xmllint`:
    - Agree PASS: 2,978
    - Agree FAIL: 911
    - JS false positives (`JS FAIL / xmllint PASS`): **0**
    - JS false negatives (`JS PASS / xmllint FAIL`): **135** — all 135 are a single cause: `xmllint` rejects unresolved `xsi:type` attributes inside opaque `vendorExtensions` (`xs:any processContents="lax"` without vendor XSDs loaded).

Bugs found and fixed via differential testing on `pub/`:
1. `complexContent` extensions in `table.js` dropped inherited `bt.text` (fixed 210 false positives).
2. `anyAttr: '##other'` in `check.js` previously allowed unqualified attributes (caught 115 false negatives).
3. Local elements sharing a name with a global root (e.g. `component/typeDefinitions`) inherited `table.rootKeys` (gated behind `p.ref`).
4. `keys.js` missed schema attribute `default` values (e.g. `constraintSet/@constraintSetId="default"`).

## 5. Usage

```bash
node bin/validate.js                # validate tmp/ with grouped snippets
node bin/validate.js test/zoo       # validate synthetic zoo
node bin/validate.js --summary pub  # corpus summary + top failure causes
node bin/validate.js --all <file>   # show every occurrence (no grouping)
node bin/validate.js --json tmp     # machine-readable JSON output
node bin/validate.js --xmllint tmp  # cross-check with external xmllint
```
