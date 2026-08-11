import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Window } from "happy-dom";
import type { Adapter, RunResult } from "../src/types.ts";
import { formatMs, formatPointsPerSecond, renderTable } from "../src/ui/table.ts";

function createContainer(): HTMLElement {
  const window = new Window();
  const container = window.document.createElement("div");
  // happy-dom only dispatches a checkbox click's change event on elements
  // connected to the document, so the container has to be attached.
  window.document.body.appendChild(container);
  return container as unknown as HTMLElement;
}

function fakeAdapter(id: string, label: string): Adapter {
  return {
    id,
    label,
    call: "interiorPoint",
    load: () => Promise.resolve(),
    interiorPoint: () => [0, 0],
  };
}

const RESULT: RunResult = {
  adapterId: "ts-interior-point",
  loadMs: 12.34,
  totalMs: 567.89,
  pointsPerSecond: 1234.56,
  points: [[0, 0]],
  errors: 2,
  verification: { interior: 5, "on-geometry": 1, "off-geometry": 0, unverifiable: 3 },
};

const noCallbacks = { onRun: () => {}, onToggleLayer: () => {} };

describe("formatMs", () => {
  it("keeps one decimal", () => {
    assert.equal(formatMs(567.89), "567.9");
  });
});

describe("formatPointsPerSecond", () => {
  it("rounds and groups digits", () => {
    assert.equal(formatPointsPerSecond(1234.56), "1,235");
  });
});

describe("renderTable", () => {
  it("renders the header columns in order and one row per adapter", () => {
    const container = createContainer();
    renderTable(container, [fakeAdapter("a", "A"), fakeAdapter("b", "B")], noCallbacks);
    const headers = [...container.querySelectorAll("thead th")].map((th) => th.textContent);
    assert.deepEqual(headers, [
      "Library",
      "Call",
      "", // show: a select-all checkbox, no text label
      "Run",
      "Load (ms)",
      "Total (ms)",
      "pts per s",
      "interior",
      "on-\ngeometry",
      "off-\ngeometry",
      "un-\nverifiable",
      "errors",
    ]);
    assert.equal(container.querySelectorAll("tbody tr.result-row").length, 2);
  });

  it("gives the show header a select-all checkbox, disabled until a row has a result", () => {
    const container = createContainer();
    renderTable(container, [fakeAdapter("a", "A"), fakeAdapter("b", "B")], noCallbacks);
    const headCheckbox = container.querySelector<HTMLInputElement>("thead input[type='checkbox']");
    assert.ok(headCheckbox);
    assert.equal(headCheckbox.disabled, true);
  });

  it("reports Run clicks with the adapter id", () => {
    const container = createContainer();
    const runs: string[] = [];
    renderTable(container, [fakeAdapter("ts-interior-point", "TS")], {
      ...noCallbacks,
      onRun: (id) => runs.push(id),
    });
    const button = container.querySelector<HTMLButtonElement>("tr[data-adapter-id='ts-interior-point'] button.run");
    assert.ok(button);
    button.click();
    assert.deepEqual(runs, ["ts-interior-point"]);
  });

  it("fills a row from a RunResult and enables its show checkbox", () => {
    const container = createContainer();
    const handle = renderTable(container, [fakeAdapter("ts-interior-point", "TS")], noCallbacks);
    handle.setResult("ts-interior-point", RESULT);
    const cells = [...container.querySelectorAll("tr[data-adapter-id='ts-interior-point'] td")].map(
      (td) => td.textContent,
    );
    assert.equal(cells[0], "TS");
    assert.equal(cells[1], "interiorPoint");
    assert.equal(cells[3], "Run");
    assert.equal(cells[4], "12.3");
    assert.equal(cells[5], "567.9");
    assert.equal(cells[6], "1,235");
    assert.equal(cells[7], "5");
    assert.equal(cells[8], "1");
    assert.equal(cells[9], "0");
    assert.equal(cells[10], "3");
    assert.equal(cells[11], "2");
    const checkbox = container.querySelector<HTMLInputElement>(
      "tr[data-adapter-id='ts-interior-point'] input[type='checkbox']",
    );
    assert.ok(checkbox);
    assert.equal(checkbox.disabled, false);
    assert.equal(checkbox.checked, true);
  });

  it("shows a dash for a null loadMs", () => {
    const container = createContainer();
    const handle = renderTable(container, [fakeAdapter("ts-interior-point", "TS")], noCallbacks);
    handle.setResult("ts-interior-point", { ...RESULT, loadMs: null });
    const cells = [...container.querySelectorAll("tr[data-adapter-id='ts-interior-point'] td")].map(
      (td) => td.textContent,
    );
    assert.equal(cells[4], "—");
  });

  it("reports checkbox toggles after a result exists", () => {
    const container = createContainer();
    const toggles: [string, boolean][] = [];
    const handle = renderTable(container, [fakeAdapter("ts-interior-point", "TS")], {
      ...noCallbacks,
      onToggleLayer: (id, visible) => toggles.push([id, visible]),
    });
    handle.setResult("ts-interior-point", RESULT);
    assert.deepEqual(toggles, []);
    const checkbox = container.querySelector<HTMLInputElement>(
      "tr[data-adapter-id='ts-interior-point'] input[type='checkbox']",
    );
    assert.ok(checkbox);
    checkbox.click();
    assert.deepEqual(toggles, [["ts-interior-point", false]]);
  });

  it("enables the select-all checkbox once any row has a result", () => {
    const container = createContainer();
    const handle = renderTable(container, [fakeAdapter("a", "A"), fakeAdapter("b", "B")], noCallbacks);
    const headCheckbox = container.querySelector<HTMLInputElement>("thead input[type='checkbox']");
    assert.ok(headCheckbox);
    handle.setResult("a", RESULT);
    assert.equal(headCheckbox.disabled, false);
  });

  it("select-all toggles only rows that have a result", () => {
    const container = createContainer();
    const toggles: [string, boolean][] = [];
    const handle = renderTable(container, [fakeAdapter("a", "A"), fakeAdapter("b", "B")], {
      ...noCallbacks,
      onToggleLayer: (id, visible) => toggles.push([id, visible]),
    });
    handle.setResult("a", RESULT);
    const headCheckbox = container.querySelector<HTMLInputElement>("thead input[type='checkbox']");
    assert.ok(headCheckbox);
    headCheckbox.click();
    assert.deepEqual(toggles, [["a", false]]);
  });

  it("shows indeterminate on the select-all checkbox when rows disagree", () => {
    const container = createContainer();
    const handle = renderTable(container, [fakeAdapter("a", "A"), fakeAdapter("b", "B")], noCallbacks);
    handle.setResult("a", RESULT);
    handle.setResult("b", RESULT);
    const rowCheckboxA = container.querySelector<HTMLInputElement>("tr[data-adapter-id='a'] input[type='checkbox']");
    assert.ok(rowCheckboxA);
    rowCheckboxA.click();
    const headCheckbox = container.querySelector<HTMLInputElement>("thead input[type='checkbox']");
    assert.ok(headCheckbox);
    assert.equal(headCheckbox.indeterminate, true);
  });

  it("reset disables and unchecks the select-all checkbox", () => {
    const container = createContainer();
    const handle = renderTable(container, [fakeAdapter("a", "A")], noCallbacks);
    handle.setResult("a", RESULT);
    handle.reset();
    const headCheckbox = container.querySelector<HTMLInputElement>("thead input[type='checkbox']");
    assert.ok(headCheckbox);
    assert.equal(headCheckbox.disabled, true);
    assert.equal(headCheckbox.checked, false);
  });

  it("marks a running row and disables its Run button", () => {
    const container = createContainer();
    const handle = renderTable(container, [fakeAdapter("ts-interior-point", "TS")], noCallbacks);
    handle.setRunning("ts-interior-point");
    const row = container.querySelector("tr[data-adapter-id='ts-interior-point']");
    assert.ok(row);
    assert.ok(row.classList.contains("is-running"));
    const button = container.querySelector<HTMLButtonElement>("button.run");
    assert.ok(button);
    assert.equal(button.disabled, true);
  });

  it("surfaces an error message and re-enables the Run button", () => {
    const container = createContainer();
    const handle = renderTable(container, [fakeAdapter("ts-interior-point", "TS")], noCallbacks);
    handle.setRunning("ts-interior-point");
    handle.setError("ts-interior-point", "boom");
    const errorRow = container.querySelector<HTMLTableRowElement>("tr.error-row");
    assert.ok(errorRow);
    assert.equal(errorRow.hidden, false);
    assert.equal(errorRow.textContent, "boom");
    const button = container.querySelector<HTMLButtonElement>("button.run");
    assert.ok(button);
    assert.equal(button.disabled, false);
    const row = container.querySelector("tr[data-adapter-id='ts-interior-point']");
    assert.ok(row);
    assert.equal(row.classList.contains("is-running"), false);
  });

  it("reset restores the initial state", () => {
    const container = createContainer();
    const handle = renderTable(container, [fakeAdapter("ts-interior-point", "TS")], noCallbacks);
    handle.setResult("ts-interior-point", RESULT);
    handle.setError("ts-interior-point", "boom");
    handle.reset();
    const cells = [...container.querySelectorAll("tr[data-adapter-id='ts-interior-point'] td")].map(
      (td) => td.textContent,
    );
    for (let index = 4; index <= 11; index += 1) {
      assert.equal(cells[index], "—");
    }
    const checkbox = container.querySelector<HTMLInputElement>(
      "tr[data-adapter-id='ts-interior-point'] input[type='checkbox']",
    );
    assert.ok(checkbox);
    assert.equal(checkbox.disabled, true);
    assert.equal(checkbox.checked, false);
    const errorRow = container.querySelector<HTMLTableRowElement>("tr.error-row");
    assert.ok(errorRow);
    assert.equal(errorRow.hidden, true);
  });
});
