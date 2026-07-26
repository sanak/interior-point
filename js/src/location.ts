/**
 * Constants representing the different topological locations which can occur in
 * a geometry. JTS also uses them as DE-9IM row and column indices; the ported
 * subset needs only the three below.
 *
 * `NONE` and `toLocationSymbol` are not ported — nothing in the
 * point-in-polygon stack reaches either.
 *
 * @jts Location
 */

/**
 * The location value for the interior of a geometry.
 * @jts Location#INTERIOR
 */
export const INTERIOR = 0;

/**
 * The location value for the boundary of a geometry.
 * @jts Location#BOUNDARY
 */
export const BOUNDARY = 1;

/**
 * The location value for the exterior of a geometry.
 * @jts Location#EXTERIOR
 */
export const EXTERIOR = 2;
