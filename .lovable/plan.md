## Fehlerursache

Vite/SWC scheitert beim Parsen von `Step2Wohnungsdaten.tsx`. Der gemeldete Fehler "Unexpected token `div`. Expected jsx identifier" auf Zeile 54 ist ein Folgefehler — der echte Auslöser ist Zeile 57 (und 128) mit dem Tailwind-Arbitrary-Value-Klassennamen:

```
className="grid grid-cols-[110px_1fr] gap-2"
className="grid grid-cols-[1fr_110px] gap-2"
```

Das Lovable-SWC-Plugin injiziert in jedes JSX-Element `data-component-content="...{className: 'grid-cols-[110px_1fr]'}..."` (URL-encoded). Diese Injektion bricht den Parser bei Klassennamen mit eckigen Klammern + Underscore.

## Fix

In `src/components/onboarding/steps/Step2Wohnungsdaten.tsx` beide Tailwind-Arbitrary-Grid-Klassen durch inline `style` ersetzen:

- Zeile 57: `className="grid grid-cols-[110px_1fr] gap-2"` → `className="grid gap-2" style={{ gridTemplateColumns: "110px 1fr" }}`
- Zeile 128: `className="grid grid-cols-[1fr_110px] gap-2"` → `className="grid gap-2" style={{ gridTemplateColumns: "1fr 110px" }}`

Visuell identisches Ergebnis, aber der SWC-Parser hat keine Eckklammern mehr im Klassennamen.