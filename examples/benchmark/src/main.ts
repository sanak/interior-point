import "maplibre-gl/dist/maplibre-gl.css";
import "./styles.css";

import { ADAPTERS } from "./adapters/index.ts";
import { runAdapter } from "./bench/run.ts";
import { loadParquetDataset } from "./data/parquet.ts";
import { renderTable } from "./ui/table.ts";
import type { Dataset } from "./types.ts";

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`index.html is missing ${selector}`);
  }
  return element;
}

const statusEl = requireElement<HTMLElement>("#dataset-status");
const resultsEl = requireElement<HTMLElement>("#results");
const runAllButton = requireElement<HTMLButtonElement>("#run-all");

let dataset: Dataset | null = null;
let running = false;
const loaded = new Set<string>();

const table = renderTable(resultsEl, ADAPTERS, {
  onRun: (id) => void runOne(id),
  // The map module arrives in a later task; until then a layer toggle has nothing to show.
  onToggleLayer: () => {},
});

async function runOne(id: string): Promise<void> {
  if (!dataset || running) {
    return;
  }
  const adapter = ADAPTERS.find((candidate) => candidate.id === id);
  if (!adapter) {
    return;
  }
  running = true;
  table.setRunning(id);
  try {
    const result = await runAdapter(adapter, dataset, loaded);
    table.setResult(id, result);
  } catch (error) {
    table.setError(id, error instanceof Error ? error.message : String(error));
  } finally {
    running = false;
  }
}

runAllButton.disabled = true;
runAllButton.addEventListener("click", () => {
  void (async () => {
    for (const adapter of ADAPTERS) {
      await runOne(adapter.id);
    }
  })();
});

const DATASET_URL = `${import.meta.env.BASE_URL}data/plateau-hiroshima-bldg.parquet`;

loadParquetDataset(DATASET_URL, "PLATEAU Hiroshima buildings")
  .then((loadedDataset) => {
    dataset = loadedDataset;
    statusEl.textContent =
      `${loadedDataset.name} — ${loadedDataset.geometries.length} geometries ` + `(${loadedDataset.skipped} skipped)`;
    runAllButton.disabled = false;
  })
  .catch((error: unknown) => {
    statusEl.textContent = `Failed to load dataset: ${error instanceof Error ? error.message : String(error)}`;
  });
