

# Plan: Kürzel-Badge dezenter gestalten

## Aenderung

In `src/pages/Inbox.tsx` (Zeile ~803) die CSS-Klassen des Kürzel-Select-Elements anpassen:

- `bg-primary/10` entfernen (kein orangener Hintergrund)
- `font-bold` durch `font-normal` ersetzen (nicht fett)
- `text-primary` durch `text-muted-foreground` ersetzen (dezentere Farbe)

Resultat: Kürzel wie "MG" erscheinen in dezentem Grau, ohne Hintergrund, nicht fett — aber weiterhin klickbar.

