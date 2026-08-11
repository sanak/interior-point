import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

export default defineConfig({
  base: "/interior-point/examples/benchmark/",
  resolve: {
    alias: {
      "interior-point-wasm": fileURLToPath(new URL("../../rs/wasm/pkg-web/interior_point_wasm.js", import.meta.url)),
      "geo-wasm": fileURLToPath(new URL("./geo-wasm/pkg-web/geo_wasm.js", import.meta.url)),
    },
  },
  build: {
    target: "es2022",
  },
});
