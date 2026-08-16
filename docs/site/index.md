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
  - title: A faithful port of JTS
    details: The algorithm is ported member for member into TypeScript and Rust, and the two are held to the same results, so a geometry gives the same point in either language.
  - title: The same command in both languages
    details: Each package ships an interior-point command that reads WKT or GeoJSON from a file, a literal or stdin, and the two are held to byte-for-byte agreement on what they write.
  - title: Two utilities beyond the port
    details: Alongside JTS's interiorPoint, the port offers verifyInteriorPoint, which checks a point against its geometry through an independent point-in-polygon locator, and centroidFirstInteriorPoint, which returns the centroid when it lies strictly inside.
---
