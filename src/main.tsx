import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { reloadOnceForNewVersion, markAppLoadedSuccessfully } from "@/lib/chunkReload";

// Nach einem Deployment referenziert eine im Browser laufende alte App-Version
// teils Chunk-Dateien, die nicht mehr existieren ("Failed to fetch dynamically
// imported module"). Vite meldet das über "vite:preloadError" — dann laden wir
// die Seite einmalig neu, statt dem Nutzer eine Fehlerseite zu zeigen.
window.addEventListener("vite:preloadError", (event) => {
  if (reloadOnceForNewVersion()) {
    event.preventDefault();
  }
});

// Läuft die App eine Weile fehlerfrei, gilt der Versionswechsel als erledigt:
// Reload-Zähler zurücksetzen, damit der nächste Deploy wieder automatisch greift.
window.setTimeout(markAppLoadedSuccessfully, 8_000);

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
