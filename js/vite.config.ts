import { defineConfig } from "vitest/config";

const extensions: Record<string, string> = {
  es: "mjs",
  cjs: "cjs",
};

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    sourcemap: true,
    lib: {
      entry: "./src/index.ts",
      name: "interiorPoint",
      fileName: (format: string) => `interior-point.${extensions[format]}`,
      formats: ["es", "cjs"],
    },
  },
});
