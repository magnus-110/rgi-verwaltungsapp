## Notfallkontakte für Dienstleister

### Ziel
Admins können pro Dienstleister festlegen, ob er als **Notfallkontakt** beim Eigentümer angezeigt wird. Diese Kontakte erscheinen ganz oben im **Schwarzen Brett**, gruppiert nach Gewerk, mit Telefon-/E-Mail-Buttons und einem Erklärtext zur Eskalation.

---

### Teil 1: Admin-UI – Notfallkontakt-Schalter pro Dienstleister

**Datei:** `src/components/buildings/BuildingServiceProvidersTab.tsx`

Pro Dienstleister-Karte einen **Notfall**-Button hinzufügen (Glocken-Icon). Klick öffnet einen kleinen Dialog mit:
- Schalter „Als Notfallkontakt anzeigen"
- Freitextfeld „Hinweis für Bewohner" (optional, z. B. „24/7 erreichbar", „nur Werktags 7–17 Uhr")
- Reihenfolge innerhalb des Gewerks (Zahl, optional)

Visuelle Markierung: aktive Notfallkontakte bekommen ein orangenes Glocken-Badge auf der Karte.

**Datenmodell:** Neue Spalten in `contact_building_assignments` via Migration:
- `is_emergency_contact boolean default false`
- `emergency_note text`
- `emergency_sort_order integer`

(Hängt am Assignment, nicht am Kontakt selbst — derselbe Dienstleister kann pro Gebäude unterschiedlich konfiguriert sein.)

---

### Teil 2: Notfall-Widget am Schwarzen Brett (Eigentümer)

**Datei:** `src/pages/weg-owner/Forum.tsx`

Neue Komponente `EmergencyContactsWidget` ganz oben (vor den Forenposts). Aufbau:

**1. Hausverwaltung-Block (immer zuerst, orange hervorgehoben)**
- Name, Telefon, E-Mail aus `building.manager_name` + zentralen Hausverwaltungs-Kontaktdaten (info@rgi-immobilien.de / 08363 960656)
- Buttons: „Anrufen" (`tel:`) und „E-Mail" (`mailto:`)
- Hinweistext (fest):

  > **Bitte zuerst die Hausverwaltung kontaktieren.** Externe Handwerksbetriebe sollen nur dann eigenständig beauftragt werden, wenn die Hausverwaltung nicht erreichbar ist.

**2. Externe Notfallkontakte (nach Gewerk gruppiert)**
- Geladen aus `contact_building_assignments` mit `is_emergency_contact = true`, gefiltert nach den Gebäuden des Eigentümers
- Pro Gewerk (z. B. „Heizung & Sanitär", „Rohrreinigung", „Schlüsseldienst") eine Zeile mit:
  - Firmenname
  - Wann anrufen-Hinweis (festgelegte Texte je Gewerk, ergänzt um den freien `emergency_note`)
  - Telefon-Button (groß, primär) und E-Mail-Button

**Festtexte je Gewerk** (in `src/lib/emergencyContactInfo.ts`, gemappt auf `service_category`):

| Gewerk | Wann anrufen |
|---|---|
| Hausmeister | Kleine technische Defekte im Haus (z. B. Lichttüren, Garten) |
| Heizung & Sanitär | Nur bei Totalausfall der Heizung, akuten Wasserschäden oder Rohrbruch |
| Rohrreinigung | Massive Verstopfungen, wenn Abwasser in Wohnung oder Keller drückt |
| Schlüsseldienst | Defekte am Haustürschloss oder Wohnungsaussperrungen |

**3. Öffentliche Notrufe (statisch, am Ende, rot)**
- **112 Feuerwehr** – Rauch, Brand, Gasgeruch
- **112 Rettungsdienst** – Medizinische Notfälle
- **110 Polizei** – Einbruch oder akute Gefahr

Jeweils als großer `tel:`-Button.

**Verhalten:** Das Widget ist einklappbar (Default: aufgeklappt). Wenn keine externen Notfallkontakte gepflegt sind, werden trotzdem Hausverwaltung + öffentliche Notrufe gezeigt.

---

### Technische Details

**Migration:**
```sql
ALTER TABLE public.contact_building_assignments
  ADD COLUMN is_emergency_contact boolean NOT NULL DEFAULT false,
  ADD COLUMN emergency_note text,
  ADD COLUMN emergency_sort_order integer;

CREATE INDEX idx_cba_emergency
  ON public.contact_building_assignments (building_id)
  WHERE is_emergency_contact = true;
```

**Neue Datei:** `src/lib/emergencyContactInfo.ts` – Mapping `service_category → { whenToCall: string }` plus die Festtexte für öffentliche Notrufe und den Hausverwaltungs-Hinweis.

**Neue Komponente:** `src/components/forum/EmergencyContactsWidget.tsx`
- Lädt parallel: Buildings des Users, Notfall-Assignments mit Contact + Phones/Emails
- Verwendet bestehendes shadcn Card/Button/Badge
- Nutzt orange Akzentfarbe (`text-primary`/`bg-primary/10`) für Hausverwaltung, rot (`text-destructive`) für öffentliche Notrufe

**RLS:** `contact_building_assignments` hat bereits RLS. Eigentümer dürfen Assignments für ihre Gebäude lesen — neue Spalten sind unkritisch (kein PII).

**Tenant-Portal:** Dieselbe Logik analog auch in `src/pages/tenant/Forum.tsx` einbauen, falls vorhanden (Kurzcheck im Implementierungsschritt).

---

### Out of Scope
- Bearbeiten der Festtexte je Gewerk durch Admins (kommt erst, wenn nötig)
- Push-Benachrichtigungen
- Mehrere Hausverwaltungs-Hotlines pro Gebäude