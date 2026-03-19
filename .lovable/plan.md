

# Fix: Build-Fehler maximumFileSizeToCacheInBytes

## Problem
Der JS-Bundle ist 5.3 MB gross, aber das PWA-Limit steht auf 5 MB. Die bestehende Konfiguration in `vite.config.ts` reicht nicht aus.

## Loesung
In `vite.config.ts` den Wert von `maximumFileSizeToCacheInBytes` von `5 * 1024 * 1024` (5 MB) auf `6 * 1024 * 1024` (6 MB) erhoehen.

## Datei
| Datei | Aenderung |
|---|---|
| `vite.config.ts` | `maximumFileSizeToCacheInBytes: 6 * 1024 * 1024` |

