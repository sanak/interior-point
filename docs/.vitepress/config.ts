import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Interior Point",
  description: "JTS InteriorPoint algorithm ported to TypeScript and Rust",
  base: "/interior-point/",
  themeConfig: {
    nav: [
      { text: "Introduction", link: "/" },
      { text: "Getting Started", link: "/guide/getting-started" },
      { text: "API Reference", link: "/api/" },
    ],
    sidebar: [
      {
        text: "Introduction",
        link: "/",
      },
      {
        text: "Getting Started",
        link: "/guide/getting-started",
        items: [
          { text: "TypeScript", link: "/guide/getting-started#typescript" },
          { text: "Rust", link: "/guide/getting-started#rust" },
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
