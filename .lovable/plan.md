

## Analyse: System-Readiness + KI-Optimierung

### Status: Was funktioniert bereits korrekt
- **Gesamtabrechnung**: 3-Spalten-Struktur (WP | Ist | Verteilungsrelevant) ✅
- **Einzelabrechnung**: 7-Spalten-Breakdown pro Eigentümer ✅
- **Heizkosten**: Sonderbehandlung via `heating_distribution_values` ✅
- **§35a**: Trennung Dienste/Handwerker mit Steuerbonus-Berechnung ✅
- **Zeitanteile**: Unterjährige Eigentümerwechsel korrekt berücksichtigt ✅
- **Vermögensbericht**: Bankkonten, Rücklagen, offene Verbindlichkeiten ✅
- **KI-Analyse**: Plausibilitätsprüfung der fertigen Abrechnung ✅
- **PDF-Engine**: Gesamt- und Einzelabrechnungen generierbar ✅

### 3 Funktionale Lücken

**Lücke 1: Konto-Salden (closing_balance) werden nicht automatisch berechnet**
Die `account_balances.closing_balance` muss manuell eingetragen werden. Das System hat zwar die automatische Übernahme der Opening-Balances, aber der Endbestand wird nirgends aus den Buchungen berechnet (Opening + Einnahmen - Ausgaben = Closing). Das führt dazu, dass die "Kontrolle Endbestände" immer 0 zeigt, weil `closing_balance` = `opening_balance` bleibt.

→ **Fix**: Im BillingSettlement automatisch `closing_balance` berechnen: `opening_balance + Summe aller Buchungen auf carry_forward-Konten`. Oder: Button "Salden aktualisieren" der die Berechnung triggert und in DB schreibt.

**Lücke 2: Buchungsprüfung hat keinen "Freigabe"-Status**
Der BookingReviewSection zeigt zwar 12/12 Zahlungen an, aber es gibt keinen Mechanismus um einen Schritt als "geprüft/freigegeben" zu markieren. Das bedeutet man kann direkt zur Gesamtabrechnung springen ohne Prüfung.

→ **Fix**: Pro Abrechnungsschritt ein `billing_step_status` (z.B. auf `billing_periods`-Tabelle) mit reviewed/approved Status. Optional — kann auch ohne Step-Gate funktionieren.

**Lücke 3: Vorschussverpflichtung nutzt SOLL statt IST-Zahlungen**
Die Einzelabrechnung berechnet Vorschüsse aus `contact_building_costs` (SOLL: 12 × monatl. Hausgeld). In der Referenz-Abrechnung wird aber der **tatsächlich gezahlte Betrag** (IST) verwendet — wenn ein Eigentümer nur 10 von 12 Monaten gezahlt hat, ist sein Vorschuss geringer.

→ **Fix**: In `computeOwnerResult` optional die Summe der tatsächlichen HG-Buchungen (Personenkonten 0001-0003) als Alternative zum SOLL verwenden. Toggle "SOLL/IST" im Settlement-UI.

### 5 KI-Optimierungspunkte (neu)

**KI 1: Buchungsprüfung — Automatische Anomalie-Erkennung** (Schritt 1)
Im BookingReviewSection einen "KI prüfen"-Button pro Konto. Die KI vergleicht:
- Erwartete vs. tatsächliche Buchungsanzahl
- Beträge im Vergleich zum Vorjahr (>10% Abweichung → Warnung)
- Doppelbuchungen oder fehlende Monate
→ Ergebnis: Ampel-Badge pro Konto (grün/gelb/rot)

**KI 2: Heizkosten-CSV-Validierung** (Schritt 2)
Nach CSV-Import der Heizkostenabrechner-Werte: KI prüft ob die Summe plausibel ist (Vergleich mit Vorjahr, Kosten pro m²). Warnt bei extremen Ausreißern pro Einheit.

**KI 3: Abgrenzungs-Vorschlag** (Schritt 3)
Die AccrualSection erkennt bereits Buchungen mit periodenfremdem Leistungszeitraum. Erweiterung: KI schlägt automatisch die korrekte Abgrenzungsbuchung vor (Betrag, Konto 4xxx, Begründung) — ein Klick erzeugt die Buchung.

**KI 4: Settlement-Kommentar** (Schritt 4 — neu)
Nach Berechnung der Gesamtabrechnung: Ein "KI-Zusammenfassung"-Button der einen natürlichsprachlichen Bericht generiert. Z.B.: "Die Gesamtkosten 2025 liegen bei 15.230€ und damit 8% über dem Wirtschaftsplan. Haupttreiber: Heizkosten (+22%). 2 von 3 Eigentümern erhalten ein Guthaben."
→ Dieser Text wird dem PDF als Anschreiben vorangestellt.

**KI 5: Eigentümer-Anschreiben generieren** (PDF-Export)
Pro Einzelabrechnung: KI generiert ein individuelles Anschreiben mit dem Ergebnis (Guthaben/Nachzahlung), Erklärung der wesentlichen Kostenänderungen, und Zahlungshinweis. Spart enorm Zeit bei 50+ Eigentümern.

### Implementierungsplan

**Phase 1: Closing-Balance-Fix (kritisch)**
- `BillingSettlement.tsx`: Button "Salden berechnen" der Opening + Buchungssummen pro carry_forward-Konto zu closing_balance summiert und per Upsert speichert
- Kein Schema-Change nötig — `account_balances.closing_balance` existiert bereits

**Phase 2: SOLL/IST-Toggle für Vorschüsse**
- In `computeOwnerResult`: Zusätzlich Buchungen auf Personenkonten (00001-00003) als IST-Zahlungen summieren
- Toggle-Switch im UI: "Vorschüsse aus Soll-Beträgen / aus Ist-Zahlungen"
- Default: SOLL (sicherer, da Personenkonten evtl. nicht gepflegt)

**Phase 3: KI-Buttons in bestehende Schritte**
- `BookingReviewSection.tsx`: "KI prüfen"-Button → ruft `analyze-billing` mit Fokus "booking_review" auf
- `AccrualSection.tsx`: "KI Abgrenzung vorschlagen"-Button → generiert Buchungsvorschlag
- `BillingSettlement.tsx`: "KI Zusammenfassung"-Button → generiert Anschreiben-Text für PDF

**Phase 4: Eigentümer-Anschreiben im PDF**
- `generate-billing-pdf/index.ts`: Optionales Anschreiben-Feld das als erste Seite vor die Einzelabrechnung gesetzt wird
- Anschreiben wird clientseitig per KI generiert und als Parameter übergeben

### Betroffene Dateien
| Datei | Änderung |
|-------|----------|
| `BillingSettlement.tsx` | Closing-Balance-Berechnung, SOLL/IST-Toggle, KI-Zusammenfassung |
| `BookingReviewSection.tsx` | KI-Anomalie-Prüfung pro Konto |
| `AccrualSection.tsx` | KI-Abgrenzungsvorschlag |
| `generate-billing-pdf/index.ts` | Anschreiben-Seite |
| `analyze-billing/index.ts` | Neue Modi: booking_review, accrual_suggestion, settlement_summary, cover_letter |

### Empfohlene Reihenfolge
1. **Closing-Balance-Fix** — ohne das stimmt die Kontrolle nicht
2. **SOLL/IST-Toggle** — für korrekte Einzelabrechnungen
3. **KI-Buchungsprüfung** — größter Zeitgewinn
4. **KI-Abgrenzungsvorschlag** — reduziert Fehler
5. **KI-Zusammenfassung + Anschreiben** — Profi-Output

