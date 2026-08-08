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
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      parserOptions: { projectService: false, project: false },
      globals: {
        Buffer: "readonly",
        Response: "readonly",
        URL: "readonly",
        console: "readonly",
        fetch: "readonly",
        process: "readonly",
      },
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
