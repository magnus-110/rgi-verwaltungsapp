

## Praxisnahes Dashboard-Konzept (Gebäude + Allgemein)

Klare Trennung der zwei Dashboards basierend auf Nutzungskontext:
- **Allgemeines Dashboard** (`/dashboard`) = Tagesstart-Übersicht über ALLE Gebäude
- **Gebäude-Dashboard** (Tab "Übersicht" im Gebäude-Hub) = Arbeitsbereich für ein konkretes Gebäude

---

### A) Gebäude-Dashboard (`BuildingDashboard.tsx`, Tab "overview")

**1. KPI-Action-Bar (oben, klickbar → springt in passenden Tab)**
- Offene Meldungen · Offene Vorgänge · Buchungs-Fortschritt %

**2. Buchungs-Fortschritt (neue Karte, prominent)**
Skala/Progress-Bar: "Letzter Monat: 78 % der Bankbewegungen gebucht (42/54)"
- Datenquelle: `bank_transactions` WHERE building_id = X AND booking_date BETWEEN [letzter Monat]
- Berechnung: `count(invoice_id IS NOT NULL OR matched_template_id IS NOT NULL) / count(*)`
- Klick → Sprung zu Buchhaltung > Kontoauszüge

**3. Eigentümer-Liste mit Schnellaktionen**
Kompakte Liste aller Eigentümer (`contact_building_assignments` WHERE role='eigentuemer'):
- Name + Wohneinheit
- Buttons rechts: ✉ E-Mail (öffnet ComposeEmail mit Empfänger vorausgefüllt), 📞 Tel (tel:-Link)
- Mobile: kollabierbar, max. 5 sichtbar + "Alle anzeigen"

**4. Handwerker / Dienstleister-Karte**
Eigene Sektion (`contact_building_assignments` WHERE role='dienstleister'):
- Firmenname + Gewerk
- Schnellaktionen: ✉ Mail, 📞 Anrufen
- Wird NICHT mehr im Personen-Tab angezeigt (bleibt wie geändert)

**5. Offene Vorgänge (Cases)**
Top 5 offene Cases (`cases` WHERE status IN ('open','in_progress','waiting_external')):
- Titel + Priorität-Badge + Alter
- Button: "+ Neuer Vorgang" (öffnet `CreateCaseDialog`)

**6. Offene Meldungen**
Top 5 (`weg_reports`/`miete_reports` WHERE status='open'):
- Eigentümer-Name + Kurztext + Datum
- Klick → Sprung in Reports-Tab

**7. Quick-Action-Leiste (unten, 4 Buttons)**
`+ Vorgang` · `+ Aufgabe` · `+ Schwarzes Brett` · `✉ Rundmail an alle Eigentümer`

---

### B) Allgemeines Dashboard (`pages/Dashboard.tsx`)

Tagesstart-Übersicht über ALLE zugewiesenen Gebäude (für Verwalter-Mitarbeiter):

**1. Big-Number-Cards (4 KPIs oben)**
- 🔴 Offene Meldungen (Summe über alle Gebäude)
- 📋 Offene Vorgänge
- 💰 Offene Rechnungen (`invoices` WHERE status='open')
- ✉ Neue E-Mails ungelesen (`emails` WHERE is_read=false, building_id IS NOT NULL)

Jede Card klickbar → Sprung zur jeweiligen Seite mit passendem Filter.

**2. "Heute fällig" Liste**
- Aufgaben mit `due_date = today` aus `todos`
- Wartungstermine aus `building_maintenance` (next_due in 7 Tagen)
- Anstehende ETV-Termine

**3. "Letzte Aktivität" Feed**
Realtime-Stream der letzten 10 Events: neue Meldung, neue E-Mail klassifiziert, Vorgang aktualisiert, Rechnung eingegangen — mit Gebäude-Kontext-Chip.

**4. Gebäude-Schnellzugriff-Grid**
Bestehende Gebäudekacheln behalten, aber kompakter — mit Mini-Badge bei kritischen Zahlen (z. B. "3 offen").

---

### Technische Umsetzung

| Komponente | Datei | Typ |
|---|---|---|
| RPC `get_building_overview(uuid)` | Migration | Konsolidiert alle Counter+Listen in einer Query |
| RPC `get_dashboard_global_stats(uuid)` | Migration | Für allg. Dashboard, scoped auf zugewiesene Gebäude |
| `BuildingOverviewTab.tsx` | NEU | Ersetzt Inhalt von Tab "overview" in `BuildingDashboard.tsx` |
| `BookingProgressCard.tsx` | NEU | Progress-Bar mit Buchungs-% |
| `OwnerQuickActions.tsx` | NEU | Eigentümer-Liste mit Mail/Tel-Buttons |
| `ServiceProvidersCard.tsx` | NEU | Handwerker-Schnellzugriff |
| `Dashboard.tsx` | EDIT | Komplettes Redesign mit KPIs + Activity Feed |
| Hooks: `useComposeEmail` (existiert) | — | Für „E-Mail an Eigentümer" |

### Datenquellen (alle vorhanden)
- `weg_reports` / `miete_reports` (status=open)
- `cases` (status IN open/in_progress/waiting_external)
- `bank_transactions` + `bookings` für Buchungs-Fortschritt
- `contact_building_assignments` (role: eigentuemer / dienstleister) + `contact_persons` + `contact_emails` + `contact_phones`
- `invoices`, `emails`, `todos`, `building_maintenance`

### Mobile (411 px)
- KPI-Bar als 2×2-Grid
- Eigentümer/Handwerker-Listen kollabierbar
- Quick-Actions als 2×2-Grid
- Activity-Feed unter den Listen

### Was bewusst NICHT angezeigt wird
Vanity-Metriken: Anzahl Kontakte/Dokumente/Forum-Beiträge, Adresse als großes Feld (steht im Header), Kontenrahmen, Gebäudedokumente.

### Reihenfolge der Umsetzung
1. RPC `get_building_overview` + `BuildingOverviewTab` mit allen Sektionen
2. `BookingProgressCard` (separater Schritt, weil eigene Berechnung)
3. RPC `get_dashboard_global_stats` + Redesign `pages/Dashboard.tsx`

Starte ich mit Schritt 1 (Gebäude-Dashboard inkl. RPC)?

