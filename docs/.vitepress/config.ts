import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Interior Point",
  description: "JTS InteriorPoint algorithm ported to TypeScript and Rust",
  base: "/interior-point/",
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
      { text: "Getting Started", link: "/" },
      { text: "API Reference", link: "/api/" },
    ],
    sidebar: [
      {
        text: "Getting Started",
        link: "/",
        items: [
          { text: "Installation", link: "/#installation" },
          { text: "Usage", link: "/#usage" },
        ],
      },
      {
        text: "API Reference",
        link: "/api/",
        items: [
          { text: "TypeScript", link: "/api/#typescript" },
          { text: "Rust", link: "/api/#rust" },
        ],
      },
    ],
    socialLinks: [{ icon: "github", link: "https://github.com/sanak/interior-point" }],
  },
});
