# testdata

Locally generated test fixtures.

Fixtures copied verbatim from upstream JTS live under `upstream/jts/resources/`
instead, where `upstream/jts/pin.json` records a `sha256` for each and forbids
local edits. This directory is the opposite: files here are produced by running
something locally — for example a golden file of expected interior points
generated with real JTS — so they carry no upstream hash and are regenerated
rather than synced.

See [`upstream/jts/NOTICE.md`](../upstream/jts/NOTICE.md) for the provenance
rules that apply to the vendored side.
