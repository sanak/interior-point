import { parseDroppedGeoJson } from "../data/drop.ts";
import type { Dataset } from "../types.ts";

const NO_FILE_MESSAGE = "Drop a single .geojson or .json file.";

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
      const text = await file.text();
      onDataset(parseDroppedGeoJson(text, file.name));
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  });
}
