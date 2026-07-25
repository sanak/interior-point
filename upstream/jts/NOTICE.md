# Third-Party Notices — Eclipse JTS Topology Suite

Everything under `upstream/jts/` is an **unmodified verbatim copy** of files from
[locationtech/jts](https://github.com/locationtech/jts), pinned in
[`pin.json`](./pin.json) to commit `123a182e6e5a9cc8caed8ff037e4f824a5ce74ee`
(nearest tag `1.20.0`). These files are reference material for porting; they are
never edited locally and are not compiled or distributed as part of this project.
`pin.json` records a `sha256` per file so that any local edit is detected.

## Copyright

- `algorithm/InteriorPoint.java` — Copyright (c) 2016 Martin Davis.
- `algorithm/InteriorPointArea.java` — Copyright (c) 2016 Vivid Solutions.
- `algorithm/InteriorPointLine.java` — Copyright (c) 2016 Vivid Solutions.
- `algorithm/InteriorPointPoint.java` — Copyright (c) 2016 Vivid Solutions.
- `algorithm/Centroid.java` — Copyright (c) 2016 Vivid Solutions.
- `algorithm/CentroidTest.java` — carries no copyright header upstream; covered by
  the repository-wide license below.
- `resources/**` — test resources from the same repository and commit.

## License

All rights reserved. These programs and the accompanying materials are made
available under the terms of the Eclipse Public License 2.0 and the Eclipse
Distribution License v. 1.0:

- Eclipse Public License 2.0 — <http://www.eclipse.org/legal/epl-v20.html>
- Eclipse Distribution License v. 1.0 — <http://www.eclipse.org/org/documents/edl-v10.php>

The Eclipse Distribution License text is also included in this repository as
[`LICENSE_EDLv1.txt`](../../LICENSE_EDLv1.txt).

This project's own source code is licensed separately under the MIT License; see
[`LICENSE`](../../LICENSE).
