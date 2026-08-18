import fontUrl from "../../fonts/Inter-Bold.ttf?url";
import { EM, type Glyph, type GlyphCommand, type GlyphSource } from "./textGeometry.ts";

/**
 * Route A — outlines are read out of a real font in the browser.
 *
 * opentype.js parses the file and hands back the same M/L/Q/C/Z commands the
 * geometry module consumes, so any character the font carries can be typed. The
 * cost is what has to arrive first: the parser plus the whole font, since
 * subsetting it would take away the coverage that is the point of doing this at
 * runtime.
 *
 * The import is dynamic and the fetch is lazy for two reasons: VitePress
 * pre-renders every page on the server, where neither belongs, and the hero
 * should not pay for either until someone types.
 */

let pending: Promise<GlyphSource> | null = null;

export function loadGlyphSource(): Promise<GlyphSource> {
  pending ??= (async () => {
    const [opentype, response] = await Promise.all([import("opentype.js"), fetch(fontUrl)]);
    const font = opentype.parse(await response.arrayBuffer());

    const cache = new Map<string, Glyph | null>();
    return {
      glyph(char: string): Glyph | null {
        if (!cache.has(char)) {
          const glyph = font.charToGlyph(char);
          // Index 0 is the font's stand-in for a character it has no outline for,
          // and drawing its box would be a worse answer than drawing nothing.
          const missing = glyph === undefined || glyph.index === 0;
          cache.set(
            char,
            missing
              ? null
              : {
                  advance: (glyph.advanceWidth / font.unitsPerEm) * EM,
                  commands: glyph.getPath(0, 0, EM).commands as GlyphCommand[],
                },
          );
        }
        return cache.get(char) ?? null;
      },
    };
  })();
  return pending;
}

/** Shown next to the map so the two routes can be told apart at a glance. */
export const ROUTE_LABEL = "A: opentype.js in the browser";
