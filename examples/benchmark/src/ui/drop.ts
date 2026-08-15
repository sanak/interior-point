import { datasetFromBytes } from "../data/drop.ts";
import type { Dataset } from "../types.ts";

const NO_FILE_MESSAGE = "Drop a single .geojson, .json or .parquet file.";

export function installDropZone(
  target: HTMLElement,
  onDataset: (dataset: Dataset) => void,
  onError: (message: string) => void,
): void {
  // Without preventDefault on dragover the browser refuses the drop and navigates to the file on release.
  target.addEventListener("dragover", (event) => {
    event.preventDefault();
  });
  target.addEventListener("drop", async (event) => {
    event.preventDefault();
    const file = event.dataTransfer?.files[0];
    if (!file) {
      onError(NO_FILE_MESSAGE);
      return;
    }
    try {
      // Read once as bytes: the format is decided from them, and a large GeoParquet
      // file must not be pulled through `text()` first.
      onDataset(await datasetFromBytes(await file.arrayBuffer(), file.name));
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  });
}
