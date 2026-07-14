import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { reloadOnceForNewVersion } from "@/lib/chunkReload";

// Nach einem Deployment referenziert eine im Browser laufende alte App-Version
// teils Chunk-Dateien, die nicht mehr existieren ("Failed to fetch dynamically
// imported module"). Vite meldet das über "vite:preloadError" — dann laden wir
// die Seite einmalig neu, statt dem Nutzer eine Fehlerseite zu zeigen.
window.addEventListener("vite:preloadError", (event) => {
  if (reloadOnceForNewVersion()) {
    event.preventDefault();
  }
});

// Register service worker for push notifications
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => {})
      .catch(() => {});
  });
}

const rootElement = document.getElementById("root")!;
const root = createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
