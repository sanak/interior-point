// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/pkg/**",
      "**/node_modules/**",
      "**/target/**",
      "docs/.vitepress/cache/**",
      "tmp/**",
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
            "js/vitest.config.ts",
            "js/vite.config.ts",
            "docs/.vitepress/config.ts",
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
);
