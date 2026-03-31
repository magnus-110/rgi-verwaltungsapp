

## Split-Screen Zuordnungsdialog mit KI-Vorschlägen

### Übersicht
Der aktuelle Zuordnungsdialog (`max-w-lg`, kleines Select-Dropdown) wird durch einen Fullscreen-ähnlichen Split-Screen-Dialog ersetzt. Links: Transaktionsdetails groß und übersichtlich. Rechts: scrollbare Liste aller verfügbaren Rechnungen/Vorlagen als Karten mit allen relevanten Infos. Zusätzlich eine KI-Funktion, die passende Kandidaten hervorhebt.

### Änderungen

**Datei 1: `src/components/finance/BankStatementsTab.tsx`**

Den bestehenden Dialog (Zeile 490-563) komplett ersetzen durch:

- **Dialog**: `max-w-6xl w-full h-[80vh]` — nutzt fast den ganzen Bildschirm
- **Linke Seite (ca. 40%)**: Transaktionsdetails groß dargestellt
  - Betrag (groß, farbig)
  - Datum
  - Name (Auftraggeber/Empfänger)
  - IBAN
  - Verwendungszweck (vollständig, nicht abgeschnitten)
  - BIC, Mandatsreferenz falls vorhanden
- **Rechte Seite (ca. 60%)**: Scrollbare Liste von Karten
  - Tab-Umschalter oben: "Rechnungen" / "Vorlagen"
  - Toggle: "Bereits zugeordnete anzeigen" (nur bei Rechnungen)
  - Jede Karte zeigt:
    - **Rechnung**: Rechnungsnummer, Lieferant, Bruttobetrag, IBAN, Rechnungsdatum
    - **Vorlage**: Name, Lieferant, erwarteter Betrag, IBAN, Intervall
  - Klick auf Karte = Auswahl (visuell hervorgehoben mit Ring/Border)
  - Ausgewählte Karte → "Zuordnen"-Button wird aktiv
- **KI-Badge**: Karten die von der KI als passend erkannt werden, bekommen ein "KI-Vorschlag" Badge und werden oben sortiert

**Datei 2: Neue Edge Function `supabase/functions/suggest-match/index.ts`**

Einfache KI-Funktion die für eine Transaktion die besten Kandidaten ermittelt:
- Input: Transaktionsdaten (Name, IBAN, Betrag, Verwendungszweck) + Liste der verfügbaren Rechnungen/Vorlagen
- Verwendet Lovable AI (gemini-3-flash-preview) mit Tool-Calling um structured output zurückzugeben
- Output: Array von `{ id: string, score: number, reason: string }` — die IDs der passenden Rechnungen/Vorlagen mit Begründung
- Matching-Kriterien für die KI: IBAN-Übereinstimmung, Betragsähnlichkeit, Namensähnlichkeit, Verwendungszweck-Keywords
- Wird beim Öffnen des Dialogs automatisch aufgerufen, Ergebnis wird gecacht

**Ablauf im Dialog:**
1. Dialog öffnet sich → linke Seite zeigt Transaktionsdetails
2. Parallel: KI-Aufruf startet (kleiner Spinner auf rechter Seite)
3. KI-Ergebnisse kommen → passende Karten bekommen Badge + werden nach oben sortiert
4. User klickt auf passende Karte → Karte wird selektiert (blauer Rand)
5. User klickt "Zuordnen" → wie bisher `handleManualAssign`

### Technische Details

```text
┌──────────────────────────────────────────────────────────┐
│  Transaktion zuordnen                              [X]  │
├────────────────────┬─────────────────────────────────────┤
│                    │  [Rechnungen] [Vorlagen]            │
│  -1.234,56 €       │  □ Bereits zugeordnete anzeigen    │
│  15.01.2026        │                                    │
│                    │  ┌─ KI-Vorschlag ──────────────┐   │
│  Stadtwerke GmbH   │  │ RE-2026-001                 │   │
│  DE89 3704 ...     │  │ Stadtwerke GmbH  1.234,56 € │   │
│                    │  │ DE89 3704 ...   15.01.2026   │   │
│  Abschlag Strom    │  │ "IBAN + Betrag stimmen"      │   │
│  Jan 2026          │  └──────────────────────────────┘   │
│                    │                                    │
│                    │  ┌──────────────────────────────┐   │
│                    │  │ RE-2026-005                 │   │
│                    │  │ Müller AG       890,00 €     │   │
│                    │  └──────────────────────────────┘   │
│                    │                                    │
├────────────────────┴─────────────────────────────────────┤
│                       [Abbrechen]  [Zuordnen]           │
└──────────────────────────────────────────────────────────┘
```

### Dateien
1. `src/components/finance/BankStatementsTab.tsx` — Dialog-UI komplett umbauen
2. `supabase/functions/suggest-match/index.ts` — KI-Matching Edge Function (neu)

