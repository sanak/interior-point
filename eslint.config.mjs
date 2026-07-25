// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/pkg/**", "**/node_modules/**", "**/target/**", "docs/.vitepress/cache/**", "tmp/**"],
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
            "js/vitest.config.ts",
            "js/vite.config.ts",
            "docs/.vitepress/config.ts",
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
    // `Coordinate` and `Position` are the same structural type, so `tsc` cannot
    // detect a module that keeps importing `Position`. This rule is the only
    // enforcement of the unchanged-name rule.
    files: ["js/src/**/*.ts"],
    // The three algorithm modules still name `Position`. The InteriorPoint retrofit
    // rewrites them onto the adapter and removes this exception; until then they
    // stay byte-identical to `main` so that retrofit's diff is reviewable.
    ignores: ["js/src/interiorPointArea.ts", "js/src/interiorPointLine.ts", "js/src/interiorPointPoint.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "geojson",
              importNames: ["Position"],
              message: "Use Coordinate from ./geometryAdapter (JTS name).",
            },
          ],
        },
      ],
    },
  },
);
