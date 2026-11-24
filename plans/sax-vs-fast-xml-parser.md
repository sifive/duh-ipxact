# `sax` vs `fast-xml-parser` for `onml`

## Verdict

**No — `fast-xml-parser` is a poor fit as a parser backend for `onml`.**

`onml.parse` builds a JSONML tree (`[tag, attrs, ...children]`) directly in a single pass over 41 lines of code using 4 SAX callbacks. `fast-xml-parser` (FXP) is a whole-document XML→JS-object tree builder, not an evented parser. Putting FXP under `onml` forces `preserveOrder: true`, allocates an intermediate FXP AST, and requires a second recursive pass to convert into JSONML—erasing FXP's speed advantage while increasing peak memory, adding 6 runtime dependencies, tripling bundle size, and breaking `onml`'s `strict: false` lenient HTML mode.

Keep `sax` in `onml`. If `onml` ever needs higher throughput, evaluate a faster **evented/SAX** parser (`@nodable/sax`, `saxes`, `saxen`, or `htmlparser2`)—not a tree builder.

---

## 1. How `onml.parse` Works Today

`node_modules/onml/parse.js` (v2.3.0) is 41 LOC and uses only 4 hooks from `sax`:

- `onopentag` → allocates `[e.name, e.attributes]`, pushes onto stack
- `onclosetag` → pops stack
- `ontext` → pushes text if `!trim || e.trim() !== ''`
- `oncdata` → pushes `'<![CDATA[' + e + ']]>'` if `!trim || e.trim() !== ''`

Public API contract:
- `onml.parse(data, { strict = true, trim = true })`
- Output: JSONML `[tagName, attrObj, ...children]` where `attrObj` is always present (`{}` when empty), all text/attribute values remain strings, and child/mixed-content order is exact.
- Targets Node **and** browsers (`build/onml.js`, 64 KB unminified, published to `unpkg`).
- Targets XML, SVG, **and** lenient HTML (`strict: false`).

---

## 2. Head-to-Head Comparison

| Dimension | `sax` (`1.6.1`) | `fast-xml-parser` (`5.12.1`) | Winner for `onml` |
| --- | --- | --- | --- |
| **Architecture** | Evented streaming SAX parser | Whole-document XML→JS-object builder | `sax` |
| **JSONML construction** | 1 pass directly into `[tag, attrs, ...]` | 2 passes: XML → FXP `preserveOrder` AST → JSONML | `sax` |
| **Runtime dependencies** | `0` | `6` (`@nodable/entities`, `fast-xml-builder`, `is-unsafe`, `path-expression-matcher`, `strnum`, `xml-naming`) | `sax` |
| **Bundle size (min / min+gz)** | `21.9 kB` / `7.5 kB` | `75.8 kB` / `24.1 kB` (~3.2× larger; `fxparser.min.js` alone ~20 kB min) | `sax` |
| **Raw throughput** | ~25–30 MB/s (measured on `duh-ipxact` XSDs) | Faster in default object mode; slower & heavier in `preserveOrder: true` + conversion pass | Tie / `sax` for JSONML |
| **Peak memory** | 1 tree (`onml` output) | 2 trees simultaneously during AST→JSONML conversion | `sax` |
| **Streaming** | Yes (`p.write(chunk)`) | No (full string or `Uint8Array`) | `sax` |
| **Lenient HTML (`strict: false`)** | Built-in | Not supported (requires explicit `unpairedTags` + `stopNodes` lists) | `sax` |
| **Whitespace (`trim`) parity** | Exact | Mismatch: `trimValues: true` trims inside non-empty text & attributes; must disable and filter manually | `sax` |
| **Type preservation** | Strings only (matches XML/JSONML) | Coerces numbers/booleans by default; must disable `parseTagValue` & `parseAttributeValue` | `sax` |
| **Security surface** | Tiny, 0 CVEs in `1.6.1`, no DOCTYPE entity expansion | Active hardening (`maxNestedTags`, `is-unsafe`, `onDangerousProperty`), but larger surface with recurring advisories (e.g. GHSA-mpg4-rc92-vx8v, GHSA-37qj-frw5-hhjh, CVE-2026-126066, GHSA-g62r-xqpr-7fwx) | `sax` |
| **Maintenance** | Stable, low churn (`1.6.1`, Jul 2026, ~137M dl/wk) | Very active (`5.12.1`, Nov 2026, ~118M dl/wk), frequent releases | Tie |
| **License** | `BlueOak-1.0.0` (permissive) | `MIT` | Tie |

---

## 3. Architectural & Semantic Friction with `fast-xml-parser`

To preserve element order and mixed content (required by JSONML), FXP must run with `preserveOrder: true`. That produces an intermediate AST like:

```json
[
  {
    "p": [
      { "#text": "hello " },
      { "b": [{ "#text": "world" }] }
    ],
    ":@": { "id": "1" }
  }
]
```

Reproducing `onml.parse` on top of FXP would require:

```js
const { XMLParser } = require('fast-xml-parser');

function parse(data, config = {}) {
  const trim = config.trim !== undefined ? config.trim : true;
  // config.strict === false has no equivalent in FXP

  const parser = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: '',
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: false, // FXP trimValues mutates non-empty text & attrs
    ignoreDeclaration: true,
    ignorePiTags: true,
    cdataPropName: '#cdata'
  });

  const ast = parser.parse(data);

  function toOnml(nodes) {
    const out = [];
    for (const node of nodes) {
      if ('#text' in node) {
        const txt = String(node['#text']);
        if (!trim || txt.trim() !== '') out.push(txt);
      } else if ('#cdata' in node) {
        const raw = node['#cdata'].map(c => c['#text'] ?? '').join('');
        if (!trim || raw.trim() !== '') out.push('<![CDATA[' + raw + ']]>');
      } else {
        const tag = Object.keys(node).find(k => k !== ':@');
        const attrs = node[':@'] || {};
        out.push([tag, attrs, ...toOnml(node[tag])]);
      }
    }
    return out;
  }

  return toOnml(ast)[0];
}
```

Concrete problems with this approach:
1. **Double allocation & double traversal**: FXP builds its array-of-single-key-objects AST, then `toOnml` allocates the final JSONML arrays and discards the AST.
2. **Broken `strict: false`**: `onml` documents `strict: false` for lenient HTML parsing. FXP cannot emulate this without knowing every void tag up front.
3. **Subtle `trim` divergence**: `onml`'s `trim: true` drops whitespace-only text nodes while preserving leading/trailing whitespace in non-empty text nodes (`<p>  keep  </p>` → `['p', {}, '  keep  ']`). FXP's `trimValues: true` trims *all* text and attribute values, so it must be disabled and re-implemented in `toOnml`.
4. **Validation is off by default**: FXP's `parse()` does not strictly validate malformed XML unless the separate validator is enabled (which adds another pass). `sax` in strict mode rejects malformed XML during the single parse pass.
5. **Browser bundle bloat**: `onml` ships a standalone browser bundle (`build/onml.js`). Pulling in FXP and its 6 dependencies (including `fast-xml-builder` which `onml` doesn't need because it has `onml.stringify`) triples the minified+gzipped footprint.

---

## 4. Relevance to `duh-ipxact`

Measured `onml.parse` (`sax@1.6.1`) on all 92 Accellera IP-XACT XSDs in `accellera.org/`:

- **Files**: 92
- **Total size**: 1,369.9 KB (1.37 MB)
- **Wall time (cold V8)**: 48.1 ms (~27.8 MB/s)

XML parsing is not a bottleneck in `duh-ipxact`. For large IP-XACT component/register files (tens of MB), the dominant cost is memory footprint of the in-memory tree plus downstream `ml2on` / XSD-walk transforms—and FXP + `preserveOrder` + conversion would *worsen* peak memory.

Where `fast-xml-parser` *would* make sense is only if a project wanted to **bypass `onml`/JSONML altogether** and parse XML straight into typed JS objects. Since `duh-ipxact` relies on JSONML across `onml.parse`, `onml.traverse`, `onml.stringify`, `lib/xsd/*`, and `lib/ml2on.js`, that does not apply here.

---

## 5. Better Alternatives (If `onml` Ever Moves Off `sax`)

If `onml` ever needs faster parsing or wants to drop `sax`, pick an **evented/SAX** parser that preserves the 1-pass architecture:

| Parser | Deps | Pros | Cons |
| --- | --- | --- | --- |
| **`sax`** *(current)* | 0 | Tiny (7.5 kB gz), streaming, strict + lenient HTML, proven, zero-dep | Slower than newer scanners |
| **`@nodable/sax`** | few (`flexible-xml-parser`) | Built by FXP's author specifically for SAX use cases; claims 3–4× faster than `sax`, streaming, incomplete XML/HTML | Newer ecosystem, extra deps |
| **`saxes`** | 0 | Faster than `sax`, strict XML 1.0/1.1 + namespaces, well-tested | XML-only (no `strict: false` HTML mode) |
| **`saxen`** | 0 | Very fast, tiny | XML-only, less strict validation |
| **`htmlparser2`** | small | Fast, supports both `xmlMode: true` and lenient HTML | Slightly heavier than `sax`, HTML-first semantics |

## Summary Recommendation

- **Keep `sax` in `onml`.** It matches `onml`'s single-pass JSONML construction, zero-dependency philosophy, small browser bundle, and strict/lenient API.
- **Do not switch `onml` to `fast-xml-parser`.** It solves a different problem (XML → JS object) and is a net regression when forced to output JSONML.
- **Revisit only if** profiling shows `onml.parse` is a real bottleneck on multi-100 MB XML inputs—and if so, benchmark `@nodable/sax` or `saxes` instead.
