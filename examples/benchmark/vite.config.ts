import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, type Plugin } from "vite";

function copyWasmtsVendorPlugin(): Plugin {
  return {
    name: "copy-wasmts-vendor",
    buildStart() {
      const distDir = dirname(fileURLToPath(import.meta.resolve("@wcohen/wasmts")));
      const vendorDir = fileURLToPath(new URL("public/vendor/wasmts/", import.meta.url));
      mkdirSync(vendorDir, { recursive: true });
      for (const file of ["wasmts.js", "wasmts.js.wasm"]) {
        copyFileSync(join(distDir, file), join(vendorDir, file));
      }
    },
  };
}

export default defineConfig({
  base: "/interior-point/examples/benchmark/",
  plugins: [copyWasmtsVendorPlugin()],
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
