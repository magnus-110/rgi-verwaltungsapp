# Rundmails im Postfach (mehrere Entwürfe, Empfänger je E-Mail-Adresse, Anhänge je Einheit)

## Ziel

Rundmails werden ein eigener Bereich **innerhalb des Postfachs** (wie "Entwürfe" und "Geplant"). Dort lassen sich mehrere Rundmail-Entwürfe parallel führen, Empfänger pro Nachricht auf Ebene einzelner E-Mail-Adressen auswählen und persönliche Anhänge automatisch über die Einheitennummer zuordnen.

## Aufbau

**Postfach-Seitenleiste:** neuer Eintrag "Rundmails" unter Entwürfe/Geplant. Klick öffnet die Rundmail-Übersicht im Hauptbereich.

**Übersicht:** Liste aller Rundmail-Entwürfe (Name, Gebäude, Empfängerzahl, Status, geändert am) mit "Neue Rundmail". Ein Klick öffnet den Editor; man kann jederzeit zurück und einen anderen Entwurf öffnen — jeder Entwurf hält seine eigenen Empfänger, Texte und Anhänge (gespeichert als `comm_campaigns` mit Status `draft`).

**Editor (eine Seite, drei Bereiche):**

```text
┌─────────────────────────────────────────────────────────────────┐
│ ← Rundmails    Name: ETV-Einladung 2026   Gebäude: Achweg 3-5 ▾ │
├──────────────────────────────┬──────────────────────────────────┤
│ EMPFÄNGER                    │ INHALT                            │
│ [Alle][Eigentümer][Mieter]   │ Konto ▾   Vorlage ▾               │
│ Suche …                      │ Betreff (mit Platzhaltern)        │
│ ▾ 0001 · Fam. Wiesneth       │ Text (mit Platzhaltern)           │
│    ☑ thomas.w@freenet.de     │                                   │
│    ☑ ines.c@freenet.de       │ ANHÄNGE                           │
│ ▾ 0002 · M. Sieden           │ Für alle: [Dateien wählen]        │
│    ☑ m.sieden@web.de         │ Persönlich: [Dateien hierher]     │
│    ☐ buero@sieden.de         │  0001 → 0001_Gesamtabrechnung.pdf │
│ ▾ 0003 · Fa. Müller ⚠ ohne   │  0002 → 0002_Gesamtabrechnung.pdf │
│ …                            │  ⚠ 1 Datei ohne Einheit           │
│ 22 Einheiten · 27 Adressen   │                                   │
├──────────────────────────────┴──────────────────────────────────┤
│ Vorschau (Empfänger durchblättern)   [Test] [Planen] [Senden]   │
└─────────────────────────────────────────────────────────────────┘
```

- **Empfänger nach Einheit gruppiert**: pro Einheit alle hinterlegten Adressen (aus `contact_emails` und `contact_persons`) einzeln an-/abwählbar, Einheit-Kopfzeile schaltet alle Adressen der Einheit. Rollen-Chips, Suche, Alle/Keine. Kontakte ohne Adresse werden sichtbar markiert.
- **Anhänge für alle** und **persönliche Anhänge**, klar getrennt.
- **Platzhalter** wie bisher (Palette, Vorschau mit aufgelösten Werten je Empfänger).
- **Test, Planen, Senden, Verlauf** wie bisher.

## Automatische Zuordnung über die Einheitennummer

Dateien werden per Drag & Drop (auch ZIP) abgelegt. Aus dem Dateinamen wird die führende Einheitennummer gelesen (`0001_…`, auch `0001-…` oder `Nr. 1`) und mit der `unit_number` der Zuordnung abgeglichen (mit führenden Nullen normalisiert). Die Datei geht an **alle ausgewählten Adressen dieser Einheit** — im Beispiel Achweg 3-5 bekommt `0001_Gesamtabrechnung.pdf` sowohl thomas.wiesneth@freenet.de als auch ines.cirkvencic@freenet.de. Nicht zuordenbare Dateien erscheinen als "ohne Einheit" und lassen sich manuell zuweisen. Vor dem Versand zeigt die Bestätigung, wie viele Empfänger keinen persönlichen Anhang haben und welche Dateien unzugeordnet sind.

## Dateinamen der generierten Dokumente

Damit die Automatik greift, wird die Einheitennummer bei der Dokumentenerstellung **vorangestellt und vierstellig** geschrieben, statt wie heute hinten angehängt:

- heute: `Einzelabrechnung_2025_Wiesneth_1`
- neu: `0001_Einzelabrechnung_2025_Wiesneth`

Betroffen sind Einzelabrechnung, Sammelbericht und §35a-Bescheinigung in `BillingSettlement.tsx` (Zeilen 1047, 1258, 1522). Gesamtabrechnung und Vermögensbericht bleiben ohne Nummer (gehen an alle).

## Technische Umsetzung

**Postfach-Integration**
- `src/pages/Inbox.tsx`: virtueller Ordner "Rundmails" analog `isDraftsFolder`/`isScheduledFolder`; rendert das neue Panel im Hauptbereich.
- Neue Komponenten unter `src/components/communication/bulk/`: `BulkMailPanel` (Liste), `BulkMailEditor` (Editor), `UnitRecipientPicker` (adressbasierte Auswahl), `PersonalAttachmentsPanel`. Logik aus `EmailCampaignWizard` (Vorlagen, Signatur, Platzhalter, Zeitplanung, Senden) wird wiederverwendet; der Gebäude-Tab "Kommunikation" bleibt bestehen und verlinkt ins Postfach.
- Entwürfe: `comm_campaigns` mit `status='draft'` — Auto-Speichern beim Verlassen des Editors.

**Adressbasierte Empfänger**
- Migration: `comm_campaigns.recipient_filter` bekommt zusätzlich `email_addresses` (Liste ausgewählter Adressen je Zuordnung) — keine Schemaänderung nötig, da JSONB.
- `supabase/functions/_shared/comm-vars.ts`: `loadRecipients` filtert bei gesetzter Adressliste auf genau diese Adressen (statt nur pro Kontakt).

**Anhänge je Empfänger**
- Migration: `comm_recipient_overrides` um `attachment_paths text[] default '{}'` erweitern, Unique-Constraint `(campaign_id, contact_id)` sicherstellen; zusätzlich Spalte `email` für adressgenaue Zuordnung.
- Upload nach `comm-assets` unter `campaigns/{id}/personal/{unit}/…`.
- `comm-send-bulk-email/index.ts`: Overrides um `attachment_paths` erweitern, pro Empfänger persönliche Dateien laden und an die gemeinsamen Anhänge hängen. Fehlt eine hinterlegte Datei, wird der Empfänger als `failed` markiert statt eine Mail ohne Anlage zu senden. `comm-dispatch-scheduled` erbt das Verhalten.

**Sicherheit**
- Versandbestätigung mit Empfängerzahl, fehlenden Anhängen und unzugeordneten Dateien; `requireAdmin` im Sender bleibt unverändert.

## Nicht Teil dieses Plans

Serienbriefe (Word/ZIP) bleiben unverändert im Gebäude-Hub.
