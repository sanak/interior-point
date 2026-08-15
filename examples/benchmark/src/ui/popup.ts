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

/** The clicked input feature's attributes, as a two-column table. */
export function attributePopupHtml(properties: Readonly<Record<string, unknown>> | null): string {
  const rows = Object.entries(properties ?? {}).filter(([, value]) => !isEmpty(value));
  if (rows.length === 0) return '<p class="popup-empty">No attributes</p>';
  const cells = rows
    .map(([key, value]) => `<tr><th>${escapeHtml(key)}</th><td>${escapeHtml(String(value))}</td></tr>`)
    .join("");
  return `<table class="popup-attributes">${cells}</table>`;
}

/**
 * One computed interior point. The caller passes the value straight out of `RunResult.points`
 * rather than the clicked feature's geometry: MapLibre quantises a GeoJSON source's coordinates
 * when it tiles it, so the drawn point is not the exact number the library returned.
 */
export function pointPopupHtml(label: string, position: Position): string {
  const ordinates = position.map((value) => String(value)).join(", ");
  return `<p class="popup-point"><strong>${escapeHtml(label)}</strong><br><code>${escapeHtml(ordinates)}</code></p>`;
}
