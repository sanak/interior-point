---
layout: home

hero:
  name: Interior Point
  text: A point guaranteed to lie inside a geometry
  tagline: JTS InteriorPoint algorithm ported to TypeScript and Rust
  actions:
    - theme: brand
      text: Get Started
      link: /guide
    - theme: alt
      text: View on GitHub
      link: https://github.com/sanak/interior-point

features:
  - title: Always lands inside the shape
    details: A polygon's centroid can fall outside the polygon entirely, as it does for a C-shaped one. The point returned here is inside the geometry whatever its shape.
  - title: Take the centroid, then check the result
    details: A second entry point returns the centroid whenever it lies strictly inside, falling back to the algorithm only when it does not. A third checks a computed point against its geometry, through a point-in-polygon locator sharing no code with what produced it.
  - title: A faithful port of JTS
    details: Every ported member carries an anchor back to the JTS source it came from, and a scheduled job checks those anchors against upstream for drift.
---
