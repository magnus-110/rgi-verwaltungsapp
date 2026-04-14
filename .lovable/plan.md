

## Plan: Überweisungen-Seite + Duplikatschutz bei E-Mail-Import

### 1. Neuer Sidebar-Punkt "Überweisungen" + Seite

**Datei:** `src/components/AdminSidebar.tsx`
- Neuer Menüpunkt `{ title: "Überweisungen", url: "/ueberweisungen", icon: CreditCard }` nach "Finanzen"

**Datei:** `src/App.tsx`
- Neue Route `/ueberweisungen` → `Transfers` Page

**Neue Datei:** `src/pages/Transfers.tsx`
- Zeigt nur **unbezahlte** Rechnungen (`status != 'paid'`), sortiert nach `due_date ASC` (überfällige zuerst)
- Gebäudefilter, Fälligkeits-Farbmarkierung (rot wenn überfällig)
- Spalten: Fällig am, Lieferant, Re.-Nr., IBAN, Betrag, Liegenschaft, Notiz
- Klick auf Rechnung öffnet Prüfmodus bei dieser Rechnung
- Button "Prüfmodus starten" für sequenzielles Durcharbeiten

### 2. Transfer-Prüfmodus

**Neue Datei:** `src/components/transfers/TransferReviewMode.tsx`

Vollbild-Split-View (wie TransactionReviewMode):

**Links — Überweisungsdaten mit einzelnen Copy-Buttons:**
- Empfänger/Lieferant → eigener Copy-Button (Clipboard-Icon)
- IBAN → eigener Copy-Button
- Betrag → eigener Copy-Button (formatiert als "1.250,00")
- Verwendungszweck (auto: "Re. Nr. {nr}, {vendor kurz}") → eigener Copy-Button
- Re.-Nr. → eigener Copy-Button
- Fälligkeitsdatum mit Warnung wenn überfällig
- Notiz-Feld (Textarea, speichert in `payment_notes`)

Kein "Alles kopieren"-Button — jedes Feld einzeln kopierbar für direktes Einfügen ins Bankprogramm.

**Prüfmodus unabhängig vom Bezahlen:**
- Button "Geprüft & Weiter" → setzt `review_status = 'verified'`, springt zur nächsten
- Separater Button "Als bezahlt markieren" → setzt `status = 'paid'`, `paid_at = now()`
- Beides unabhängig voneinander nutzbar

**Rechts — PDF-Vorschau** der Rechnung

**Navigation:** Pfeile + Fortschrittsanzeige "3/12"

### 3. Datenbank: payment_notes

**Migration:**
```sql
ALTER TABLE invoices ADD COLUMN payment_notes text;
```

### 4. Duplikatschutz bei E-Mail-Import

**Datei:** `src/components/email/EmailAttachments.tsx`

Aktuell prüft der Import nur im Session-State (`importedIds`), ob ein Anhang schon importiert wurde — ein Seiten-Reload erlaubt erneuten Import derselben Datei.

Lösung: Vor dem Upload in den `invoices`-Bucket prüfen, ob bereits eine Rechnung mit identischem `file_name` existiert (gleicher Dateiname = gleicher Anhang).

```typescript
// Vor Upload prüfen
const { data: existing } = await supabase
  .from("invoices")
  .select("id")
  .eq("file_name", att.file_name)
  .limit(1);
if (existing?.length) {
  toast.warning("Diese Datei wurde bereits als Rechnung importiert");
  setImportedIds(prev => new Set(prev).add(att.id));
  return;
}
```

### Zusammenfassung der Dateien

| Datei | Aktion |
|-------|--------|
| Migration | `payment_notes text` zu `invoices` |
| `src/components/AdminSidebar.tsx` | Menüpunkt "Überweisungen" |
| `src/App.tsx` | Route `/ueberweisungen` |
| `src/pages/Transfers.tsx` | Neue Seite: unbezahlte Rechnungen |
| `src/components/transfers/TransferReviewMode.tsx` | Prüfmodus mit Einzel-Copy-Buttons |
| `src/components/email/EmailAttachments.tsx` | Duplikatprüfung vor Import |

