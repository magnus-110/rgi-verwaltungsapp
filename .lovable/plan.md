## Änderungen auf der Zahlungen-Seite

**Datei: `src/pages/Transfers.tsx`**
1. Mini-Dashboard rechts oben entfernen (Boxen "Offen ausgehend" / "Offen eingehend", Zeilen ~383–397).
2. `buildingFilter` an `InvoiceDropZone` als `selectedBuildingId` durchreichen, damit Uploads automatisch dem oben gewählten Gebäude zugeordnet werden.
   - "Alle Gebäude" = keine Vorauswahl (Auto-Erkennung greift wie bisher).
   - "RGI Immobilien GmbH & Co. KG" (company) wird ebenfalls korrekt übergeben.

**Datei: `src/components/finance/InvoiceDropZone.tsx`**
1. Internes Dropdown "Automatisch erkennen / Gebäude wählen" entfernen (Zeilen 109–121 inkl. `selectedBuilding`-State).
2. Stattdessen Prop `selectedBuildingId?: string` (Werte: `""` | building-uuid | `"company"`) verwenden — ersetzt `selectedBuilding`-State 1:1 in `uploadFile`.
3. Hinweistext unter der Dropzone dynamisch:
   - kein Gebäude gewählt → "Liegenschaft wird automatisch erkannt"
   - Gebäude/Firma gewählt → "Wird der ausgewählten Liegenschaft zugeordnet"

Keine Änderungen an Backend, OCR oder Datenmodell.