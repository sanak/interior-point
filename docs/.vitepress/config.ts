import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Interior Point",
  description: "JTS InteriorPoint algorithm ported to TypeScript and Rust",
  base: "/interior-point/",
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
