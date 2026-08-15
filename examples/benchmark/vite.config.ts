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

function gracefulShutdownPlugin(): Plugin {
  return {
    name: "graceful-shutdown",
    configureServer() {
      // Ctrl+C signals the whole foreground process group, so vite dies from SIGINT
      // rather than exiting. pnpm turns a child killed by a signal into a failed
      // script and re-raises the signal on itself, so `pnpm examples:dev` reports
      // ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL and ELIFECYCLE, one per pnpm layer, on
      // every ordinary shutdown. There is no pnpm flag for this; exiting 0 is what
      // keeps it quiet. Dev only — `vite build` never calls configureServer.
      process.once("SIGINT", () => process.exit(0));
    },
  };
}

export default defineConfig({
  base: "/interior-point/examples/benchmark/",
  plugins: [copyWasmtsVendorPlugin(), gracefulShutdownPlugin()],
  resolve: {
    alias: {
      "interior-point-wasm": fileURLToPath(new URL("../../rs/wasm/pkg-web/interior_point_wasm.js", import.meta.url)),
      "geo-wasm": fileURLToPath(new URL("./geo-wasm/pkg-web/geo_wasm.js", import.meta.url)),
    },
  },
  build: {
    target: "es2022",
    rollupOptions: {
      output: {
        // maplibre-gl bootstraps its worker by stringifying its own module-factory
        // functions (Function.prototype.toString()) into a Blob. Left in the default
        // chunk, Rolldown's cross-module renaming touches identifiers inside those
        // functions without updating the stringified copy, so the worker throws
        // "<name> is not defined" on every GeoJSON source. Its own chunk keeps its
        // scope untouched by the rest of the bundle.
        manualChunks(id: string) {
          if (id.includes("maplibre-gl")) return "maplibre-gl";
        },
      },
    },
  },
});
