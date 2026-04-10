

## Plan: Standard-Steuersatz pro Konto + Einstellungs-Dialog

### 1. Datenbank: Neue Spalte `default_vat_rate`

Migration: `ALTER TABLE public.chart_of_accounts ADD COLUMN default_vat_rate numeric DEFAULT 19;`

Danach ein UPDATE-Statement, das sinnvolle Defaults setzt:
- Personenkonten (0001-0999): 0%
- Bankkonten (1800, 1810 etc.): 0%
- Vorauszahlungskonten (1470-1473): 0%
- Versicherungen: 19% (Versicherungssteuer)
- Handwerker/Instandhaltung: 19%
- Heizkosten/Energie: 19%
- Rücklagen: 0%

### 2. ChartOfAccountsTab: Tabelle verschlanken + Einstellungs-Popover

Die aktuelle Tabelle zeigt viele Spalten (VR, Abr., HK, WP, SV, 35a, §35a Typ, Abr.-Sektion). Diese werden ersetzt durch:

**Neue schlanke Tabellenansicht:**
| Konto-Nr. | Bezeichnung | Verteilerschlüssel | MwSt | ⋯ (Aktionen) |

Die Spalte "⋯" öffnet einen **Popover/Dialog** mit allen Einstellungen:
- Abrechnungssektion (Dropdown)
- §35a Typ (Dropdown)
- Standard-MwSt (Dropdown: 0%, 7%, 19%)
- Verteilungsrelevant (VR) - mit Info-Icon: "Wird in der Einzelabrechnung auf die Eigentümer verteilt"
- Abrechnungsrelevant (Abr.) - Info: "Erscheint in der Gesamtabrechnung"
- Heizkosten-relevant (HK) - Info: "Wird über die Heizkostenverordnung abgerechnet"
- Wirtschaftsplan-relevant (WP) - Info: "Erscheint im Wirtschaftsplan/Budget"
- Saldovortrag (SV) - Info: "Saldo wird ins nächste Geschäftsjahr übertragen (z.B. Bankkonten, Vorauszahlungen)"
- §35a relevant - Info: "Enthält haushaltsnahe Dienstleistungen oder Handwerkerleistungen nach §35a EStG"

Jedes Feld bekommt ein kleines Info-Icon (ℹ️) mit Tooltip/Erläuterung + Beispiel.

### 3. BuildingDistributionKeysTab: Gleiche Anpassung

Auch hier werden die vielen Inline-Spalten (VR, Abr., HK, WP, SV, 35a, §35a Typ) in ein "⋯"-Popover verschoben. Standard-MwSt wird ebenfalls angezeigt und überschreibbar.

### 4. CreateBookingDialog: MwSt aus Konto vorbelegen

Wenn der User ein Konto auswählt, wird `vat_rate` automatisch auf den `default_vat_rate` des Kontos gesetzt (bleibt aber änderbar).

### 5. Supabase Types aktualisieren

`default_vat_rate` in die TypeScript-Typen aufnehmen (Regeneration oder manueller Eintrag).

---

### Technische Details

**Dateien die geändert werden:**
- Neue Migration: `default_vat_rate` Spalte + UPDATE für Standardwerte
- `src/components/finance/ChartOfAccountsTab.tsx` - Tabelle verschlanken, Einstellungs-Popover pro Zeile
- `src/components/finance/BuildingDistributionKeysTab.tsx` - Gleiche Umstrukturierung
- `src/components/finance/CreateBookingDialog.tsx` - MwSt-Prefill bei Kontoauswahl
- `src/integrations/supabase/types.ts` - Neues Feld

**Neuer UI-Komponenten-Ansatz:** Ein `AccountSettingsPopover` (oder inline Dialog), der via "⋯"-Button geöffnet wird und alle Flags + Dropdowns + MwSt + Info-Tooltips enthält.

