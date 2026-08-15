/**
 * Popup bodies for the map, built as HTML strings so they can be tested without a DOM.
 * Each one is built when a feature is clicked, never ahead of time: a dataset carries
 * thousands of features and only one popup is ever open.
 */
import type { Position } from "geojson";

/** Values that say nothing. Shown as blank rows they would bury the ones that matter. */
function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

/** Attribute names and values come from a dropped file, so nothing reaches the DOM unescaped. */
function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * The attributes worth showing, as a two-column table, or "" when there are none. Both popups
 * build the same table: the one on a result point describes the very feature the point was
 * computed from, so the two should not read differently.
 */
function attributeTableHtml(properties: Readonly<Record<string, unknown>> | null | undefined): string {
  const rows = Object.entries(properties ?? {}).filter(([, value]) => !isEmpty(value));
  if (rows.length === 0) return "";
  const cells = rows
    .map(([key, value]) => `<tr><th>${escapeHtml(key)}</th><td>${escapeHtml(String(value))}</td></tr>`)
    .join("");
  return `<table class="popup-attributes">${cells}</table>`;
}

/** The clicked input feature's attributes, as a two-column table. */
export function attributePopupHtml(properties: Readonly<Record<string, unknown>> | null): string {
  return attributeTableHtml(properties) || '<p class="popup-empty">No attributes</p>';
}

/**
 * A GeoJSON position is longitude, latitude and elevation, in that order (RFC 7946 §3.1.1).
 * Lower case, because these sit in the same column as the input feature's own attribute names
 * and those are lower case throughout the shipped PLATEAU dataset.
 */
const ORDINATE_LABELS = ["longitude", "latitude", "elevation"];

/**
 * One computed interior point: the adapter that produced it, the attributes of the feature it
 * was computed from, then one row per ordinate. The caller passes the coordinate straight out of
 * `RunResult.points` rather than the clicked feature's geometry, because MapLibre quantises a
 * GeoJSON source's coordinates when it tiles it, so the drawn point is not the exact number the
 * library returned. Each ordinate gets its own row rather than a comma-separated line: at full
 * double precision the pair is too long to read as one string.
 */
export function pointPopupHtml(
  label: string,
  position: Position,
  properties?: Readonly<Record<string, unknown>> | null,
): string {
  const ordinates = position
    .map((value, index) => {
      const name = ORDINATE_LABELS[index] ?? `[${index}]`;
      return `<tr><th>${name}</th><td><code>${escapeHtml(String(value))}</code></td></tr>`;
    })
    .join("");
  return [
    `<p class="popup-point"><strong>${escapeHtml(label)}</strong></p>`,
    attributeTableHtml(properties),
    `<table class="popup-coordinates">${ordinates}</table>`,
  ].join("");
}
