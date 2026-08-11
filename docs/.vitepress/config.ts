import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Interior Point",
  description: "JTS InteriorPoint algorithm ported to TypeScript and Rust",
  base: "/interior-point/",
  srcDir: "./site",
  head: [
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:title", content: "Interior Point" }],
    [
      "meta",
      {
        property: "og:description",
        content: "JTS InteriorPoint algorithm ported to TypeScript and Rust",
      },
    ],
    [
      "meta",
      {
        property: "og:image",
        content: "https://sanak.github.io/interior-point/og-image.png",
      },
    ],
    [
      "meta",
      {
        property: "og:url",
        content: "https://sanak.github.io/interior-point/",
      },
    ],
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
    ["meta", { name: "twitter:title", content: "Interior Point" }],
    [
      "meta",
      {
        name: "twitter:description",
        content: "JTS InteriorPoint algorithm ported to TypeScript and Rust",
      },
    ],
    [
      "meta",
      {
        name: "twitter:image",
        content: "https://sanak.github.io/interior-point/og-image.png",
      },
    ],
  ],
  themeConfig: {
    nav: [
      { text: "Getting Started", link: "/guide" },
      { text: "CLI", link: "/cli" },
      { text: "Benchmark", link: "https://sanak.github.io/interior-point/examples/benchmark/" },
      {
        text: "API Reference",
        items: [
          { text: "TypeScript", link: "/api/typescript" },
          { text: "Rust", link: "/api/rust" },
        ],
      },
      {
        text: "Links",
        items: [
          { text: "npm", link: "https://www.npmjs.com/package/interior-point" },
          { text: "crates.io", link: "https://crates.io/crates/interior-point" },
          { text: "docs.rs", link: "https://docs.rs/interior-point" },
          { text: "CHANGELOG (TypeScript)", link: "https://github.com/sanak/interior-point/blob/main/js/CHANGELOG.md" },
          { text: "CHANGELOG (Rust)", link: "https://github.com/sanak/interior-point/blob/main/rs/CHANGELOG.md" },
        ],
      },
    ],
    sidebar: [
      { text: "Getting Started", link: "/guide" },
      { text: "CLI", link: "/cli" },
      {
        text: "API Reference",
        items: [
          { text: "TypeScript", link: "/api/typescript" },
          { text: "Rust", link: "/api/rust" },
        ],
      },
    ],
    search: { provider: "local" },
    socialLinks: [{ icon: "github", link: "https://github.com/sanak/interior-point" }],
  },
});
