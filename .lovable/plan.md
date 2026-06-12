
# Makler-Modus: Vermietung & Verkauf

Zweiter Modus-Block in der Sidebar unter Überschrift "Makler" (einklappbar), zwei Tabs Vermietung/Verkauf im gleichen Pill-Design wie Verwaltungsmodus. Im Makler-Modus wird die Hauptnavigation auf eine eigene Objekt-Liste umgestellt. Sichtbar **ausschließlich**, wenn das Profil-Flag `broker_mode_enabled = true` ist — auch Admins sehen den Block sonst nicht.

## 1. Freischaltung

- Neue Spalte `profiles.broker_mode_enabled BOOLEAN DEFAULT false`
- Toggle pro User in Einstellungen (nur Admins können toggeln)
- Sidebar-Block + Routen `/makler/*` werden nur gerendert, wenn `profile.broker_mode_enabled === true`

## 2. Sidebar (AdminSidebar.tsx)

- Block "Verwaltungsmodus" (WEG/Miete) bleibt unverändert
- Darunter neuer Block "Makler" mit Chevron-Toggle (Zustand in localStorage)
- Aufgeklappt: zwei Pill-Buttons "Vermietung" / "Verkauf" (gleicher Style)
- Neuer `BrokerModeContext` (`'rent' | 'sale' | null`)
- Klick auf einen Pill schaltet die Hauptnavigation um: statt Dashboard/Buchhaltung/… wird im Makler-Modus nur "Objekte" + dauerhaft nützliche Punkte (Postfach, Kalender, Adressen) angezeigt

## 3. Objektliste (`/makler/objekte`)

- Split-View analog `Buildings.tsx` (einklappbare linke Liste)
- Filter oben: Aktiv/Inaktiv-Toggle, Suche (Titel/Adresse)
- "+"-Button für neues Objekt (Mini-Dialog: Titel + Adresse, Rest im Detail)
- Liste gefiltert nach aktivem `listing_type` (rent/sale)

## 4. Datenmodell

```sql
broker_properties (
  id, listing_type 'rent'|'sale', is_active bool default true,
  title, address, postal_code, city,
  -- Preis
  price_eur, deposit_eur, cold_rent_eur,
  service_charge_eur, heating_cost_eur,
  -- Provision
  commission_buyer_pct, commission_seller_pct, commission_tenant_pct,
  commission_note text,
  -- Größen
  living_space_sqm, plot_size_sqm, rooms, bedrooms, bathrooms,
  floor, total_floors, year_built, available_from date,
  property_type, condition, heating_type, energy_class, energy_value,
  features text[],
  description text, internal_notes text,
  primary_image_file_id uuid,
  -- Eigentümer (Verkäufer/Vermieter)
  owner_contact_id uuid → contacts,
  created_by, created_at, updated_at
)

broker_leads (
  id, property_id, contact_id (nullable),
  external_name, external_email, external_phone,
  status 'neu'|'kontaktiert'|'besichtigung'|'angebot'|'abschluss'|'absage',
  rating int, notes,
  created_at, updated_at
)

broker_lead_events (
  id, lead_id, event_type 'call'|'viewing'|'email'|'note'|'offer'|'document_sent'|'status_change',
  occurred_at, title, body,
  email_id uuid nullable → emails,
  calendar_event_id uuid nullable → calendar_events,
  created_by
)

broker_property_notes (id, property_id, body, created_by, created_at)

-- Erweiterung bestehender Tabellen
ALTER TABLE building_files   ADD COLUMN broker_property_id uuid;
ALTER TABLE emails           ADD COLUMN broker_property_id uuid,
                             ADD COLUMN broker_lead_id uuid;
ALTER TABLE calendar_events  ADD COLUMN broker_property_id uuid,
                             ADD COLUMN broker_lead_id uuid;
```

Security-Definer-Funktion `public.has_broker_access(_user_id uuid)` prüft `profiles.broker_mode_enabled`. RLS auf allen broker_*-Tabellen via dieser Funktion. GRANTs für `authenticated` + `service_role`. Standard-`updated_at`-Trigger.

## 5. Objekt-Detail-Tabs

### 5.1 Übersicht
Formular-Maske, in Karten gruppiert:
- Eckdaten: Titel, Aktiv-Toggle, Adresse, verfügbar ab, Property-Typ
- Preis & Provision: Preis/Kaltmiete/Kaution/NK/HK, Provisionssätze
- Eigentümer: Contact-Picker (`owner_contact_id`) mit Schnellansicht der hinterlegten Email/Telefon; Button "Email an Eigentümer" öffnet `ComposeEmailDialog` und verlinkt die gesendete Email automatisch via `broker_property_id`
- Größen: Wohnfläche, Grundstück, Zimmer, Bad, Etage, Baujahr
- Ausstattung: Multi-Select-Chips (`features`), Heizungsart, Energieklasse + Wert
- Beschreibung: öffentliche Beschreibung + interne Notizen

### 5.2 Dokumente
- Wiederverwendung `building_files` + `broker_property_id`
- Feste Kategorien pro Objekt via RPC `ensure_broker_categories(property_id)`:
  Bilder, Exposé, Grundrisse, Energieausweis, Grundbuchauszug, Katasterauszug, Teilungserklärung, Protokolle, Abrechnungen, Wirtschaftsplan
- Upload triggert bestehende OCR + Chunking-Pipeline → RAG-ready
- Bilder-Ordner: "Hauptbild setzen" → `primary_image_file_id`

### 5.3 Notizen
- Eigene schlanke Tabelle `broker_property_notes`, einfache Liste + Inline-Editor

### 5.4 Interessenten
Linke Liste: alle Leads des Objekts mit Status-Badge, Rating, letzter Aktivität.
Rechte Detailansicht:
- Kopf: Contact-Picker oder Ad-hoc Name/Email/Telefon, Status-Dropdown, Rating
- Schnellaktionen:
  - "Anruf protokollieren" → `call`-Event
  - "Besichtigung planen" → öffnet Kalender-Dialog, legt `calendar_events`-Eintrag mit `broker_lead_id` an und spiegelt als `viewing`-Event
  - "Email senden" → `ComposeEmailDialog`, gesendete Email wird mit `broker_lead_id` verknüpft und automatisch als `email`-Event aufgenommen
  - "Notiz" / "Angebot" / "Status ändern"
- Timeline (vertikal, Icons je Event-Typ, chronologisch)

### 5.5 Email-Zuordnung (Postfach ↔ Lead)
Damit eingehende Emails Leads zugeordnet werden können (nur sichtbar bei `broker_mode_enabled = true`):
- In der Email-Detailansicht ein neuer Button "Interessent zuordnen" (analog zum bestehenden "Vorgang/ETV zuordnen")
- Picker zeigt Leads (gefiltert über aktives Makler-Objekt oder global suchbar)
- Auswahl setzt `emails.broker_lead_id` + `broker_property_id` und erzeugt automatisch ein `email`-Event in der Timeline
- Beim Anlegen eines Leads mit `external_email` (oder Contact mit Email) werden bestehende und zukünftige Emails dieser Adresse per Trigger als Vorschlag in der Lead-Timeline angezeigt (Auto-Match, manuell bestätigbar)

## 6. Technische Hinweise

- Routes: `/makler/objekte`, `/makler/objekte/:id`
- `Buildings.tsx`/`BuildingDashboard.tsx`-Pattern wird als `BrokerProperties.tsx` / `BrokerPropertyDashboard.tsx` gespiegelt
- OCR/Chunking unverändert: DMS-Pipeline greift, da Dateien in `building_files` liegen
- Reihenfolge der Umsetzung: (1) Migration + Flag-Toggle in Settings, (2) Sidebar-Block + Context, (3) Objektliste + Übersicht inkl. Eigentümer & Provision, (4) Dokumente mit Auto-Kategorien, (5) Notizen, (6) Interessenten-Timeline + Email-Zuordnung im Postfach
