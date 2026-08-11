import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Dataset } from "../src/types.ts";
import { installDropZone } from "../src/ui/drop.ts";

type Listener = (event: unknown) => unknown;

function fakeTarget(): { element: HTMLElement; listeners: Map<string, Listener> } {
  const listeners = new Map<string, Listener>();
  const element = {
    addEventListener(type: string, listener: Listener): void {
      listeners.set(type, listener);
    },
  } as unknown as HTMLElement;
  return { element, listeners };
}

interface FakeFile {
  name: string;
  text(): Promise<string>;
}

function fakeDropEvent(files: FakeFile[]): { event: unknown; wasPrevented(): boolean } {
  let prevented = false;
  return {
    event: {
      preventDefault(): void {
        prevented = true;
      },
      dataTransfer: { files },
    },
    wasPrevented: () => prevented,
  };
}

const VALID_GEOJSON = JSON.stringify({
  type: "FeatureCollection",
  features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [1, 2] } }],
});

describe("installDropZone", () => {
  it("prevents the default dragover so the browser allows the drop", () => {
    const { element, listeners } = fakeTarget();
    installDropZone(
      element,
      () => {},
      () => {},
    );
    let prevented = false;
    listeners.get("dragover")?.({
      preventDefault: () => {
        prevented = true;
      },
    });
    assert.equal(prevented, true);
  });

  it("parses a dropped GeoJSON file into a dataset named after the file", async () => {
    const { element, listeners } = fakeTarget();
    const datasets: Dataset[] = [];
    const errors: string[] = [];
    installDropZone(
      element,
      (dataset) => datasets.push(dataset),
      (message) => errors.push(message),
    );
    const { event, wasPrevented } = fakeDropEvent([{ name: "points.geojson", text: async () => VALID_GEOJSON }]);
    await listeners.get("drop")?.(event);
    assert.equal(wasPrevented(), true);
    assert.deepEqual(errors, []);
    assert.equal(datasets.length, 1);
    assert.equal(datasets[0]?.name, "points.geojson");
    assert.equal(datasets[0]?.geometries.length, 1);
  });

  it("reports a parse failure through onError and never calls onDataset", async () => {
    const { element, listeners } = fakeTarget();
    let datasetCalls = 0;
    const errors: string[] = [];
    installDropZone(
      element,
      () => {
        datasetCalls += 1;
      },
      (message) => errors.push(message),
    );
    const { event } = fakeDropEvent([{ name: "broken.geojson", text: async () => "not geojson at all" }]);
    await listeners.get("drop")?.(event);
    assert.equal(datasetCalls, 0);
    assert.equal(errors.length, 1);
    assert.ok(errors[0] !== undefined && errors[0].length > 0);
  });

  it("reports a drop with no files through onError", async () => {
    const { element, listeners } = fakeTarget();
    let datasetCalls = 0;
    const errors: string[] = [];
    installDropZone(
      element,
      () => {
        datasetCalls += 1;
      },
      (message) => errors.push(message),
    );
    const { event, wasPrevented } = fakeDropEvent([]);
    await listeners.get("drop")?.(event);
    assert.equal(wasPrevented(), true);
    assert.equal(datasetCalls, 0);
    assert.deepEqual(errors, ["Drop a single .geojson or .json file."]);
  });
});
