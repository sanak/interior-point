// Marp escapes every raw HTML tag unless it is named here, and the allowlist is read from this
// file's top-level `html` key alone. The slides' code blocks are the reason it exists: a fenced
// block's content is text, so a command name cannot be marked up inside one. The closing slide's
// screen capture is the other: Markdown has an image syntax and no video one.
export default {
  html: {
    pre: ["is", "data-auto-scaling"],
    code: ["class"],
    span: ["class"],
    video: ["src", "autoplay", "loop", "muted", "playsinline", "controls"],
  },
};
