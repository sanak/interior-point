---
marp: true
theme: default
size: 16:9
paginate: false
style: |
  /* A split slide is a background-image directive, which is why only one layout is written out
     here: three code blocks are text, so Marp has nothing to place them with. The section
     itself becomes the grid, since Marp emits no wrapper element per column. */
  section.compare {
    display: grid;
    /* Marp downscales a code block until it fits its container, so a block's rendered type size is
       its container's width over the length of its own longest line. Widths in proportion to those
       lines - 69, 65 and 57 characters - put all three blocks at one size. One character is 14.84px
       of the theme's monospace before scaling, and 7.57px is what the widest pair of columns the
       slide can hold leaves of it. */
    --code-char: 7.57px;
    --code-frame: 32px;
    grid-template-columns:
      calc(69 * var(--code-char) + var(--code-frame))
      calc(65 * var(--code-char) + var(--code-frame));
    gap: 0.35em 1.1em;
    align-content: start;
    /* the title keeps the theme's own top padding, so it lands where every other slide's does;
       the bottom is what this slide trades for the height of the right column */
    padding-block-end: 45px;
  }
  /* the title stands in the left column alone */
  section.compare h1 {
    grid-area: 1 / 1;
  }
  /* and the right column is lifted out of the row the title leaves empty beside it - the title's
     own height plus the gap under it. The grid therefore measures taller than the slide it is
     drawn on, and it is the lifted position that has to fit. */
  section.compare h3:nth-of-type(2),
  section.compare h3:nth-of-type(3),
  section.compare pre:nth-of-type(2),
  section.compare pre:nth-of-type(3) {
    position: relative;
    top: -82px;
  }
  /* the three labels name a language and a file and nothing else, so they are set below body size;
     a heading level would not do it, the theme separating h3 from h4 by 5%. The path is a caption
     beside the name rather than half of it, and takes the size and the weight of one. */
  section.compare h3 {
    font-size: 0.8em;
  }
  section.compare h3 code {
    font-size: 0.55em;
    font-weight: normal;
  }
  section.compare h3:nth-of-type(1) {
    grid-area: 2 / 1;
  }
  /* the Java original stands beside both ports, and sized to its own content it does not leave a
     tall empty box */
  section.compare pre:nth-of-type(1) {
    grid-area: 3 / 1 / 6 / 2;
    align-self: start;
  }
  section.compare h3:nth-of-type(2) {
    grid-area: 2 / 2;
  }
  section.compare pre:nth-of-type(2) {
    grid-area: 3 / 2;
  }
  section.compare h3:nth-of-type(3) {
    grid-area: 4 / 2;
  }
  /* Rust's longest line is the shortest of the three, so its block is narrower than the column its
     heading spans */
  section.compare pre:nth-of-type(3) {
    grid-area: 5 / 2;
    width: calc(57 * var(--code-char) + var(--code-frame));
  }
  /* the theme's block padding is one line of code on each side of every block, which the stacked
     column pays twice */
  section.compare pre {
    padding-block: 10px;
    /* a column's width is the code plus the frame, and the one block given a width of its own is
       measured the same way */
    box-sizing: border-box;
  }
  /* the grid supplies the gaps, so the theme's own margins would double them */
  section.compare h1,
  section.compare h3,
  section.compare pre {
    margin: 0;
  }
  /* the theme puts a footer at the bottom left, on a 30px inset it gives header and footer
     together. The one footer in this deck is a citation rather than a running label, and it reads
     as belonging to the slide instead of to the line above it when it sits on the far side; the
     inset is therefore flipped, and `left: auto` is what releases the theme's own value, the rule
     that sets it naming no right to be overridden. */
  section footer {
    left: auto;
    right: 30px;
  }
  /* a five-column table does not fit a slide at the theme's own body size */
  section table {
    font-size: 0.72em;
  }
  section img {
    display: block;
    margin: 0 auto;
  }
  /* the handle icons sit inside a line of text rather than under one, so they are the deck's only
     images exempt from the rule above. A baseline is drawn under the letters and the icons are
     square, so an icon left on it reads as sitting low; a fifth of its own height is what lifts it
     to the middle of the lowercase letters beside it. */
  section.intro li img {
    display: inline-block;
    vertical-align: -0.2em;
    margin-inline: 0.1em;
  }
  /* the command name is what the CLI slide is about, and highlight.js has no token for one - it
     colours comments and strings and leaves the rest of a shell line as plain text. So those two
     blocks are written as raw HTML, which is also why marp.config.mjs exists. */
  section code .cmd {
    font-weight: bold;
    color: #c2410c;
  }
  /* a split background cannot carry a caption, so a slide whose figures need a line under them
     places them and that line in a column of their own. They live in a single paragraph, which is
     what puts the line directly under the last figure. Two slides are built this way. */
  section.cited {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0 1.4em;
    align-content: start;
    /* the screenshot is as tall as the slide allows, so this one trades vertical padding for it */
    padding-block: 50px;
  }
  section.cited h1 {
    grid-column: 1 / -1;
  }
  section.cited ul {
    grid-area: 2 / 1;
  }
  section.cited p {
    grid-area: 2 / 2;
    margin: 0;
    font-size: 0.7em;
    text-align: center;
  }
  /* a figure with no width of its own fills the column, so the pair on the benchmark slide scales
     with the grid rather than with a number. Marp writes a w: directive as an inline style, which
     outranks this rule, so the one screenshot given a width keeps it. */
  section.cited img {
    width: 100%;
  }
  /* the benchmark figures carry numbers meant to be read from the back of a room, so that slide
     takes the larger share of the width; the screenshot beside a citation keeps the even split. */
  section.cited.wide {
    grid-template-columns: 0.8fr 1.2fr;
  }
  /* and its figures stop a shade short of that column, which is what leaves the line under them
     clear of the slide's bottom padding. They still measure larger than the even split gave them. */
  section.cited.wide img {
    width: 94%;
  }
  /* the benchmark slide hands out the page it cites, so a QR of that URL stands at the foot of its
     left column. The figures beside it are given both of that column's rows, which is what leaves
     the QR a row of its own to be ended against - the bottom of the grid, and of the pair. */
  section.cited.wide p:nth-of-type(1) {
    grid-row: 2 / 4;
  }
  section.cited.wide p:nth-of-type(2) {
    grid-area: 3 / 1;
    align-self: end;
    text-align: left;
  }
  /* every other figure in the deck is centred in what holds it; this one is drawn to a width of
     its own against the left edge of its column, so the theme's auto margins are released. */
  section.cited.wide p:nth-of-type(2) img {
    margin-inline: 0;
  }
  /* the two additional functions stand side by side, each under a figure of its own. Marp emits
     no wrapper element per column here either, so the section is the grid again and each child is
     placed by hand; an image is a paragraph of its own, which is why p is counted four times. */
  section.pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.3em 1.4em;
    align-content: start;
  }
  section.pair h1 {
    grid-column: 1 / -1;
  }
  /* the function names are labels rather than headings, and take the size section.compare gives
     the labels over its code blocks */
  section.pair h3 {
    font-size: 0.8em;
  }
  section.pair p {
    font-size: 0.72em;
  }
  /* both descriptions share row 3, so the two figures start at one height whichever of them wraps
     to a second line */
  section.pair h3:nth-of-type(1) {
    grid-area: 2 / 1;
  }
  section.pair p:nth-of-type(1) {
    grid-area: 3 / 1;
  }
  section.pair p:nth-of-type(2) {
    grid-area: 4 / 1;
  }
  section.pair h3:nth-of-type(2) {
    grid-area: 2 / 2;
  }
  section.pair p:nth-of-type(3) {
    grid-area: 3 / 2;
  }
  section.pair p:nth-of-type(4) {
    grid-area: 4 / 2;
  }
  /* a figure is drawn to fit its column rather than to a width of its own, so the two stay one
     size and neither depends on the slide's padding */
  section.pair img {
    width: 100%;
    align-self: start;
  }
  /* the grid supplies the gaps, so the theme's own margins would double them */
  section.pair h1,
  section.pair h3,
  section.pair p {
    margin: 0;
  }
  /* the closing slide is the third hand-placed grid: what to install on the left, what to look at
     on the right. The section is the grid here too, so the link list, the code block, the QR, the
     screenshot and the capture are each given a cell. */
  section.final {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.3em 1.4em;
    align-content: start;
    /* two figures of one height stack to 576px in an evenly split column, and the title above them
       takes 80px more: 656px of the slide's 720. The vertical padding is what is left to divide,
       against the theme's own 70px; section.cited makes the same trade for one figure. */
    padding-block: 30px;
  }
  section.final h1 {
    grid-column: 1 / -1;
  }
  /* the left column reads straight down: the two links, the one command block, and a QR of the
     site at the foot of it. The right column's figures are taller than the three together, so the
     grid has slack to hand out; ending the QR against the bottom of its row spends that slack
     above the QR instead of between it and the block it follows. */
  /* Marp's auto-scaling measures a code block against the width of its container, so a block let
     to shrink to its own content is measured against itself and comes out a size smaller than
     every other block in the deck. This one fills its column, as they all do. */
  section.final ul {
    grid-area: 2 / 1;
    align-self: start;
    /* the theme's own list indent would push two links that are the point of the slide off the
       column's left edge */
    padding-inline-start: 1.1em;
  }
  section.final pre {
    grid-area: 3 / 1;
    align-self: start;
  }
  /* markdown-it's block-tag list has no video in it, so the capture is inline HTML and comes out
     inside a paragraph of its own - the same shape the two images already have. All three are
     therefore paragraphs, and each is placed by counting them. */
  section.final p:nth-of-type(1) {
    grid-area: 4 / 1;
    align-self: end;
  }
  section.final p:nth-of-type(2) {
    grid-area: 2 / 2 / 4 / 3;
  }
  section.final p:nth-of-type(3) {
    grid-area: 4 / 2 / 5 / 3;
  }
  /* the screenshot fills the column, and the capture is drawn to the width at which it comes out
     exactly as tall as the screenshot: the column's width times one file's aspect ratio over the
     other's. Written as a ratio of the two files' own pixel dimensions rather than as a number, it
     holds at whatever width the column happens to be. */
  section.final img {
    display: block;
    width: 100%;
  }
  /* the QR is the one figure here drawn to a width of its own, and it stands against the left edge
     of its column rather than centred in it, so the theme's auto margins are released. */
  section.final p:nth-of-type(1) img {
    margin-inline: 0;
  }
  section.final video {
    display: block;
    width: calc(100% * (630 / 1200) * (582 / 368));
    margin-inline: auto;
  }
  /* the grid supplies the gaps, so the theme's own margins would double them */
  section.final h1,
  section.final pre,
  section.final ul,
  section.final p {
    margin: 0;
  }
---

<!-- _class: lead -->

# Porting JTS Interior Point Algorithm to TypeScript and Rust/WASM

FOSS4G Hiroshima 2026, Japan - Lightning Talk

Ko Nagase

<!--
(~15s) Good afternoon. I'm Ko Nagase, and today I'd like to talk about Porting the JTS Interior Point Algorithm to TypeScript and Rust/WASM.
-->

---

<!-- _class: intro -->

![bg right:30% 90%](img/sanak.png)

# Who am I?

## Ko Nagase @ Geolonia Inc.

- Geospatial developer - geocoder, maps, vector tiles and **geometry**
- **sanak** on [![GitHub w:28](img/icon-github.svg)](https://github.com/sanak) [![OSGeo w:28](img/icon-osgeo.svg)](https://wiki.osgeo.org/wiki/User:Sanak), or **geosanak** on [![Bluesky w:28](img/icon-bluesky.svg)](https://bsky.app/profile/geosanak.bsky.social) [![X w:28](img/icon-x.svg)](https://x.com/geosanak)

<!--
(~11s) I'm a geospatial developer at Geolonia in Japan, and I use sanak or geosanak as account names.
-->

---

![bg right:50% 90%](img/centroid-vs-interior-point.svg)

# Why an interior point?

- A centroid can miss the shape
  - Concave shapes, holes, multi-part: the centroid lands outside
- The interior point is guaranteed to lie inside

<!--
(~28s) In Japan, open data often adds a representative point for each polygon, probably to reduce the geometry size, but the question is where to put it. A centroid is an average, so it can miss the shape, but the interior point, in blue, is guaranteed to be inside.
-->

---

# For browser use, the choices are limited

| Library                                                                      | How it ships             | Browser        | License          | JTS interior point?        |
| ---------------------------------------------------------------------------- | ------------------------ | -------------- | ---------------- | -------------------------- |
| [**jsts**](https://github.com/bjornharrtell/jsts) `getInteriorPoint`         | npm, JS port of JTS      | 340 KB JS      | EPL / EDL        | ✓ JTS 1.17-era port        |
| [**turf**](https://github.com/Turfjs/turf) `pointOnFeature`                  | npm, plain JS            | 11 KB JS       | MIT              | ✗ bbox center, else vertex |
| [**geo**](https://github.com/georust/geo) `interior_point`                   | Rust crate               | build yourself | MIT / Apache-2.0 | △ different algorithm      |
| [**geos-wasm**](https://github.com/chrispahm/geos-wasm) `GEOSPointOnSurface` | npm, GEOS via Emscripten | 2.6 MB wasm    | LGPL             | ✓ via the GEOS C++ port    |
| [**wasmts**](https://github.com/willcohen/wasmts) `InteriorPoint`            | npm, JTS via GraalVM     | 14 MB wasm     | EPL / EDL        | ✓ JTS 1.20, still alpha    |

<!--
(~39s) For native use, JTS itself or GEOS bindings are available, but for browser use, the choices are limited.
Compiling JTS or GEOS to WASM makes them heavy to download.
Porting it all makes it hard to maintain.
turf takes a bounding-box center, or a vertex on the boundary,
and the Rust geo crate uses a different algorithm.
-->

---

<!-- _class: cited -->

# Just port the algorithm!

- In 2016, JTS became EPL or **EDL**, a BSD-style license compatible with MIT
- Martin Davis ([@dr-jts](https://github.com/dr-jts)) improved interior point in 2019, which made it far easier to port
- And the LLM coding agent era started in 2026

![w:520](img/dr-jts-blog.png)
_[Lin.ear th.inking: Better and Faster Interior Point for Polygons in JTS/GEOS](https://lin-ear-th-inking.blogspot.com/2019/02/better-and-faster-interior-point-for.html)_

<!--
(~28s) So, I decided to just port the algorithm! Luckily, there are three good things. The license became MIT-compatible in 2016. JTS's author, Martin Davis, improved the algorithm in 2019. And LLM coding agents arrived this year.
-->

---

<!-- _footer: "Quoted from JTS's [`InteriorPointArea`](https://locationtech.github.io/jts/javadoc/org/locationtech/jts/algorithm/InteriorPointArea.html) Javadoc" -->

# The algorithm, in three steps

1. Determine a horizontal scan line on which the interior point will be located
2. Compute the sections of the scan line which lie in the interior of the polygon
3. Choose the widest interior section and take its midpoint as the interior point

![w:880](img/scan-line-steps.svg)

<!--
(~19s) The algorithm is three steps. Pick a horizontal line, keep the parts inside the polygon, take the midpoint of the widest one. The line is near the middle of the polygon, but never through a vertex.
-->

---

<!-- _class: compare -->

# Keeping a port honest

### Java `(upstream/jts/main/algorithm/InteriorPointArea.java)`

```java
private void findBestMidpoint(List<Double> crossings) {
  // ...
  crossings.sort(Double::compare);
  for (int i = 0; i < crossings.size(); i += 2) {
    double x1 = crossings.get(i);
    double x2 = crossings.get(i + 1);
    double width = x2 - x1;
    if ( width > interiorSectionWidth ) {
      interiorSectionWidth = width;
      double interiorPointX = avg(x1, x2);
      interiorPoint = new Coordinate(interiorPointX, interiorPointY);
    }
  }
}
```

### TypeScript `(js/src/algorithm/InteriorPointArea.ts)`

```typescript
private findBestMidpoint(crossings: number[]): void {
  // ...
  crossings.sort((a, b) => a - b);
  for (let i = 0; i < crossings.length; i += 2) {
    const x1 = crossings[i];
    const x2 = crossings[i + 1];
    const width = x2 - x1;
    if (width > this.interiorSectionWidth) {
      this.interiorSectionWidth = width;
      const interiorPointX = avg(x1, x2);
      this.interiorPoint = [interiorPointX, this.interiorPointY];
    }
  }
}
```

### Rust `(rs/core/src/algorithm/interior_point_area.rs)`

```rust
fn find_best_midpoint(&mut self, crossings: &mut [f64]) {
    // ...
    crossings.sort_by(|a, b| a.partial_cmp(b).unwrap());
    for pair in crossings.chunks_exact(2) {
        let x1 = pair[0];
        let x2 = pair[1];
        let width = x2 - x1;
        if width > self.interior_section_width {
            self.interior_section_width = width;
            let interior_point_x = avg(x1, x2);
            self.interior_point = Some(Coord {
                x: interior_point_x,
                y: self.interior_point_y,
            });
        }
    }
}
```

<!--
(~17s) When porting, I keep the TypeScript and Rust code as close to the original Java code as possible. JTS's own tests are ported as well, and run against both.
-->

---

# Command Line Interface (CLI)

### JTS ships its own command

<pre is="marp-pre" data-auto-scaling="downscale-only"><code class="language-sh"><span class="cmd">jtsop</span> -a buildings.geojson -eacha -f geojson -o out.geojson \
    Construction.interiorPoint
</code></pre>

### This port ships one too, from npm or from crates.io

<pre is="marp-pre" data-auto-scaling="downscale-only"><code class="language-sh">npm install -g interior-point
<span class="hljs-comment"># cargo install interior-point --features cli</span>

<span class="cmd">interior-point</span> -i buildings.geojson -o out.geojson
</code></pre>

<!--
(~13s) As for the CLI, JTS ships jtsop. This port ships interior-point, and it does the same job in a shorter form.
-->

---

<!-- _class: pair -->

# Additional functions

### `verifyInteriorPoint`

Reports where a point sits relative to the geometry it came from - four values rather than a boolean.

![The three values that place a point, and the fourth that cannot be placed](img/verify-interior-point.svg)

### `centroidFirstInteriorPoint`

Returns the centroid when it lies strictly inside, and falls back to the algorithm when it does not.

![The centroid is returned on a convex polygon and fallen back from on a concave one](img/centroid-first-interior-point.svg)

<!--
(~20s) I added two functions that are not in JTS. Verify says whether a point is interior, on-geometry, or off-geometry. Centroid-first returns the centroid, or falls back.
-->

---

<!-- _class: cited wide -->

# Benchmarks

- PLATEAU Hiroshima 2024 - 6769 building footprints, measurable in your browser
- interior-point TS ×2, Rust/WASM ×2, jsts, turf, geo, geos-wasm, wasmts
- Every result verified with `verifyInteriorPoint`

![The computed points drawn over central Hiroshima](img/benchmark-map.png)
![The results table: load and total milliseconds and the verification counts](img/benchmark-table.png)
_[sanak.github.io/interior-point/examples/benchmark/](https://sanak.github.io/interior-point/examples/benchmark/)_

![QR code for the benchmark page w:180](img/qr-benchmark.svg)

<!--
(~19s) There is a benchmark site with PLATEAU Hiroshima building footprints, and you can run it in your browser.
The TypeScript port is fast enough, and the WebAssembly rows pay a load cost first.
(Eight of the nine return all interior points. turf misses 87, putting its points on the geometry rather than in it.)
-->

---

<!-- _class: final -->

# Try it!

- Website: [sanak.github.io/interior-point](https://sanak.github.io/interior-point/)
- GitHub: [github.com/sanak/interior-point](https://github.com/sanak/interior-point)

```sh
npm install interior-point
cargo add interior-point
```

![QR code for the website w:200](img/qr-website.svg)

![The documentation site](img/og-image.png)

<video src="img/interior-point-foss4g-hiroshima.mov" autoplay loop muted playsinline controls></video>

<!--
(~20s) The website has the docs and the benchmarks, so you can try it!
The front page map has a text input and you can type English or Japanese and see the results as orange points.
Thank you!
-->
