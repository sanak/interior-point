#!/usr/bin/env node
/**
 * Finishes the Marp build output: drops the pages that are not decks, then copies the files a
 * deck references.
 *
 * `marp -I docs/slides -o docs/slides/dist` converts Markdown and nothing else, so a deck that
 * references `img/scan-line-steps.svg` builds to HTML pointing at a file the output tree does not
 * contain. Mirroring the source tree's other files into `dist/` at the same relative path is what
 * makes one reference work from both places: `docs/slides/<event>/img/x.svg` is reachable as
 * `img/x.svg` from `docs/slides/<event>/index.md` and from `docs/slides/dist/<event>/index.html`
 * alike.
 *
 * The walk is written out rather than left to `fs.cpSync`, which rejects a destination nested
 * inside its source before consulting a filter — and the destination here is `docs/slides/dist`,
 * inside `docs/slides`. Markdown is skipped because Marp already emitted its HTML counterpart,
 * dot-prefixed entries are skipped because a published tree has no use for `.DS_Store`, and the
 * output directory is skipped so a second run does not copy the output back into itself.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SOURCE_DIR = join(REPO_ROOT, "docs", "slides");
const OUTPUT_DIR = join(SOURCE_DIR, "dist");

/**
 * Deletes the pages Marp emitted for Markdown that is not a deck.
 *
 * A deck is `docs/slides/<event>/index.md`, so every page worth publishing sits one directory
 * down. Markdown directly under `docs/slides/` is guidance for this repository rather than
 * projected material — `CLAUDE.md` is the one such file today — and `marp -I` converts every
 * Markdown it finds, which would put an internal document on the public site at
 * `/slides/CLAUDE.html`. Marp writes nothing else at the top level of its output, so removing
 * the HTML there is the whole of it, and it runs before the mirroring below so that a stray
 * page cannot outlive the run that produced it.
 */
export function removeNonDeckPages({ outputDir = OUTPUT_DIR } = {}) {
  if (!existsSync(outputDir)) return 0;
  let removed = 0;
  for (const entry of readdirSync(outputDir, { withFileTypes: true })) {
    if (entry.isDirectory() || !entry.name.toLowerCase().endsWith(".html")) continue;
    rmSync(join(outputDir, entry.name));
    removed += 1;
  }
  return removed;
}

/** True for an entry the published tree has no use for. Applied to files and directories alike. */
export function isExcluded(name) {
  return name.startsWith(".") || name.toLowerCase().endsWith(".md");
}

export function copyAssets({ sourceDir = SOURCE_DIR, outputDir = OUTPUT_DIR } = {}) {
  if (!existsSync(sourceDir)) return 0;
  let copied = 0;
  const walk = (from, to) => {
    for (const entry of readdirSync(from, { withFileTypes: true })) {
      if (isExcluded(entry.name)) continue;
      const source = join(from, entry.name);
      if (source === outputDir) continue;
      const destination = join(to, entry.name);
      if (entry.isDirectory()) {
        walk(source, destination);
      } else {
        mkdirSync(dirname(destination), { recursive: true });
        copyFileSync(source, destination);
        copied += 1;
      }
    }
  };
  walk(sourceDir, outputDir);
  return copied;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const removed = removeNonDeckPages();
  const files = copyAssets();
  const pages = removed === 1 ? "page" : "pages";
  console.log(
    `slides-assets: removed ${removed} non-deck ${pages}, mirrored ${files} files into ${relative(REPO_ROOT, OUTPUT_DIR)}`,
  );
}
