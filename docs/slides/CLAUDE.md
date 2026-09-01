# CLAUDE.md

Guidance for the Marp decks under this directory. The build itself - `pnpm slides:build`, where a
deck's files are published, and which workflow puts them there - is in the root `CLAUDE.md`'s
Slides section.

## Raw HTML in a deck

`marp.config.mjs` at the repository root is read by the same `marp` command, and its one key is the
raw-HTML allowlist: a tag not named there is escaped into visible text instead. The allowlist has
to be the top-level `html` key - nesting it under `options` is ignored silently, and the output is
then byte-identical to leaving the file out. A new root `.mjs` also has to be added to
`eslint.config.mjs`'s `allowDefaultProject`, or `pnpm lint` fails to parse it.

Reach for raw HTML only where Markdown cannot express the markup. So far that is one case: a code
block wanting a word emphasised inside it. A fence's content is text, so neither `**bold**` nor a
tag survives it, and the only hook a fence leaves for CSS is what highlight.js marks up - which in
a shell block is comments and strings and nothing else, so a command name is a plain text node.
Such a block is written as `<pre is="marp-pre" data-auto-scaling="downscale-only">`, carrying the
attributes Marp puts on the blocks it generates, so that a hand-written one still shrinks to fit
its slide.

## Fitting a code block on a slide

Marp downscales a block until it fits its container, so a block's rendered type size is its
container's width over the length of its own longest line. Two blocks on one slide therefore come
out at one size only if their longest lines are about as long, and breaking a long command across a
continuation line is what buys that as much as it buys the margin at the right edge.
