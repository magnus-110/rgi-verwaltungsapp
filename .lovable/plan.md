## Modul "Jahreszyklus" (WEG-Jahresaufgaben)

Neues Modul zur Ablösung der Excel-Liste. Zeigt pro Wirtschaftsjahr und WEG den Status aller Standardaufgaben.

### Aufgabenkatalog (12 Schritte, fix pro Wirtschaftsjahr)

1. Heizkostenabrechnung beantragt
2. Jahresabrechnung erstellt
3. Vermögensbericht erstellt
4. Wirtschaftsplan erstellt
5. ETV einberufen
6. ETV-Protokoll fertig *(automatisch erledigt sobald Protokoll generiert wurde)*
7. Beschlusssammlung aktualisiert
8. §35a-Bescheinigung versendet
9. Abrechnungsspitzen gebucht
10. Hausgeldanpassung umgesetzt
11. Bankabgleich Jahr abgeschlossen
12. Jahresabschluss archiviert

Pro Schritt nur: **Status** (offen / in Bearbeitung / abgeschlossen) + **Datum** + optional Notiz/Anhang. Keine verantwortliche Person.

### UI

**A) WEG-übergreifende Übersicht** (neuer Menüpunkt "Jahreszyklus")
- Tabelle: Zeile = WEG, Spalten = die 12 Schritte
- Zellen farblich markiert: grau = offen, orange = in Bearbeitung, grün = abgeschlossen
- Wirtschaftsjahr-Switcher oben (z. B. „2024/2025" ↔ „2025/2026")
- Filter: nur offene, nur meine WEGs
- Klick auf Zelle → Side-Panel mit Status, Datum, Notiz, Anhängen
- **Keine** Gesamt-Fortschrittsanzeige / Ampel über alle WEGs hinweg

**B) Building Hub** (Tab oder Karte im bestehenden Gebäude)
- Vertikale Liste der 12 Schritte für das aktive Wirtschaftsjahr
- Wirtschaftsjahr-Switcher
- Inline-Statuswechsel + Datumsfeld
- Ersetzt die bisherige „Buchungs-Fortschritt"-Karte nicht — wird zusätzlich angezeigt

### Automatik (Status wird vom System gesetzt)

- Schritt 2 → wenn Settlement im Status `final`
- Schritt 3 → wenn Vermögensbericht generiert
- Schritt 4 → wenn Wirtschaftsplan veröffentlicht
- Schritt 5 → wenn Meeting `published`
- Schritt 6 → wenn Protokoll generiert (sofort fertig)
- Schritt 7 → wenn neue Beschlüsse in Resolution Ledger eingetragen
- Schritt 9 → wenn Buchungen auf 4900/4910 vorhanden
- Schritt 11 → wenn Bankabgleich Monat 12 grün

Schritte 1, 8, 10, 12 = manuell (einfacher Klick „erledigt" + Datum).
Manueller Override ist für jeden Schritt möglich.

### Technisches Vorgehen

- Neue Tabelle `annual_cycle_tasks` (building_id, fiscal_year_start, fiscal_year_end, task_key, status, completed_at, note) mit RLS analog Settlements
- Seeding: bei erstem Öffnen eines Wirtschaftsjahres werden die 12 Datensätze automatisch erzeugt
- View `v_annual_cycle_overview` für die WEG-übergreifende Tabelle
- Status-Sync via DB-Trigger oder periodischem Edge-Function-Refresh aus den Quelltabellen (settlements, meetings, resolutions, bookings, bank_reconciliations)
- Neue Route `/jahreszyklus` + neuer Tab im Building Hub
- Wiederverwendung bestehender UI-Bausteine (Card, Badge, Table, Sheet)

### Außerhalb des Scopes (bewusst nicht enthalten)

- Wartungen / Versicherungen / Compliance (laufen über bestehende Wartungsintervalle)
- Beirat-Rollen, Eigentümer-Sicht
- Verantwortliche Person pro Aufgabe
- Gesamt-Ampel oder Firmen-KPI
- Kalenderjahr-Sicht (immer Wirtschaftsjahr)
- Option „versendet" bei Jahresabrechnung
