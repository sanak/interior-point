import "maplibre-gl/dist/maplibre-gl.css";
import "./styles.css";

const status = document.querySelector<HTMLDivElement>("#dataset-status");
if (status) status.textContent = "Scaffold ready.";
