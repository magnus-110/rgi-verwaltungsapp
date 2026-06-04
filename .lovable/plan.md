## Ziel

Den Nachbereitungs-Tab clean und übersichtlich gestalten — nur das Nötigste, in dieser Reihenfolge:

1. **Protokoll-Vorschau** (formatiert, lesbar, mit Vollbild-Option)
2. **Unterschriften-Bereich** (Eigentümer · Versammlungsleiter · Protokollführer)
3. **Drei Action-Buttons**: PDF herunterladen · DOCX herunterladen · Beschlusssammlung aktualisieren

Alles andere fliegt raus.

## Was entfernt wird (`MeetingProtocol.tsx`)

- Status-Karte oben (TOPs-Zähler, "Protokoll generiert"-Badge) → ein kleiner unauffälliger Header reicht
- Buttons „Protokoll neu generieren" und „Beschlusssammlung aktualisieren" oberhalb → werden neu unten gruppiert
- „Generiertes Protokoll"-Card mit rohem `whitespace-pre-wrap` Text → ersetzt durch eingebettetes formatiertes HTML
- Button-Reihe „Vorschau · Als HTML · Im Portal veröffentlichen" → wird verschlankt, „Als HTML" raus, „Vorschau" wird Vollbild-Icon, „Im Portal veröffentlichen" bleibt erhalten (war im aktuellen Bild ja noch da)
- Doppelte Vorlagen-Auswahl + DOCX/PDF-Buttons + großer Unterschriften-Block aus `ProtocolRenderActions` → durch schlanke neue Variante ersetzt

## Neuer Aufbau Nachbereitung

```text
┌─ Mini-Header ─────────────────────────────────────────┐
│ ✓ 3/3 TOPs · Protokoll: 29.03.2026          [⛶ Groß] │
├───────────────────────────────────────────────────────┤
│                                                       │
│   ┌─ Protokoll (formatiertes HTML, iframe) ────┐      │
│   │  Eigentümerversammlung – WEG XY            │      │
│   │  Datum, Ort, Leitung …                     │      │
│   │  TOP 1 …                                   │      │
│   │  …                                         │      │
│   │  Höhe ~600px, scrollbar                    │      │
│   └────────────────────────────────────────────┘      │
│                                                       │
│   Unterschriften                                      │
│   ┌──────────────┬──────────────┬──────────────┐      │
│   │ Eigentümer   │ Vers.-leiter │ Protokollf.  │      │
│   │ [Sign-Pad]   │ [Sign-Pad]   │ [Sign-Pad]   │      │
│   │ Name: ____   │ Name: ____   │ Name: ____   │      │
│   └──────────────┴──────────────┴──────────────┘      │
│                                                       │
│   [📄 PDF]  [📝 DOCX]  [📚 Beschlusssammlung akt.]    │
│                                                       │
│   (sekundär, klein): [✨ Protokoll neu generieren]   │
│                      [🚀 Im Portal veröffentlichen]   │
└───────────────────────────────────────────────────────┘
```

### Vollbild-Modus

Ein Icon-Button (⛶) öffnet das aktuelle `generateProtocolHtml()` als `iframe` in einem Dialog auf `max-w-6xl` / `h-[95dvh]` — quasi „lesen wie ein PDF". Schließen per X.

### Unterschriften-Karte

- 3 Spalten responsive (mobil 1-spaltig)
- Jede Spalte: Rolle, kleines `<SignaturePad>` (existiert in `buildings/keys/SignaturePad.tsx`), Namensfeld
- Status-Pill „✓ unterschrieben" wenn vorhanden
- Speichern automatisch onBlur des Pads (delete-then-insert in `etv_protocol_signatures` wie bisher) → kein extra Dialog mehr
- „Final signieren & im DMS ablegen" bleibt als unauffälliger Button **unter** den Pads, wird erst aktiv wenn alle 3 unterschrieben

### Buttons

- **PDF / DOCX**: rufen direkt `etv-render-protocol` mit `output_format: pdf|docx` auf — Standard-Vorlage wird automatisch verwendet (kein Vorlagen-Dropdown mehr im Tab, das gehört zum Vorlagen-Manager-Tab)
- **Beschlusssammlung aktualisieren**: bestehende `saveResolutionsMutation` 1:1
- **Protokoll neu generieren** + **Im Portal veröffentlichen**: bleiben erhalten, werden aber als sekundäre Ghost-Buttons unten platziert (nicht prominent)

## Technische Umsetzung

### `src/components/meetings/MeetingProtocol.tsx` (rewrite Layout)
- Behält alle Queries + Mutations (`generateMutation`, `saveResolutionsMutation`, `publishMutation`, `generateProtocolHtml`)
- Rendert Protokoll als `<iframe srcDoc={generateProtocolHtml()}>` direkt im Tab (~600px hoch) statt rohem Textblock
- Vollbild-Dialog mit gleichem `iframe`, größer
- Bindet neue `ProtocolSignaturesInline`-Komponente und neue `ProtocolDownloadButtons`-Komponente ein

### Neu: `src/components/meetings/ProtocolSignaturesInline.tsx`
- Lädt `etv_protocol_signatures` für `meeting_id`
- Rendert 3-Spalten-Grid mit `SignaturePad` + Namens-`Input` pro Rolle
- onChange auf Pad + Name: upsert in `etv_protocol_signatures` (delete-then-insert pro Rolle)
- Zeigt „Final signieren & im DMS ablegen"-Button (ruft `etv-finalize-signed-protocol` wie bisher)

### Neu: `src/components/meetings/ProtocolDownloadButtons.tsx`
- Zwei Buttons (PDF, DOCX) → `supabase.functions.invoke("etv-render-protocol", { meeting_id, output_format })` → `window.open(signed_url)`
- Nutzt die Default-Vorlage automatisch (kein Template-Picker)

### Löschen
- `src/components/meetings/ProtocolRenderActions.tsx` wird **nicht gelöscht**, aber nicht mehr referenziert (kann später entfernt werden); falls gewünscht direkt entfernen

## Nicht Teil dieses Plans

- Backend / Edge Functions / Datenbank-Schema bleiben unverändert
- Vorlagen-Tab und ProtocolTemplatesTab bleiben unangetastet
- KI-Protokoll-Generierung bleibt funktional gleich
