import type { Geometry, Position } from "geojson";
import type {} from "@wcohen/wasmts";
import type { Adapter } from "../types.ts";

const READY_POLL_MS = 50;
const READY_TIMEOUT_MS = 15000;

let ready = false;
let loadPromise: Promise<void> | null = null;
let reader: unknown = null;

function isReady(): boolean {
  return typeof wasmts !== "undefined" && Boolean(wasmts.algorithm);
}

async function load(): Promise<void> {
  loadPromise ??= new Promise<void>((resolve, reject) => {
    if (isReady()) {
      ready = true;
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = `${import.meta.env.BASE_URL}vendor/wasmts/wasmts.js`;
    script.onerror = () => reject(new Error("failed to load vendor/wasmts/wasmts.js"));
    document.head.appendChild(script);

    const start = Date.now();
    const poll = (): void => {
      if (isReady()) {
        ready = true;
        resolve();
        return;
      }
      if (Date.now() - start > READY_TIMEOUT_MS) {
        reject(new Error("timed out waiting for window.wasmts to be ready"));
        return;
      }
      setTimeout(poll, READY_POLL_MS);
    };
    poll();
  });
  await loadPromise;
}

function loaded(): unknown {
  if (!ready) {
    throw new Error("wasmts adapter used before load()");
  }
  reader ??= wasmts.io.geojson.GeoJsonReader.create0();
  return reader;
}

export const wasmtsAdapter: Adapter = {
  id: "wasmts",
  label: "JTS (WASM)",
  call: "InteriorPoint.getInteriorPoint",
  load,
  interiorPoint(geometry: Geometry): Position | null {
    const geom = wasmts.io.geojson.GeoJsonReader.read(loaded(), JSON.stringify(geometry));
    const point = wasmts.algorithm.InteriorPoint.getInteriorPoint(geom);
    return [point.getX(), point.getY()];
  },
};
