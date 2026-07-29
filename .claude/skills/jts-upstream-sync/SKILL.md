---
name: jts-upstream-sync
description: Use when following an upstream JTS change into this port - running scripts/jts-sync.mjs (check, pull, anchors, locate, scaffold), applying an upstream diff to the anchored counterparts in js/src and rs/core/src, or reasoning about pin.json portedMembers coverage and which JTS test classes are vendored.
---

# Upstream JTS sync

`scripts/jts-sync.mjs` keeps `upstream/jts/` honest. Node only, no dependencies.

```bash
node scripts/jts-sync.mjs check [--ref master] [--diff]  # verify hashes, compare against upstream
node scripts/jts-sync.mjs pull --ref <tag|sha>           # refresh upstream/jts/ and pin.json
node scripts/jts-sync.mjs anchors                        # check @jts anchor integrity
node scripts/jts-sync.mjs locate <file>:<line>           # Java line -> ported counterpart
node scripts/jts-sync.mjs scaffold --lang ts|rs          # anchored skeletons from the Java
pnpm test:scripts                                        # unit tests for the above
```

Exit codes: `0` clean, `1` findings, `2` operational failure.

`--ref` defaults to `master`: that is upstream's default branch name, not `main`.

Following an upstream change:

1. `node scripts/jts-sync.mjs pull --ref <tag|sha>`
2. `git diff upstream/` — this diff is the work order
3. apply each hunk to the anchored counterpart in `js/src` and `rs/core/src`
4. `pnpm test && pnpm bench`
5. `node scripts/jts-sync.mjs anchors`

`.github/workflows/jts-drift.yml` runs `check` weekly and opens or updates an issue
labelled `jts-drift`. `anchors` runs in `ci.yml` on every push: every one of the 97
in-scope members across the 20 pinned files carries a `@jts` anchor, so the check exits 0
and a future member added upstream without a counterpart fails the build.

## `pin.json` coverage

A `pin.json` file entry may declare `portedMembers`, listing the only members required to
carry a `@jts` anchor — that is how a deliberately partial port (`DD`: 10 of 74 members)
avoids 64 spurious `@jts-omit` tags. A file entry without the field requires full coverage.
Twelve of the twenty entries declare one.

`Location.java` is the limiting case: its entry lists three **constants**. `scanJavaDir`
only ever yields method declarations, so a `portedMembers` entry naming a field matches
nothing and is never validated — the narrowing comes from the field being present at all,
which drops the unported `toLocationSymbol(int)` out of the coverage denominator. Anchors
in the _port_ that name a constant are validated separately, by a field-declaration probe.

## Vendored JTS tests

Ported JTS _tests_ are pinned the same way: `CentroidTest.java` (2 ported members) and
`InteriorPointTest.java` (3) are vendored with a `portedMembers` list, because an `@jts`
anchor must name a vendored file and the ported test methods carry anchors like any other
port. `AbstractPointInRingTest.java` (6 ported members), `RayCrossingCounterTest.java` (1),
and `SimplePointInAreaLocatorTest.java` (1) are vendored the same way. A JTS test class with
no ported counterpart is not vendored and gets `@jts-adapter` instead: `GeometryTestCase`,
whose XML runner node:test and the XML parsers stand in for, and `InteriorPointAreaPerfTest`,
whose timing loop tinybench and criterion stand in for. `PointLocationTest`,
`IndexedPointInAreaLocatorTest`, `PointLocatorTest`, `PointLocationOn4DLineTest`, and
`SimpleRayCrossingStressTest` are deliberately not vendored: nothing in them is ported.
