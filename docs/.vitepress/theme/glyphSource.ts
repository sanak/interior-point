import japaneseFontUrl from "../../fonts/MPLUS1p-Bold.ttf?url";
import latinFontUrl from "../../fonts/Inter-Bold.ttf?url";
import { EM, type Glyph, type GlyphCommand, type GlyphSource } from "./textGeometry.ts";

/**
 * Route A — outlines are read out of real fonts in the browser.
 *
 * opentype.js parses a font and hands back the same M/L/Q/C/Z commands the
 * geometry module consumes, so any character a loaded font carries can be typed.
 * The cost is what has to arrive first: the parser plus the whole font, since
 * subsetting it would take away the coverage that is the point of doing this at
 * runtime.
 *
 * Two fonts, loaded in two stages. Inter matches the site's own typeface and is
 * what the hero draws with; a Japanese face is four times its size, so it is not
 * fetched until a character turns up that Inter cannot draw. `prepare` is where
 * that second stage happens, which is why the interface has it: `glyph` stays
 * synchronous and the geometry module never awaits anything.
 *
 * The imports are dynamic and the fetches lazy for two reasons: VitePress
 * pre-renders every page on the server, where neither belongs, and the hero
 * should not pay for either until someone types.
 */

type Opentype = typeof import("opentype.js");
type ParsedFont = ReturnType<Opentype["parse"]>;

let opentypePromise: Promise<Opentype> | null = null;
const loadOpentype = () => (opentypePromise ??= import("opentype.js"));

async function loadFont(url: string): Promise<ParsedFont> {
  const [opentype, response] = await Promise.all([loadOpentype(), fetch(url)]);
  // Glyph outlines are decoded on first use rather than up front. It buys little
  // on a Latin font and a great deal on a Japanese one, which carries thousands.
  return opentype.parse(await response.arrayBuffer(), { lowMemory: true });
}

/** The outline of one character out of one font, or null if the font has none. */
function glyphFrom(font: ParsedFont, char: string): Glyph | null {
  const glyph = font.charToGlyph(char);
  // Index 0 is the font's stand-in for a character it has no outline for, and
  // drawing its box would be a worse answer than drawing nothing.
  if (glyph === undefined || glyph.index === 0) return null;
  return {
    advance: (glyph.advanceWidth / font.unitsPerEm) * EM,
    commands: glyph.getPath(0, 0, EM).commands as GlyphCommand[],
  };
}

let pending: Promise<GlyphSource> | null = null;

export function loadGlyphSource(): Promise<GlyphSource> {
  pending ??= (async () => {
    const latin = await loadFont(latinFontUrl);
    let japanese: ParsedFont | null = null;
    let japanesePending: Promise<ParsedFont> | null = null;

    const cache = new Map<string, Glyph | null>();

    const resolve = (char: string): Glyph | null =>
      glyphFrom(latin, char) ?? (japanese ? glyphFrom(japanese, char) : null);

    return {
      async prepare(text: string): Promise<void> {
        if (japanese) return;
        // Whitespace has no outline in any font, so it must not pull in a second one.
        const needsMore = Array.from(text).some((char) => !/\s/.test(char) && glyphFrom(latin, char) === null);
        if (!needsMore) return;
        japanesePending ??= loadFont(japaneseFontUrl);
        japanese = await japanesePending;
        // Anything already answered was answered without this font in hand.
        cache.clear();
      },

      glyph(char: string): Glyph | null {
        if (!cache.has(char)) cache.set(char, resolve(char));
        return cache.get(char) ?? null;
      },
    };
  })();
  return pending;
}
