# JTS Porting Rules

Why these rules exist, and what they are. Most rules are cited by name from comments across
`js/src`, `rs/core/src`, and `scripts/`; two — the strict-interior measurement and the
adapter file-placement rule — are recorded here for the evidence and the rule they state,
without a comment naming them.

## Why these rules exist

The TypeScript and Rust ports were originally written by understanding the JTS algorithm and
re-implementing it idiomatically, rather than by transcribing it. Two measurements below show what
that cost in practice: an untracked dependency produced a real numerical defect, and the two
languages' integration tests turned out to assert different things without anyone deciding that on
purpose.

### The zero-length-line centroid defect

`InteriorPointLine` and `InteriorPointPoint` depend on `g.getCentroid()`, whose implementation
lives in a JTS file that was, at first, never tracked: `Centroid.java`. Both ports re-derived the
length-weighted centroid inline and simplified away one of JTS's rules in doing so.

JTS's `Centroid.addLineSegments` treats a zero-length line as a point:

```java
totalLength += lineLen;
if (lineLen == 0.0 && pts.length > 0)
  addPoint(pts[0]);
```

`getCentroid()` then falls back to `ptCentSum / ptCount` when `totalLength == 0`. The pre-fix ports
instead returned the first coordinate of the first line directly, skipping that fallback.

Measured, by executing both implementations:

| Input `MULTILINESTRING((0 0, 0 0), (10 10, 10 10), (10 10, 10 10))` | centroid                 | interior point     |
| ------------------------------------------------------------------- | ------------------------ | ------------------ |
| JTS 1.19.0 (`jts-core-1.19.0.jar`, Java 17)                         | `(6.667, 6.667)`         | **`(10, 10)`**     |
| Pre-fix TypeScript port                                             | `(0, 0)`                 | **`(0, 0)`**       |
| Pre-fix Rust port                                                   | same logic as TypeScript | same as TypeScript |

The existing test suite stayed green throughout: `TestInteriorPoint.xml` contains
`mL - zero length lines` = `MULTILINESTRING((10 10, 10 10), (20 20, 20 20))`, where JTS's centroid
`(15, 15)` and the pre-fix ports' centroid `(10, 10)` both select `(10, 10)`, because the two lines
are symmetric. The fixture missed the defect by one geometry. Vendoring upstream fixtures is
necessary but not sufficient; faithful structure is what guarantees agreement beyond the cases a
fixture happens to cover.

The fix is porting `Centroid.java` in full rather than re-deriving its logic — see
[the zero-length-line centroid fix](#the-zero-length-line-centroid-fix) below.

### The strict-interior measurement

The two languages' world tests, before this retrofit, asserted different predicates against the
same `world.wkt` fixture:

|                                                                                                      | predicate                | point on boundary |
| ---------------------------------------------------------------------------------------------------- | ------------------------ | ----------------- |
| JTS `g.contains(ip)`                                                                                 | strict interior          | fails             |
| TypeScript `inside(...) !== false` (pre-fix)                                                         | interior **or** boundary | passes            |
| Rust `geom.contains(&point)` — requires `CoordPos::Inside` (`geo/src/algorithm/contains/polygon.rs`) | strict interior          | fails             |

The TypeScript comment claimed equivalence to `Geometry.contains(Point)` but asserted something
weaker. Measured on `world.wkt`: 244 geometries, 244 strictly interior, 0 on-edge, 0 outside — so
tightening TypeScript to the strict predicate was safe, and it now agrees with both JTS and the
Rust port.

## Naming

### The unchanged-name rule

**Use JTS identifiers unchanged.** TypeScript matches Java spelling exactly. Rust applies
mechanical case conversion only: members and variables to `snake_case`, types to `PascalCase`,
constants to `SCREAMING_SNAKE_CASE`. Clarifying renames are forbidden: `intersection` must not
become `intersectionX`. Readability is served by porting the Javadoc, not by renaming.

A ported symbol keeps its JTS name (subject to Rust's mechanical case conversion), full stop. No
rewording for clarity, no shortening, no "more idiomatic" alternative. The reason is provenance,
not taste — a renamed symbol is a broken landing site for the next upstream diff, and the whole
point of this document is to keep those landing sites mechanical to find.

### The overload-suffix rule

**Overload disambiguation.** Append the PascalCase name of the first parameter's Java type to the
base name, uniformly across all overloads of that name. Array types use the plural of the element
type (`Coordinate[]` → `Coordinates`). **If the first parameter type does not uniquely identify the
overload, append the PascalCase names of every parameter type in order** (the overload-suffix
rule's extension, below). Constructors are outside this rule entirely: both emitters name them
structurally (`constructor` in TypeScript, `new` in Rust) and never consult the derived name.

**The overload-suffix rule's extension, for overloads sharing a first parameter type.** The base
rule was written against the five originally tracked files, where every overload set differs in
its first parameter type. `DD.java` breaks that assumption three times:

| Java member                      | Base overload-suffix name | Collides with              | Extended name              |
| -------------------------------- | ------------------------- | -------------------------- | -------------------------- |
| `DD#selfAdd(double)`             | `selfAddDouble`           | —                          | `selfAddDouble`            |
| `DD#selfAdd(double,double)`      | `selfAddDouble`           | **`selfAdd(double)`**      | `selfAddDoubleDouble`      |
| `DD#selfMultiply(double)`        | `selfMultiplyDouble`      | —                          | `selfMultiplyDouble`       |
| `DD#selfMultiply(double,double)` | `selfMultiplyDouble`      | **`selfMultiply(double)`** | `selfMultiplyDoubleDouble` |
| `DD#init(double)`                | `initDouble`              | —                          | `initDouble`               |
| `DD#init(double,double)`         | `initDouble`              | **`init(double)`**         | `initDoubleDouble`         |

Whether the short form is safe is decided from the **whole overload set**, not per member, so every
member of a set agrees on the form. Every name in the resulting-names table is unchanged by this
extension: all five original overload sets differ in their first parameter type
(`Envelope`/`Coordinate`, `Geometry`/`Coordinate[]` twice, `Geometry`/`Coordinate`,
`Geometry`/`Polygon`), verified by regenerating `scaffold --lang ts` and `--lang rs` for those five
files and diffing byte-for-byte against the pre-change output.

Two further corrections the extension exposed, both in `scripts/jts-scaffold.mjs`:

- **Constructors cannot be suffixed at all.** `DD.java` declares five `DD` constructors, one of
  them nullary, and the overload-suffix rule has no first parameter type to append for `DD()`.
  Since both emitters name constructors structurally, they are excluded from the rule rather than
  given an artificial suffix. The overload-suffix rule's nullary case still throws loudly for a
  genuine _method_ overload set, so the rule's limit stays visible rather than silently colliding.
- **`toSnake` collapsed internal acronyms.** `isCCWCoordinates` became `is_ccwcoordinates`, because
  the conversion only split lower→upper boundaries. A run of capitals followed by a capitalised
  word now splits between them (`is_ccw_coordinates`, `cg_algorithms_dd`), while a trailing acronym
  stays whole (`selfMultiplyDD` → `self_multiply_dd`). Without this, the unchanged-name rule's
  "mechanical case conversion" could not produce the Rust names this document specifies.

**Type-safe overloading was considered and rejected.** The overload-suffix rule's suffixes are not
a workaround for missing type safety — they are already fully type-checked, since each suffixed
name takes distinct parameter types. The alternative was to keep the JTS name and let the type
system disambiguate; measured, it is available in Rust for all five overload sets but in
TypeScript for only four:

| Overload set                                                                                     | TS overload signatures | Rust trait dispatch |
| ------------------------------------------------------------------------------------------------ | ---------------------- | ------------------- |
| `InteriorPointPoint#add(Geometry)` / `(Coordinate)`                                              | yes                    | yes                 |
| `InteriorPointLine#addInterior(Geometry)` / `(Coordinate[])`                                     | yes                    | yes                 |
| `InteriorPointLine#addEndpoints(Geometry)` / `(Coordinate[])`                                    | yes                    | yes                 |
| `InteriorPointArea#intersectsHorizontalLine(Envelope,double)` / `(Coordinate,Coordinate,double)` | yes (arity differs)    | yes (tupled args)   |
| `Centroid#add(Geometry)` / `(Polygon)`                                                           | **no**                 | yes                 |

`Centroid#add` is impossible in TypeScript because `Polygon` is a member of the `Geometry` union,
so the `Polygon` signature is unreachable under `tsc --strict`. Java resolves it because overload
resolution there is static; Rust succeeds throughout because `Geometry<f64>` is an enum and
`Polygon<f64>` a struct, hence unrelated types with no subsumption.

Rejected regardless, for three reasons:

1. **All nine overloaded JTS methods are `private`.** The suffixed names never reach the public
   API, so no external caller benefits.
2. **TypeScript overload signatures permit only one implementation body**, which would merge two
   JTS methods into one ported function and re-create the lost-landing-site problem this whole
   document exists to avoid.
3. **Rust trait dispatch relocates the method body** from `Centroid` onto the argument type,
   contradicting [the structure rule](#the-structure-rule) and moving the landing site away from
   the JTS structure. Five overload sets would need five ceremonial traits.

### The factory/getter rule

**Static factory vs instance getter.** A static method sharing a name with an instance method maps
to a module-level function; the instance method maps to a method of the same name. Neither collides
in TypeScript or Rust, so both keep the JTS name — except where the module-level name would collide
across modules, in which case it is qualified by the class name and recorded with `@jts-deviate`.

The rule was originally worded narrower, as "a JTS `static getX(Geometry)` **factory**" — a method
returning an instance. `SimplePointInAreaLocator#locate(Coordinate,Geometry)` /
`#locate(Coordinate)` exposed the gap: `locate` returns an `int`, not a `Geometry`, so the letter of
the old wording missed it while its intent covered it exactly. The rule now reads "a static method
sharing a name with an instance method", which is what the tooling (`isFactoryGetterPair`) already
implemented. `getInteriorPoint` and `getCentroid` are unaffected: both are still factories, and
still keep the JTS name for the same reason.

### The naming table

Resulting names for the five originally tracked files:

| JTS                                                                        | TypeScript                                                                        | Rust                                    |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------- |
| `InteriorPointArea#intersectsHorizontalLine(Envelope,double)`              | `intersectsHorizontalLineEnvelope`                                                | `intersects_horizontal_line_envelope`   |
| `InteriorPointArea#intersectsHorizontalLine(Coordinate,Coordinate,double)` | `intersectsHorizontalLineCoordinate`                                              | `intersects_horizontal_line_coordinate` |
| `InteriorPointLine#addInterior(Geometry)`                                  | `addInteriorGeometry`                                                             | `add_interior_geometry`                 |
| `InteriorPointLine#addInterior(Coordinate[])`                              | `addInteriorCoordinates`                                                          | `add_interior_coordinates`              |
| `InteriorPointLine#addEndpoints(Geometry)`                                 | `addEndpointsGeometry`                                                            | `add_endpoints_geometry`                |
| `InteriorPointLine#addEndpoints(Coordinate[])`                             | `addEndpointsCoordinates`                                                         | `add_endpoints_coordinates`             |
| `InteriorPointPoint#add(Geometry)`                                         | `addGeometry`                                                                     | `add_geometry`                          |
| `InteriorPointPoint#add(Coordinate)`                                       | `addCoordinate`                                                                   | `add_coordinate`                        |
| `Centroid#add(Geometry)`                                                   | `addGeometry`                                                                     | `add_geometry`                          |
| `Centroid#add(Polygon)`                                                    | `addPolygon`                                                                      | `add_polygon`                           |
| `InteriorPointArea#getInteriorPoint(Geometry)` (static)                    | `interiorPointArea` + `@jts-deviate` (name collides with the other three modules) | `interior_point_area` + `@jts-deviate`  |
| `InteriorPoint#getInteriorPoint(Geometry)` (static)                        | `interiorPoint` + `@jts-deviate`                                                  | `interior_point` + `@jts-deviate`       |
| `Centroid#getCentroid(Geometry)` (static)                                  | `getCentroid`                                                                     | `get_centroid`                          |

The overload-suffix rule's extension table (`DD#selfAdd`, `DD#selfMultiply`, `DD#init`) is
reproduced under [the overload-suffix rule](#the-overload-suffix-rule) above, since it exists to
justify that rule's extension rather than to add further rows to this one.

## The structure rule

JTS inner classes become TypeScript `class` and Rust `struct` + `impl`, with methods in 1:1
correspondence. For the tracked files, both forms are idiomatic in both languages, so faithfulness
costs nothing: a Rust struct field access through `&mut self` compiles to the same code as passing
a `&mut f64` parameter, and a TypeScript class instance replaces per-call closure allocation.

| JTS symbol                                               | TypeScript                                 | Rust                                          |
| -------------------------------------------------------- | ------------------------------------------ | --------------------------------------------- |
| `InteriorPointArea` (fields `interiorPoint`, `maxWidth`) | `class InteriorPointArea`                  | `struct InteriorPointArea`                    |
| `InteriorPointArea.InteriorPointPolygon`                 | `class InteriorPointPolygon`               | `struct InteriorPointPolygon<'a>`             |
| `InteriorPointArea.ScanLineYOrdinateFinder`              | `class ScanLineYOrdinateFinder`            | `struct ScanLineYOrdinateFinder<'a>`          |
| `InteriorPointArea#avg`                                  | `avg`                                      | `avg`                                         |
| `InteriorPoint.DimensionNonEmptyFilter`                  | `dimensionNonEmptyFilter` + `@jts-deviate` | `dimension_non_empty_filter` + `@jts-deviate` |
| `InteriorPointLine`                                      | `class InteriorPointLine`                  | `struct InteriorPointLine`                    |
| `InteriorPointPoint`                                     | `class InteriorPointPoint`                 | `struct InteriorPointPoint`                   |
| `Centroid`                                               | `class Centroid` (`centroid.ts`)           | `struct Centroid` (`centroid.rs`)             |

`DimensionNonEmptyFilter` implements `GeometryFilter`, driven by `Geometry.apply()`. That interface
is not part of the adapted geometry model, so it becomes a recursive traversal function with
identical semantics, recorded with `@jts-deviate`. The receptacle is preserved: the function keeps
the filter's name and its body mirrors `filter(Geometry elem)`.

## The adapter boundary

> Upstream files containing algorithmic behaviour are tracked (vendored and ported). Pure
> infrastructure — assertions, geometry-model accessors — is handled as an adapter with a
> documented mapping.

`Centroid.java` is the former, which is why it is tracked. `Assert.java` and `Envelope.java` are
the latter.

The concept-by-concept mapping this rule produces — `Coordinate`, `Envelope`,
`LinearRing.getEnvelopeInternal()`, `Geometry.isEmpty()`, `Geometry.getDimension()`,
`Assert.isTrue()`, `Orientation.isCCW()`/`index()`, and the rest — is `CLAUDE.md`'s
[Type Mapping table](../CLAUDE.md#type-mapping-jts--ts--rust). It is not reproduced here:
this section states the rule the mapping follows, so the mapping itself has one home and
cannot drift against a second copy.

Two further JTS members are not in that table because they are not a type-for-type
substitution, but they are still adapters, and the rule is why: `CoordinateSequence` and
`Coordinate.equals2D()`.

`CoordinateSequence` is an adapter rather than a ported type because neither port has a sequence
abstraction: `Orientation.isCCW(Coordinate[])` wraps its argument in a `CoordinateArraySequence`
before delegating, so in the ports that wrap is a no-op and both overloads take the same coordinate
array. Both landing sites are kept anyway, so an upstream change to either is still a single
anchored site.

`Coordinate.equals2D()` has no equivalent in either target geometry model. TypeScript defines
`equals2D` locally (in `orientation.ts`, tagged `@jts-adapter`, since it is that module's only
caller); Rust needs no equivalent function, because `geo_types::Coord` already derives
`PartialEq`, so `==` on two `Coord<f64>` values is the same exact-coordinate comparison.

**Adapter type names follow the host ecosystem, so the two languages differ by design.** The rule:
where the ecosystem already provides the concept as a named type, borrow that name; where the
adapter must define the type itself, use the JTS name.

| Language   | Coordinate                   | Envelope                   | Result                    |
| ---------- | ---------------------------- | -------------------------- | ------------------------- |
| TypeScript | `Coordinate` (defined by us) | `Envelope` (defined by us) | uniformly JTS-named       |
| Rust       | `Coord<f64>` (geo-types)     | `Rect<f64>` (geo-types)    | uniformly geo-types-named |

TypeScript must define `Envelope` regardless — GeoJSON has no named record for it (a `bbox` is a
positional `number[]`) — so the adapter is already authoring its own types, and `Coordinate` costs
nothing there. `Position` is a _structural_ alias (`type Position = number[]`) with no nominal
identity, so `type Coordinate = Position` introduces two labels for one type rather than renaming
anyone's type. Rust's `Coord<f64>` is a _nominal_ struct: an alias would add a rustdoc indirection
over a type geo-types already names canonically, and `Coord<f64>` is in the published signature.
Aliasing it would buy internal consistency at the cost of external familiarity — the same trade
this section already resolves in geo-types' favour for `Envelope` → `Rect<f64>`.

The asymmetry is therefore **between** languages, never **within** one; each side is internally
consistent, and the table above is the bridge.

`Coordinate` and `Position` are the same type, so `tsc` cannot detect a module that keeps importing
`Position`. The rule is enforced by lint instead:

```js
// eslint.config.mjs
{
  files: ["js/src/**/*.ts"],
  rules: {
    "no-restricted-imports": ["error", {
      paths: [{
        name: "geojson",
        importNames: ["Position"],
        message: "Use Coordinate from ./geometryAdapter (the unchanged-name rule).",
      }],
    }],
  },
}
```

`pnpm lint` runs in CI, so this is enforced from the moment it lands. Without it the rule is
unenforceable and would decay silently.

## The adapter file-placement rule

Adapters are collected per language rather than scattered through the algorithm modules, so the
boundary stays visible.

| Language   | File                              | Contents                                                                                                                                                                                                                                                                                                                          |
| ---------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript | `js/src/geometryAdapter.ts`       | `Coordinate` and `Envelope` types, `envelopeInternal`, `envelopeInternalGeometry`, `envelopeIntersectsCoordinate`, `isGeometryEmpty`, `dimension`, `distance`                                                                                                                                                                     |
| TypeScript | `js/src/assert.ts`                | `assertTrue` (throws, mirroring `AssertionFailedException`)                                                                                                                                                                                                                                                                       |
| Rust       | `rs/core/src/geometry_adapter.rs` | `envelope_internal`, `is_geometry_empty`, `dimension`, `distance` unconditionally; `envelope_internal_geometry` and `envelope_intersects_coordinate` are `#[cfg(test)]`, reachable only from the point-in-polygon locator stack. `Envelope` maps to `geo_types::Rect<f64>` and `assertTrue` to `assert!`, so neither needs a shim |

Algorithm modules import from these files; nothing else is allowed to define geometry-model
helpers.

`Coordinate` is re-exported from `js/src/index.ts` so consumers can name the return type of
`interiorPoint` without importing `Position` from `geojson`. Because it is a structural alias, this
is a purely additive change to the public API, not a breaking one.

## Test porting

Test methods carry anchors too, so anchor coverage extends to tests
(`/** @jts InteriorPointTest#testPolygonZeroArea */`), and the XML parsers
(`js/test/utils/xmlTestParser.ts`, `rs/core/tests/utils/xml_test_parser.rs`) gained a branch for
the `getCentroid` op alongside the pre-existing `getInteriorPoint` one.

| JTS test asset                                  | Size                                                                  | Treatment                                                                                                                                    |
| ----------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `testxml/general/TestInteriorPoint.xml`         | 24 cases                                                              | Vendored, moved under `upstream/jts/resources/`                                                                                              |
| `testxml/general/TestCentroid.xml`              | 38 cases                                                              | Vendored; drives the `Centroid` tests                                                                                                        |
| `core/.../testdata/world.wkt`                   | 244 geometries                                                        | Vendored, moved under `upstream/jts/resources/`                                                                                              |
| `algorithm/InteriorPointTest.java`              | 3 test methods                                                        | Mirrored in both languages, anchored                                                                                                         |
| `algorithm/CentroidTest.java`                   | 2 ported members (`testCentroidMultiPolygon`, `areaWeightedCentroid`) | Ported to both languages                                                                                                                     |
| `perf/algorithm/InteriorPointAreaPerfTest.java` | —                                                                     | **Not vendored.** Ported as benches (vitest bench / criterion stand in for the timing loop); recorded as `@jts-adapter`                      |
| `test/jts/GeometryTestCase.java`                | 474 lines                                                             | **Not ported.** JUnit-bound test infrastructure; vitest / cargo test plus the existing XML parsers fill the role. Recorded as `@jts-adapter` |

### The exact-comparison rule

Before this retrofit, the two languages disagreed on how to compare a ported test's actual value
against the JTS-derived expected value:

| Item                          | TypeScript           | Rust              | Resolution                                                                                                                                                                                                                                                |
| ----------------------------- | -------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| XML expected-value comparison | `toEqual` (exact)    | `1e-10` tolerance | Exact comparison in both. Both evaluate the same IEEE 754 `f64` operations in the same order, so exact equality is expected; if a case fails, that is information worth having, and any tolerance introduced instead must be recorded with `@jts-deviate` |
| `world.wkt` predicate         | interior or boundary | strict interior   | Strict in both — see [the strict-interior measurement](#the-strict-interior-measurement)                                                                                                                                                                  |
| Case-count comment            | "23 cases"           | "24 cases"        | The parser yields 24 (measured); the TypeScript comment was stale                                                                                                                                                                                         |

The rule this section is named for is the first row: exact comparison, not tolerance, is the
default for JTS-derived fixtures in both languages. A tolerance is a deliberate, recorded exception,
never the baseline.

### The internal-type test-placement rule

`Centroid` stays internal — it is not exported from either language's public entry point. In
TypeScript, tests already import from `../src/*` directly, so nothing extra is needed. In Rust,
`tests/` is an external crate and cannot see a crate-internal type, so the `TestCentroid.xml`-driven
test lives in a `#[cfg(test)] mod tests` inside `centroid.rs` itself. This departs from the
one-JTS-test-file-to-one-port-test-file mapping every other ported test follows, and is recorded
with `@jts-deviate`.

The Rust world test follows the same rule for the same underlying reason: the point-in-polygon
locator stack it asserts containment through is also `#[cfg(test)]`-only (see `CLAUDE.md`'s
Supporting Ports section), so `rs/core/tests/interior_point_world_test.rs` cannot reach it either.
It lives instead at `rs/core/src/interior_point_world_test.rs` as a `#[cfg(test)] mod`, recorded
with `@jts-deviate`.

## Behaviour changes

Both changes below are intentional and belong in the changelog rather than being silently absorbed.
Neither port has reached a stable 1.0 release — `js/package.json` is at `0.1.0`, `rs/Cargo.toml` at
`0.2.0` — so a breaking change is an acceptable outcome, provided it is recorded rather than hidden.

### The even-crossing assertion

`Assert.isTrue(0 == crossings.size() % 2, "Interior Point robustness failure: odd number of
scanline crossings")` is ported faithfully: it becomes a `throw` in TypeScript and `assert!` in
Rust. Invalid geometry that previously produced a silently degraded result now fails loudly, as in
JTS. The loop bound also returns to JTS's `i < crossings.size()` step 2.

### The zero-length-line centroid fix

Porting `Centroid.java` faithfully — rather than re-deriving its logic inline, as the pre-fix ports
did — changes the interior point of geometries whose linear components all have zero length. See
[the zero-length-line centroid defect](#the-zero-length-line-centroid-defect) above for what was
measured and why the existing fixtures had not caught it. A regression test for exactly this input
(`MULTILINESTRING((0 0, 0 0), (10 10, 10 10), (10 10, 10 10))`, expecting `(10, 10)`) now exists in
both languages' test suites, confirmed against real JTS.
