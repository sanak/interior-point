/**
 * Ambient declarations for the asset imports the theme makes.
 *
 * These are Vite features rather than TypeScript ones, and the usual way to
 * reach them is `vite/client`. Vite is not a dependency of this package though —
 * VitePress owns it — so the two forms actually used are declared here instead
 * of adding a dependency for two lines of types.
 */

/** `import url from "./font.ttf?url"` — the emitted asset's URL. */
declare module "*?url" {
  const url: string;
  export default url;
}

/** `import "maplibre-gl/dist/maplibre-gl.css"` — imported for its side effect. */
declare module "*.css";
