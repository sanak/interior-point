import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import { copyAssets, isExcluded, removeNonDeckPages } from "../slides-assets.mjs";

const roots = [];

/** Builds a throwaway deck tree: one deck with an image, a nested image, and a Markdown source. */
function makeSourceTree() {
  const root = mkdtempSync(join(tmpdir(), "slides-assets-"));
  roots.push(root);
  const source = join(root, "slides");
  mkdirSync(join(source, "event", "img"), { recursive: true });
  writeFileSync(join(source, "event", "index.md"), "# deck\n");
  writeFileSync(join(source, "event", "img", "figure.svg"), "<svg/>");
  writeFileSync(join(source, "event", "notes.txt"), "note");
  writeFileSync(join(source, "event", ".DS_Store"), "junk");
  return { root, source, output: join(root, "out") };
}

after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

describe("removeNonDeckPages", () => {
  /** Builds what Marp leaves behind: one deck page, and one page from Markdown that is not a deck. */
  function makeOutputTree() {
    const root = mkdtempSync(join(tmpdir(), "slides-pages-"));
    roots.push(root);
    const output = join(root, "dist");
    mkdirSync(join(output, "event"), { recursive: true });
    writeFileSync(join(output, "event", "index.html"), "<deck/>");
    writeFileSync(join(output, "CLAUDE.html"), "<guidance/>");
    return output;
  }

  it("removes a page Marp emitted outside a deck directory", () => {
    const output = makeOutputTree();
    assert.equal(removeNonDeckPages({ outputDir: output }), 1);
    assert.deepEqual(readdirSync(output), ["event"]);
  });

  it("keeps the deck pages one directory down", () => {
    const output = makeOutputTree();
    removeNonDeckPages({ outputDir: output });
    assert.deepEqual(readdirSync(join(output, "event")), ["index.html"]);
  });

  it("leaves a top-level file that is not a page", () => {
    const output = makeOutputTree();
    writeFileSync(join(output, ".nojekyll"), "");
    removeNonDeckPages({ outputDir: output });
    assert.deepEqual(readdirSync(output).sort(), [".nojekyll", "event"]);
  });

  it("is a no-op when the output directory is absent", () => {
    const output = makeOutputTree();
    assert.equal(removeNonDeckPages({ outputDir: join(output, "absent") }), 0);
  });
});

describe("isExcluded", () => {
  it("excludes Markdown, which Marp has already converted", () => {
    assert.equal(isExcluded("index.md"), true);
    assert.equal(isExcluded("INDEX.MD"), true);
  });

  it("excludes dot-prefixed entries", () => {
    assert.equal(isExcluded(".DS_Store"), true);
    assert.equal(isExcluded(".git"), true);
  });

  it("keeps everything else", () => {
    assert.equal(isExcluded("figure.svg"), false);
    assert.equal(isExcluded("shot.png"), false);
  });
});

describe("copyAssets", () => {
  it("mirrors non-Markdown files at the same relative path", () => {
    const { source, output } = makeSourceTree();
    copyAssets({ sourceDir: source, outputDir: output });
    assert.deepEqual(readdirSync(join(output, "event", "img")), ["figure.svg"]);
    assert.deepEqual(readdirSync(join(output, "event")).sort(), ["img", "notes.txt"]);
  });

  it("leaves the Markdown behind", () => {
    const { source, output } = makeSourceTree();
    copyAssets({ sourceDir: source, outputDir: output });
    assert.equal(readdirSync(join(output, "event")).includes("index.md"), false);
  });

  it("is a no-op when there are no decks", () => {
    const { root, output } = makeSourceTree();
    assert.equal(copyAssets({ sourceDir: join(root, "absent"), outputDir: output }), 0);
  });

  it("writes into an output directory nested inside the source", () => {
    const { source } = makeSourceTree();
    const nested = join(source, "dist");
    assert.equal(copyAssets({ sourceDir: source, outputDir: nested }), 2);
    assert.deepEqual(readdirSync(join(nested, "event", "img")), ["figure.svg"]);
  });

  it("does not copy the output tree into itself on a second run", () => {
    const { source } = makeSourceTree();
    const nested = join(source, "dist");
    copyAssets({ sourceDir: source, outputDir: nested });
    assert.equal(copyAssets({ sourceDir: source, outputDir: nested }), 2);
    assert.equal(readdirSync(nested).includes("dist"), false);
  });
});
