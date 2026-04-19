

## Was ist der „Versorgung"-Tab aktuell?

Der Tab `Versorgung` (Component: `UtilityContractsTab`) ist sehr eng zugeschnitten: Er verwaltet ausschließlich **Versorgerverträge für Gas, Strom, Wasser und Fernwärme** mit Abschlagsbeträgen, Zähler­nummern und Verknüpfung zu Vorauszahlungs-/Aufwandskonten. Er dient v.a. der automatischen Abschlagslogik (Make.com → Konten 1470–1473) und wird teilweise auch automatisch aus erkannten Abschlagsrechnungen befüllt.

Er ist also **kein** allgemeines Dienstleisterverzeichnis, sondern ein Buchhaltungs-Hilfsmittel.

## Was du stattdessen willst

Ein **„Dienstleister"-Tab**, in dem alle gebäudebezogenen externen Partner zentral sichtbar sind:
Handwerker, Ablesefirma, Hausmeister, Versicherung, Schornsteinfeger, Reinigung, Gärtner, Versorger usw. — mit Kontaktdaten, Gewerk/Kategorie, ggf. Vertragsnummer und Notiz.

## Vorhandene Bausteine (kein Neuaufbau nötig)

- `contacts` hat bereits den Typ `service_provider`.
- `contact_persons`, `contact_phones`, `contact_emails` liefern Ansprechpartner-Struktur.
- `contact_building_assignments` verknüpft Kontakte mit Gebäuden — kann für Dienstleister analog genutzt werden.
- Der existierende „Personen"-Tab nutzt bereits genau diese Struktur für Eigentümer/Mieter/Beirat/Verwalter.

→ Wir brauchen **keine neue Tabelle**. Wir brauchen nur:
1. Eine neue Rolle `dienstleister` im Enum `contact_building_role`.
2. Ein optionales Feld `service_category` (Gewerk: Handwerker, Hausmeister, Versicherung, Ablesefirma, Schornsteinfeger, Versorger, Reinigung, Gärtner, Sonstiges) auf `contact_building_assignments`.
3. Ein neuer Reiter `Dienstleister` im Building-Hub mit eigener UI.

## Plan

### 1. Datenbank (Migration)
- Enum `contact_building_role` um `dienstleister` erweitern.
- Spalte `service_category text` zu `contact_building_assignments` hinzufügen (nullable, nur für Dienstleister relevant).

### 2. Neue UI-Komponente `BuildingServiceProvidersTab.tsx`
Schlanke Listen-/Karten-Ansicht (kein komplexes Inline-Edit wie bei Personen):
- Gruppierung/Filterung nach Gewerk-Kategorie (Chips oben).
- Pro Eintrag: Firma, Gewerk-Badge, Hauptansprechpartner, Telefon, E-Mail, Notiz, Kurz-Aktionen (Bearbeiten, Entfernen, Zum Kontakt springen).
- Button „+ Dienstleister hinzufügen" → öffnet bestehenden `AssignContactDialog` vorgefiltert auf `contact_type = service_provider` mit Gewerk-Auswahl. Wenn Kontakt nicht existiert: „Neuen Dienstleister anlegen" via `CreateContactDialog` (Typ vorbelegt).
- Anzeige relational verknüpft mit `building_id` (Linie der RGI-Architektur: nichts isoliert).

### 3. Tab-Umbau in `BuildingDashboard.tsx`
- `{ value: "utility", label: "Versorgung" }` ersetzen durch `{ value: "providers", label: "Dienstleister", icon: Briefcase }`.
- Neuen `TabsContent` mit `BuildingServiceProvidersTab` einhängen.
- `UtilityContractsTab` bleibt als Komponente erhalten und wird in der **Buchhaltung** (Tab `Buchen` → ggf. unter „Vorlagen" oder als neuer Unter-Reiter „Versorgerverträge") platziert, weil das logisch dorthin gehört (Abschlagskonten, Vorauszahlungslogik, Make-Integration). Alternativ: Anzeige als Sub-Section innerhalb des neuen Dienstleister-Tabs, wenn ein Eintrag der Kategorie „Versorger" angeklickt wird — gibt klare Trennung „Wer" (Dienstleister-Tab) vs. „Wie verbucht" (Buchhaltung).

**Empfehlung**: `UtilityContractsTab` in die Buchhaltung verschieben (näher an den Konten), neuer Dienstleister-Tab listet die Versorger ebenfalls (über Kategorie-Filter), so dass der Nutzer sie an beiden logisch passenden Orten sieht ohne Doppel-Erfassung.

### 4. KI-/RAG-Readiness
Da Dienstleister vollständig in `contacts`/`contact_building_assignments` liegen, kann Nova sie automatisch als Gebäude-Kontext nutzen (z. B. „Wer ist der Hausmeister von Gebäude X?").

### Geänderte/neue Dateien
- **Migration**: Enum-Erweiterung + Spalte `service_category`.
- **Neu**: `src/components/buildings/BuildingServiceProvidersTab.tsx`.
- **Geändert**: `src/components/buildings/BuildingDashboard.tsx` (Tab-Tausch).
- **Geändert**: `src/components/contacts/AssignContactDialog.tsx` (Filter `service_provider` + Gewerk-Feld, optional).
- **Geändert**: `src/pages/Finance.tsx` oder `BookingTemplatesTab` (UtilityContractsTab dorthin verschieben).

Keine Daten gehen verloren — bestehende `utility_contracts` bleiben unverändert nutzbar.

