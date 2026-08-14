import type { Adapter, RunResult } from "../types.ts";
import { ADAPTER_COLORS } from "../adapters/index.ts";

const EMPTY = "—";

/** The Load column's place in a row's result cells; every later cell is re-measured each run. */
const LOAD_CELL = 0;

const HEADERS = [
  "Library",
  "Call",
  "show",
  "Run",
  "Load (ms)",
  "Total (ms)",
  "pts per s",
  "interior",
  "on-geo\nmetry",
  "off-geo\nmetry",
  "unveri\nfiable",
  "errors",
] as const;

// The three verification headers wrap onto two lines, split near their
// midpoint rather than at "on-"/"off-", so neither line dictates a wide
// column on its own.
const WRAPPED_HEADERS = new Set(["on-geo\nmetry", "off-geo\nmetry", "unveri\nfiable"]);

export interface TableCallbacks {
  onRun(id: string): void;
  onToggleLayer(id: string, visible: boolean): void;
}

export interface TableHandle {
  setRunning(id: string): void;
  setResult(id: string, result: RunResult): void;
  setError(id: string, message: string): void;
  /** Holds every Run button down for the length of a Run all, then releases them. */
  setBusy(busy: boolean): void;
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

  const tbody = doc.createElement("tbody");
  const rows = new Map<string, Row>();

  // True for the length of a Run all. Every path that would hand a Run button
  // back to the user consults it, so a row reporting its result mid-sweep does
  // not reopen the door the sweep closed.
  let busy = false;

  // Toggles every row whose checkbox has a result to show, mirroring the row
  // checkboxes' own semantics rather than reaching into rows still loading.
  const selectAllCheckbox = doc.createElement("input");
  selectAllCheckbox.type = "checkbox";
  selectAllCheckbox.disabled = true;
  selectAllCheckbox.title = "Toggle all";

  const updateSelectAllState = (): void => {
    const enabled = [...rows.values()].filter((row) => !row.checkbox.disabled);
    if (enabled.length === 0) {
      selectAllCheckbox.disabled = true;
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
      return;
    }
    selectAllCheckbox.disabled = false;
    const checkedCount = enabled.filter((row) => row.checkbox.checked).length;
    selectAllCheckbox.checked = checkedCount === enabled.length;
    selectAllCheckbox.indeterminate = checkedCount > 0 && checkedCount < enabled.length;
  };

  selectAllCheckbox.addEventListener("change", () => {
    for (const row of rows.values()) {
      if (row.checkbox.disabled || row.checkbox.checked === selectAllCheckbox.checked) {
        continue;
      }
      row.checkbox.checked = selectAllCheckbox.checked;
      callbacks.onToggleLayer(row.element.getAttribute("data-adapter-id") ?? "", selectAllCheckbox.checked);
    }
    updateSelectAllState();
  });

  const thead = doc.createElement("thead");
  const headRow = doc.createElement("tr");
  for (const header of HEADERS) {
    const th = doc.createElement("th");
    if (header === "show") {
      th.appendChild(selectAllCheckbox);
    } else {
      if (WRAPPED_HEADERS.has(header)) {
        th.className = "wrap-header";
      }
      th.textContent = header;
    }
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

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

    const showCell = doc.createElement("td");
    const checkbox = doc.createElement("input");
    checkbox.type = "checkbox";
    checkbox.disabled = true;
    checkbox.addEventListener("change", () => {
      callbacks.onToggleLayer(adapter.id, checkbox.checked);
      updateSelectAllState();
    });
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

    const resultCells: HTMLTableCellElement[] = [];
    for (let index = 0; index < 8; index += 1) {
      const td = doc.createElement("td");
      td.className = "num";
      td.textContent = EMPTY;
      resultCells.push(td);
      tr.appendChild(td);
    }

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
      // Only the first run of a library measures a load. Later runs leave the
      // column holding that first figure instead of blanking it, so pressing
      // Run all again reports the same table rather than a shorter one.
      if (result.loadMs !== null) {
        row.resultCells[LOAD_CELL].textContent = formatMs(result.loadMs);
      }
      const measured = [
        formatMs(result.totalMs),
        formatPointsPerSecond(result.pointsPerSecond),
        String(verification.interior),
        String(verification["on-geometry"]),
        String(verification["off-geometry"]),
        String(verification.unverifiable),
        String(result.errors),
      ];
      measured.forEach((value, index) => {
        row.resultCells[LOAD_CELL + 1 + index].textContent = value;
      });
      row.element.classList.remove("is-running");
      row.runButton.disabled = busy;
      row.errorRow.hidden = true;
      // Programmatic `checked` fires no change event, so this never reaches onToggleLayer.
      row.checkbox.disabled = false;
      row.checkbox.checked = true;
      updateSelectAllState();
    },
    setError(id: string, message: string): void {
      const row = rowFor(id);
      row.element.classList.remove("is-running");
      row.runButton.disabled = busy;
      row.errorCell.textContent = message;
      row.errorRow.hidden = false;
    },
    setBusy(next: boolean): void {
      busy = next;
      for (const row of rows.values()) {
        row.runButton.disabled = busy || row.element.classList.contains("is-running");
      }
    },
    reset(): void {
      for (const row of rows.values()) {
        row.element.classList.remove("is-running");
        row.runButton.disabled = busy;
        // The Load column survives: a new dataset does not reload the library,
        // so blanking it here would leave it empty for the rest of the session.
        for (const cell of row.resultCells.slice(LOAD_CELL + 1)) {
          cell.textContent = EMPTY;
        }
        row.checkbox.checked = false;
        row.checkbox.disabled = true;
        row.errorRow.hidden = true;
        row.errorCell.textContent = "";
      }
      updateSelectAllState();
    },
  };
}
