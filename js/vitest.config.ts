import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*Test.ts"],
    passWithNoTests: true,
  },
});
