import type { Adapter, RunResult } from "../types.ts";
import { ADAPTER_COLORS } from "../adapters/index.ts";

const EMPTY = "—";

const HEADERS = [
  "Library",
  "Call",
  "Load (ms)",
  "Total (ms)",
  "pts per s",
  "interior",
  "on-geometry",
  "off-geometry",
  "unverifiable",
  "errors",
  "show",
  "Run",
] as const;

export interface TableCallbacks {
  onRun(id: string): void;
  onToggleLayer(id: string, visible: boolean): void;
}

export interface TableHandle {
  setRunning(id: string): void;
  setResult(id: string, result: RunResult): void;
  setError(id: string, message: string): void;
  reset(): void;
}

export function formatMs(ms: number): string {
  return ms.toFixed(1);
}

export function formatPointsPerSecond(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

interface Row {
  readonly element: HTMLTableRowElement;
  readonly resultCells: readonly HTMLTableCellElement[];
  readonly checkbox: HTMLInputElement;
  readonly runButton: HTMLButtonElement;
  readonly errorRow: HTMLTableRowElement;
  readonly errorCell: HTMLTableCellElement;
}

export function renderTable(
  container: HTMLElement,
  adapters: readonly Adapter[],
  callbacks: TableCallbacks,
): TableHandle {
  const doc = container.ownerDocument;
  const table = doc.createElement("table");
  table.className = "results-table";

  const thead = doc.createElement("thead");
  const headRow = doc.createElement("tr");
  for (const header of HEADERS) {
    const th = doc.createElement("th");
    th.textContent = header;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = doc.createElement("tbody");
  const rows = new Map<string, Row>();

  for (const adapter of adapters) {
    const tr = doc.createElement("tr");
    tr.className = "result-row";
    tr.setAttribute("data-adapter-id", adapter.id);

    // The swatch is the legend: it ties the row to its map layer color.
    const libraryCell = doc.createElement("td");
    const swatch = doc.createElement("span");
    swatch.className = "swatch";
    swatch.style.backgroundColor = ADAPTER_COLORS[adapter.id] ?? "transparent";
    libraryCell.appendChild(swatch);
    libraryCell.appendChild(doc.createTextNode(adapter.label));
    tr.appendChild(libraryCell);

    const callCell = doc.createElement("td");
    callCell.textContent = adapter.call;
    tr.appendChild(callCell);

    const resultCells: HTMLTableCellElement[] = [];
    for (let index = 0; index < 8; index += 1) {
      const td = doc.createElement("td");
      td.className = "num";
      td.textContent = EMPTY;
      resultCells.push(td);
      tr.appendChild(td);
    }

    const showCell = doc.createElement("td");
    const checkbox = doc.createElement("input");
    checkbox.type = "checkbox";
    checkbox.disabled = true;
    checkbox.addEventListener("change", () => callbacks.onToggleLayer(adapter.id, checkbox.checked));
    showCell.appendChild(checkbox);
    tr.appendChild(showCell);

    const runCell = doc.createElement("td");
    const runButton = doc.createElement("button");
    runButton.type = "button";
    runButton.className = "run";
    runButton.textContent = "Run";
    runButton.addEventListener("click", () => callbacks.onRun(adapter.id));
    runCell.appendChild(runButton);
    tr.appendChild(runCell);

    const errorRow = doc.createElement("tr");
    errorRow.className = "error-row";
    errorRow.hidden = true;
    const errorCell = doc.createElement("td");
    errorCell.colSpan = HEADERS.length;
    errorRow.appendChild(errorCell);

    tbody.appendChild(tr);
    tbody.appendChild(errorRow);
    rows.set(adapter.id, { element: tr, resultCells, checkbox, runButton, errorRow, errorCell });
  }

  table.appendChild(tbody);
  container.appendChild(table);

  const rowFor = (id: string): Row => {
    const row = rows.get(id);
    if (!row) {
      throw new Error(`Unknown adapter id: ${id}`);
    }
    return row;
  };

  return {
    setRunning(id: string): void {
      const row = rowFor(id);
      row.element.classList.add("is-running");
      row.runButton.disabled = true;
      row.errorRow.hidden = true;
    },
    setResult(id: string, result: RunResult): void {
      const row = rowFor(id);
      const verification = result.verification;
      const values = [
        result.loadMs === null ? EMPTY : formatMs(result.loadMs),
        formatMs(result.totalMs),
        formatPointsPerSecond(result.pointsPerSecond),
        String(verification.interior),
        String(verification["on-geometry"]),
        String(verification["off-geometry"]),
        String(verification.unverifiable),
        String(result.errors),
      ];
      row.resultCells.forEach((cell, index) => {
        cell.textContent = values[index] ?? EMPTY;
      });
      row.element.classList.remove("is-running");
      row.runButton.disabled = false;
      row.errorRow.hidden = true;
      // Programmatic `checked` fires no change event, so this never reaches onToggleLayer.
      row.checkbox.disabled = false;
      row.checkbox.checked = true;
    },
    setError(id: string, message: string): void {
      const row = rowFor(id);
      row.element.classList.remove("is-running");
      row.runButton.disabled = false;
      row.errorCell.textContent = message;
      row.errorRow.hidden = false;
    },
    reset(): void {
      for (const row of rows.values()) {
        row.element.classList.remove("is-running");
        row.runButton.disabled = false;
        for (const cell of row.resultCells) {
          cell.textContent = EMPTY;
        }
        row.checkbox.checked = false;
        row.checkbox.disabled = true;
        row.errorRow.hidden = true;
        row.errorCell.textContent = "";
      }
    },
  };
}
