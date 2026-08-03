# Rundmails: nur Entwürfe, moderner Editor, Empfänger-Karten mit Anhängen

## 1. Rundmails zeigt nur noch Entwürfe

Die Rundmail-Liste im Postfach zeigt künftig nur Entwürfe und geplante Rundmails (Status `draft`, `scheduled`, `sending`). Fertig versendete Rundmails verschwinden aus der Liste — die einzelnen versendeten E-Mails liegen ohnehin bereits im Postausgang/Gesendet, wo sie hingehören.

## 2. Neue Editor-Ansicht (übersichtlicher, modern)

Statt drei getrennter Tabs eine zweispaltige Arbeitsfläche:

```text
┌──────────────────────────────────────────────────────────────────────┐
│ ← Name der Rundmail        Gebäude ▾   [Speichern]  [Senden (24)]    │
├──────────────────────────────┬───────────────────────────────────────┤
│ NACHRICHT (links)            │ EMPFÄNGER (rechts, Karten)            │
│ Absender ▾   Versand ▾       │ Suche · [Alle][Keine][Eine je Einheit]│
│ Betreff                      │        [Kein Doppel]                  │
│ Platzhalter-Chips            │ ┌───────────────────────────────────┐ │
│ Text                         │ │ ☑ Gertjan Willems   0003 + 0007   │ │
│ Anhänge für alle             │ │   g.willems@…                     │ │
│  · Datei1.pdf                │ │   2 Anhänge · [Vorschau] [Bearb.] │ │
│ Persönliche Anhänge          │ └───────────────────────────────────┘ │
│  [Dateien ablegen 0001_…]    │ ┌───────────────────────────────────┐ │
│  ⚠ 1 Datei ohne Einheit      │ │ ☐ Claudia Bschorr  0002 · 1 Anh.  │ │
└──────────────────────────────┴───────────────────────────────────────┘
```

Links Inhalt und Anhänge, rechts die Empfängerliste immer im Blick. Auf schmalen Fenstern untereinander.

## 3. "Kein Doppel" — eine E-Mail pro Adresse

Neuer Auswahl-Button **Kein Doppel**: kommt dieselbe E-Mail-Adresse in mehreren Einheiten vor (z. B. Gertjan Willems mit zwei Wohnungen im Achweg), bleibt nur ein Eintrag ausgewählt.

Damit trotzdem alle Unterlagen ankommen, werden Empfänger im Editor grundsätzlich **nach E-Mail-Adresse zusammengefasst**: eine Karte je Adresse, mit allen zugehörigen Einheiten als Badges. Persönliche Anhänge werden über die Einheitennummer zugeordnet und **alle Einheiten dieser Adresse zusammengeführt** — Gertjan Willems bekommt also eine E-Mail mit den Abrechnungen beider Wohnungen. Der Platzhalter `{{einheit}}` listet in diesem Fall beide Einheiten (z. B. „0003, 0007").

Wer die Trennung will, schaltet "Kein Doppel" aus und wählt die Einheiten einzeln — dann geht pro Einheit eine eigene Mail raus.

## 4. Empfänger-Karten: Anhänge sehen, Vorschau, individuell bearbeiten

Jede Karte zeigt: Auswahl-Häkchen, Name, E-Mail, Einheiten, Rolle, Anzahl und Namen der persönlichen Anhänge (einzeln entfernbar, Dateien per Klick nachladen).

- **Vorschau**: öffnet die fertige Mail für genau diesen Empfänger mit aufgelösten Platzhaltern und Anhangsliste.
- **Bearbeiten**: Betreff und Text nur für diesen Empfänger überschreiben; die Karte bekommt dann das Kennzeichen "individuell" und lässt sich auf den Standardtext zurücksetzen.
- Warnhinweise direkt auf der Karte: kein persönlicher Anhang vorhanden, Adresse doppelt.

## Technische Umsetzung

- `BulkMailPanel.tsx`: Query filtert `status in ('draft','scheduled','sending')`.
- Neue Ansichtsebene im Editor: aus `BulkRecipient[]` wird eine `mergedRecipients`-Liste je E-Mail-Adresse (Sammlung aus `assignmentIds`, `unitNumbers`, zusammengeführten `attachment_paths`). Auswahl-State bleibt schlüsselbasiert (`assignmentId|email`); "Kein Doppel" wählt je Adresse nur den ersten Schlüssel, alle weiteren Einheiten derselben Adresse hängen ihre Anhänge an diesen Schlüssel.
- `BulkMailEditor.tsx` wird in `MessageComposer`, `RecipientCardList`, `RecipientCard`, `RecipientPreviewDialog` unter `src/components/communication/bulk/` aufgeteilt; Persistenz-Logik (`persist`) bleibt unverändert bis auf die zusammengeführten Anhänge.
- Individuelle Texte nutzen die bereits vorhandenen Spalten `comm_recipient_overrides.subject` / `body_html` — keine Migration nötig. Der Sender `comm-send-bulk-email` muss diese Overrides beim Rendern bevorzugen (prüfen und ggf. ergänzen).
- Platzhalter-Auflösung für Vorschau und `{{einheit}}`-Mehrfachwert clientseitig in einem kleinen Helper (`resolveBulkVars.ts`), serverseitig entsprechend `comm-vars.ts` für mehrere Einheiten je Empfänger erweitern.
