import "maplibre-gl/dist/maplibre-gl.css";
import "./styles.css";

import datasetUrl from "../../data/plateau-hiroshima-bldg.parquet?url";

import { ADAPTERS } from "./adapters/index.ts";
import { runAdapter } from "./bench/run.ts";
import { loadParquetDataset } from "./data/parquet.ts";
import { renderTable } from "./ui/table.ts";
import { createBenchmarkMap } from "./ui/map.ts";
import { installDropZone } from "./ui/drop.ts";
import type { Dataset } from "./types.ts";

/** How long to wait for a paint before moving on; a hidden tab never delivers one. */
const FRAME_TIMEOUT_MS = 100;

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
let busy = false;
const loaded = new Set<string>();

const map = createBenchmarkMap(document.querySelector("#map") as HTMLElement);

const table = renderTable(resultsEl, ADAPTERS, {
  onRun: (id) => void withBusy(() => runOne(id)),
  onToggleLayer: (id, visible) => map.setLayerVisible(id, visible),
});

/**
 * Runs `work` with every run control held down until it settles.
 *
 * One flag covers both entry points. A second press of Run all, or a row's own
 * Run button during a sweep, is dropped whole instead of interleaving with the
 * sweep already in flight — which used to let the second loop skip past rows the
 * first was still on and leave them unmeasured.
 */
async function withBusy(work: () => Promise<void>): Promise<void> {
  if (busy) {
    return;
  }
  busy = true;
  runAllButton.disabled = true;
  table.setBusy(true);
  try {
    await work();
  } finally {
    busy = false;
    table.setBusy(false);
    runAllButton.disabled = dataset === null;
  }
}

async function runOne(id: string): Promise<void> {
  if (!dataset) {
    return;
  }
  const adapter = ADAPTERS.find((candidate) => candidate.id === id);
  if (!adapter) {
    return;
  }
  table.setRunning(id);
  try {
    const result = await runAdapter(adapter, dataset, loaded);
    table.setResult(id, result);
    map.setPoints(adapter.id, result.points);
  } catch (error) {
    table.setError(id, error instanceof Error ? error.message : String(error));
  }
}

/**
 * Resolves once the browser has had a frame to paint.
 *
 * Run all yields one of these per row, so the table write and the map layer the
 * previous row triggered are drawn before the next row's timing window opens
 * rather than inside it. The timeout is what keeps a backgrounded tab moving,
 * since a hidden document is never asked to paint.
 */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    let timer = 0;
    const frame = requestAnimationFrame(() => {
      clearTimeout(timer);
      resolve();
    });
    timer = window.setTimeout(() => {
      cancelAnimationFrame(frame);
      resolve();
    }, FRAME_TIMEOUT_MS);
  });
}

runAllButton.disabled = true;
runAllButton.addEventListener("click", () => {
  void withBusy(async () => {
    for (const adapter of ADAPTERS) {
      await nextFrame();
      await runOne(adapter.id);
    }
  });
});

const dropError = document.querySelector<HTMLParagraphElement>("#drop-error");

function showDropError(message: string): void {
  if (dropError) {
    dropError.textContent = message;
    dropError.hidden = false;
  }
}

function adoptDataset(next: Dataset): void {
  dataset = next;
  if (dropError) {
    dropError.hidden = true;
  }
  table.reset();
  map.clearResults();
  map.setDataset(next);
  statusEl.textContent = `${next.name}: ${next.geometries.length} geometries (${next.skipped} skipped)`;
  runAllButton.disabled = busy;
}

installDropZone(
  document.body,
  (next) => {
    if (busy) {
      // Swapping the dataset mid-sweep would leave part of the table measuring
      // one file and part of it the other, with nothing on the page saying so.
      showDropError("A run is in progress. Wait for it to finish, then drop the file again.");
      return;
    }
    adoptDataset(next);
  },
  showDropError,
);

loadParquetDataset(datasetUrl, "PLATEAU Hiroshima buildings")
  .then((loadedDataset) => {
    adoptDataset(loadedDataset);
  })
  .catch((error: unknown) => {
    statusEl.textContent = `Failed to load dataset: ${error instanceof Error ? error.message : String(error)}`;
  });
