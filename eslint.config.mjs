// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/pkg/**",
      "**/pkg-node/**",
      "**/node_modules/**",
      "**/target/**",
      "**/pkg-web/**",
      "examples/benchmark/public/vendor/**",
      "docs/.vitepress/cache/**",
      "tmp/**",
      // Written by test-wasm.yml, and by anyone running its commands locally.
      "rs/wasm/smoke.cjs",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    // Rest-destructuring a known key off an object just to drop it from the rest
    // (e.g. splitting a GeoParquet row into its geometry column and its properties)
    // is intentional, not dead code.
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { ignoreRestSiblings: true }],
    },
  },
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            "eslint.config.mjs",
            "js/vite.config.ts",
            "docs/.vitepress/config.ts",
            "docs/.vitepress/theme/index.ts",
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Plain untyped ES modules. No type-aware rule is enabled anywhere in this config, so the
    // TypeScript project lookup would be pure cost — and `allowDefaultProject` caps out at 8 files.
    files: ["scripts/**/*.mjs", "examples/cli-benchmark/**/*.mjs"],
    languageOptions: {
      parserOptions: { projectService: false, project: false },
      globals: {
        Buffer: "readonly",
        Response: "readonly",
        URL: "readonly",
        clearTimeout: "readonly",
        console: "readonly",
        fetch: "readonly",
        process: "readonly",
        setTimeout: "readonly",
      },
    },
  },
  {
    // wasm-bindgen JS snippets (`#[wasm_bindgen(module = "/js/...")]`) and their hand-written
    // `.d.ts` declarations: outside any tsconfig project, same reasoning as scripts/**/*.mjs
    // above. Consumers still get full type checking wherever they import the `.d.ts`.
    files: ["rs/wasm/js/**/*.js", "rs/wasm/js/**/*.d.ts"],
    languageOptions: {
      parserOptions: { projectService: false, project: false },
    },
  },
  {
    // Ported code mirrors the Java statement structure, including declarations JTS
    // initializes before an if/else chain that always assigns. Preserving that shape
    // is what keeps a file diffable against `upstream/jts/main/`.
    files: ["js/src/**/*.ts"],
    rules: {
      "no-useless-assignment": "off",
    },
  },
  {
    // `Coordinate` and `Position` are the same structural type, so `tsc` cannot
    // detect a module that keeps importing `Position`. This rule is the only
    // enforcement of the unchanged-name rule.
    files: ["js/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "geojson",
              importNames: ["Position"],
              message: "Use Coordinate from GeometryAdapter (JTS name).",
            },
          ],
        },
      ],
    },
  },
);
