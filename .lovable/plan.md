# Rundmails als eigener Navigationspunkt (mit Anhängen je Empfänger)

## Ziel

Rundmails sind heute nur im Gebäude-Hub unter "Kommunikation" versteckt. Sie bekommen einen eigenen Menüpunkt und eine vollflächige Ansicht mit Gebäudeauswahl, klarer Empfängerliste und – neu – individuellen Anhängen pro Empfänger (z. B. Einzelabrechnung zur ETV-Einladung).

## Meine Einschätzung zum Vorschlag

Der Vorschlag passt. Zwei Ergänzungen, die den Nutzen deutlich erhöhen:

1. **Automatische Zuordnung der Anhänge statt Einzel-Upload.** Bei 22 Eigentümern ist "pro Empfänger eine Datei hochladen" mühsam. Besser: alle Dateien (oder eine ZIP) in eine Dropzone ziehen; das System ordnet anhand des Dateinamens automatisch zu (Einheitennummer, Nachname, Kontaktname – genau die Namensmuster, die die Abrechnungs-PDFs schon tragen). Nicht zuordenbare Dateien landen in "Nicht zugeordnet" und können per Klick zugewiesen werden.
2. **Anhänge direkt aus dem DMS wählen**, statt sie erneut vom Rechner hochzuladen – die Einzelabrechnungen liegen bereits unter Finanzen/Einzel im Gebäude.

Zusätzlich sinnvoll: eine Sicherheitsprüfung vor dem Versand ("3 Empfänger ohne persönlichen Anhang – trotzdem senden?"), weil eine falsch zugeordnete Abrechnung ein echter Datenschutzvorfall wäre.

## Aufbau der neuen Seite `/rundmails`

Vollflächige Seite statt Dialog, drei Schritte in einer Ansicht (kein Wizard-Zwang, Schritte sind Abschnitte, die man frei anspringen kann):

```text
┌──────────────────────────────────────────────────────────────┐
│ Rundmails      [Gebäude: Achweg 3-5 ▾]         [Verlauf]     │
├───────────────────────────┬──────────────────────────────────┤
│ 1 Empfänger               │ 2 Inhalt                         │
│  [Alle] [Eigentümer]      │  Konto ▾ | Vorlage ▾             │
│  [Mieter] [Beirat]        │  Betreff …                       │
│  Suche …                  │  Text mit Platzhaltern           │
│  ☑ Fam. Gah   WE 4  📎1   │                                  │
│  ☑ M. Sieden  WE 7  📎—   │ 3 Anhänge                        │
│  ☐ Fa. Müller ⚠ ohne Mail │  Für alle: [Datei wählen]        │
│  …                        │  Persönlich: [Dateien hierher]   │
│                           │   → automatisch zugeordnet: 19/22│
│  22 ausgewählt · 20 Mails │   → 3 ohne Anhang, 1 unklar      │
├───────────────────────────┴──────────────────────────────────┤
│ Vorschau (Empfänger durchblättern)   [Test]  [Planen] [Senden]│
└──────────────────────────────────────────────────────────────┘
```

- **Gebäudeauswahl** oben, respektiert den aktiven Verwaltungsmodus (WEG/Miete). Auswahl bleibt gemerkt.
- **Empfängerliste** entspricht exakt dem, was im Postfach über `/Gebäude` erscheint: alle Zuordnungen des Gebäudes mit Rolle, Einheit und E-Mail-Status. Rollen-Filterchips, Suche, "Alle/Keine". Personen ohne E-Mail werden sichtbar markiert statt still übersprungen.
- **Anhänge** in zwei klar getrennten Bereichen: "Für alle" (bisheriges Verhalten) und "Persönlich je Empfänger". Im Empfängerzeilen-Badge sieht man sofort, wer eine persönliche Datei hat.
- **Vorschau** mit aufgelösten Platzhaltern und den konkret angehängten Dateien des gewählten Empfängers.
- Planen/Senden/Test/Verlauf funktionieren wie bisher; der bestehende Gebäude-Tab "Kommunikation" bleibt und verlinkt auf die neue Seite.

## Technische Umsetzung

**Navigation & Seite**
- `AdminSidebar.tsx`: Eintrag "Rundmails" (`/rundmails`, Icon `Send`) unter "Postfach"; Route in `App.tsx`.
- Neue Seite `src/pages/Rundmails.tsx` + Komponenten unter `src/components/communication/bulk/`. Der bestehende `EmailCampaignWizard` liefert die Logik (Vorlagen, Signatur, Platzhalter, Zeitplanung); die Schritte werden in Panels zerlegt und wiederverwendet, `RecipientPicker` wird als linke Spalte eingebunden (Auswahl bleibt assignment-basiert).

**Anhänge je Empfänger**
- Migration: `comm_recipient_overrides` um `attachment_paths text[] default '{}'` erweitern (Tabelle existiert bereits, Schlüssel `campaign_id` + `contact_id`) und Unique-Constraint auf `(campaign_id, contact_id)` sicherstellen.
- Upload nach `comm-assets` unter `campaigns/{id}/personal/{contact_id}/…`; DMS-Auswahl kopiert die Datei dorthin bzw. speichert den `building-files`-Pfad mit Präfix.
- Auto-Zuordnung im Frontend: Dateiname gegen Einheitennummer, Nachname/Firmenname und Kontaktname matchen; Ergebnis wird als Liste "zugeordnet / unklar / ohne Datei" angezeigt und ist manuell korrigierbar. ZIP-Dateien werden clientseitig entpackt.
- `comm-send-bulk-email/index.ts`: Overrides-Query um `attachment_paths` erweitern, pro Empfänger die persönlichen Dateien laden und an die gemeinsamen Anhänge anhängen; fehlende Dateien führen zu `failed` statt zu einer Mail ohne Anlage.
- `comm-dispatch-scheduled` nutzt denselben Sender – geplante Rundmails erben das Verhalten automatisch.

**Sicherheit**
- Versandbestätigung listet Anzahl Empfänger, Empfänger ohne persönlichen Anhang und nicht zugeordnete Dateien.
- Keine Änderung an den bestehenden Admin-Berechtigungen (`requireAdmin` im Sender bleibt).

## Nicht Teil dieses Plans

Serienbriefe (Word/ZIP) bleiben unverändert im Gebäude-Hub.
