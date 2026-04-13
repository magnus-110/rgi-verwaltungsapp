

## Plan: Integrierter Buchungsworkflow im Prüfmodus

### Zusammenfassung

Der Prüfmodus (`TransactionReviewMode`) wird zum zentralen Buchungstool umgebaut. Statt Transaktionen an Make.com zu senden, werden Buchungen direkt in der App erstellt. Für zugeordnete Transaktionen (Vorlage/Rechnung) wird der Buchungsvorschlag deterministisch aus den vorhandenen Daten generiert — keine KI-Latenz. Für nicht-zugeordnete Transaktionen wird die existierende KI-Analyse (`suggest-match`) im Hintergrund vorgeladen und als Entwurf gespeichert.

---

### Architekturentscheidungen

**Kein KI-Modell nötig für zugeordnete Transaktionen**: Wenn eine Vorlage mit Konto, Betrag, MwSt hinterlegt ist, kann die Buchung 1:1 daraus abgeleitet werden. Ebenso bei Rechnungen mit `suggested_account_id`. Das spart Latenz und Kosten.

**Hintergrund-Prefetching für unzugeordnete**: Beim Laden der Kontoauszugsseite wird für alle `unmatched`-Transaktionen parallel `suggest-match` (Mistral Large) aufgerufen. Ergebnisse werden in `bank_transactions.ai_suggestion` (neues JSONB-Feld) gespeichert. Beim Erreichen im Prüfmodus sind die Vorschläge sofort da.

**Buchungen-Tab wird Read-Only Auditlog**: Kein Entfernen, aber keine Buchungserstellung mehr dort. Nur Anzeige + Bearbeitung bestehender Buchungen.

**Rechnungen bleiben im Finanzen-Tab**: Verschiebung in eigenen Sidebar-Punkt für späteren Zeitpunkt — jetzt fokussieren wir auf den Buchungsworkflow.

---

### Änderungen im Detail

#### 1. Datenbank: JSONB-Feld für KI-Vorschläge

```sql
ALTER TABLE bank_transactions ADD COLUMN ai_suggestion jsonb;
```

Speichert vorberechnete Buchungsvorschläge (Konto, Betrag, MwSt, Buchungstext) als Entwurf.

#### 2. TransactionReviewMode komplett überarbeiten

**Neuer Aufbau — Zwei-Spalten-Layout:**

Links: Transaktionsdetails + **Buchungsmaske** (inline, nicht als separater Dialog)
Rechts: PDF-Vorschau (bei Rechnung) oder Vorlagendetails

**Buchungsmaske (links, unterhalb der Transaktionsdetails):**

```text
┌─────────────────────────────────────┐
│ Konto          [4200 - Gaskosten ▼] │  ← Groß, prominent
│ Betrag         [250,00 €]           │
│   davon MwSt   39,92 € (19%)       │  ← Klein darunter
│ Gegenkonto     [1200 - Bank    ▼]   │  ← Groß, prominent  
│ Buchungstext   [Abschlag Gas Dez]   │  ← Mittelgroß
│─────────────────────────────────────│
│ Kürzel [KI]  Beleg-Dat [15.12.25]  │  ← Kompakt
│ Beleg-Nr [RE-2025-042]  MwSt [19%] │
│ §35a [ ]                            │
└─────────────────────────────────────┘
  [← Zurück]  [Buchen & Weiter ⇧]
```

**Enter-Navigation**: Jedes Feld springt mit Enter zum nächsten. Tab funktioniert ebenfalls. Am letzten Feld löst Enter die Buchung aus.

**1-Click-Edit**: Alle Felder sind sofort editierbar — kein separater Edit-Modus nötig. Die Buchungsmaske IST die Bearbeitungsansicht.

**Auto-Fill-Logik (deterministisch, ohne KI):**
- **Vorlage zugeordnet**: Konto aus `booking_templates.account_id`, Betrag aus Transaktion, MwSt aus Vorlage, Buchungstext aus Vorlagenname
- **Rechnung zugeordnet**: Konto aus `invoices.suggested_account_id`, Betrag/MwSt aus Rechnung, Buchungstext aus Vendor + Rechnungsnummer
- **Unzugeordnet + KI-Vorschlag vorhanden**: Felder aus `bank_transactions.ai_suggestion` vorausfüllen
- **Unzugeordnet ohne Vorschlag**: Leere Maske, KI-Analyse-Button

**Buchungs-Aktion**: Erstellt direkt einen `bookings`-Eintrag in Supabase (status: 'confirmed') und setzt `bank_transactions.booked_at`. Kein Make.com-Webhook mehr.

#### 3. Hintergrund-KI-Prefetching

Neuer Hook `useTransactionAiPrefetch`:
- Wird beim Laden des `BankStatementsTab` getriggert
- Filtert `unmatched`-Transaktionen ohne `ai_suggestion`
- Ruft `suggest-match` parallel für alle auf (Batch von 5 gleichzeitig, um Rate Limits zu vermeiden)
- Speichert Ergebnisse in `bank_transactions.ai_suggestion`
- Visueller Indikator: "KI analysiert 12/45 Transaktionen..." in der UI

#### 4. Prüfmodus-Reihenfolge

Der Prüfmodus zeigt Transaktionen in dieser Reihenfolge:
1. **Zugeordnete** (Vorlage/Rechnung) — sofort buchbar
2. **Unzugeordnete mit KI-Vorschlag** — prüfen & buchen
3. **Unzugeordnete ohne Vorschlag** — manuell zuordnen

#### 5. BankStatementsTab: Prüfmodus öffnet alle Transaktionen

Der "Prüfmodus"-Button öffnet den neuen Modus mit ALLEN unbuchten Transaktionen (zugeordnete + unzugeordnete), nicht nur den zugeordneten.

#### 6. BookingsTab: Read-Only umbauen

- "Neue Buchung" Button und `CreateBookingDialog` entfernen
- `BookingReviewMode` entfernen (wird durch TransactionReviewMode ersetzt)
- Nur noch: Buchungen anzeigen, filtern, bearbeiten (`EditBookingDialog` bleibt)

---

### Dateien

| Datei | Aktion |
|-------|--------|
| Migration | `ai_suggestion JSONB` Feld zu `bank_transactions` |
| `TransactionReviewMode.tsx` | Komplett überarbeiten: Inline-Buchungsmaske mit Enter-Navigation |
| `BankStatementsTab.tsx` | Prüfmodus öffnet alle Transaktionen, KI-Prefetch-Indikator |
| `BookingsTab.tsx` | Read-Only: Buchungserstellung + ReviewMode entfernen |
| `useTransactionAiPrefetch.ts` | Neuer Hook für Hintergrund-KI-Analyse |

