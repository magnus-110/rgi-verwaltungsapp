
Ziel: Den kompletten Flow stabil machen, damit die KI nicht mehr hängt und genau dein gewünschtes Szenario sauber abbildet:
1. Kontoauszug importieren
2. Rechnungen/Vorlagen automatisch matchen
3. später hochgeladene Rechnungen oder neue Vorlagen automatisch nachmatchen
4. bei gematchten Rechnungen die Buchungsmaske vollständig vorfüllen
5. bei offenen Transaktionen sinnvolle Match-, Buchungs- und Vorlagenvorschläge liefern

Kurzbefund nach Prüfung:
- Das aktuelle Hängen bei `KI analysiert 0/33` passt zum Prefetch-Flow in `useTransactionAiPrefetch.ts`: Die Analyse läuft batchweise, aber ohne harten Timeout pro `suggest-match`-Aufruf. Wenn ein erster Batch hängen bleibt, bleibt die Anzeige bei `0/x`.
- Der Matching-Lebenszyklus ist noch nicht geschlossen:
  - `parse-bank-statement` matched nur beim XML-Import oder manuellem Rematch.
  - `extract-invoice` verarbeitet OCR, stößt danach aber kein automatisches Rematching offener Banktransaktionen an.
  - Beim Erstellen neuer Vorlagen wird nur die aktuelle Transaktion verknüpft, nicht automatisch erneut über ähnliche offene Buchungen gematcht.
- Die KI-Kontexte sind inkonsistent:
  - Prefetch übergibt reichhaltigen Kontext.
  - `TransactionReviewMode` beim manuellen Neu-Analysieren und `AssignmentDialog` übergeben deutlich weniger Kontext.
  - Dadurch fehlen oft Gegenkonto, §35a oder bessere Buchungshinweise gerade in den Fällen, wo manuell nachgesteuert wird.
- Die Zusammenführung Rechnung + KI ist schon teilweise verbessert, muss aber konsequent für alle relevanten Felder und Sonderfälle gelten.

Umsetzungsplan:
1. Prefetch robust gegen Hänger machen
- `useTransactionAiPrefetch.ts` so umbauen, dass einzelne `suggest-match`-Calls einen klaren Timeout bekommen.
- Batch-Größe reduzieren und Fehler/Timeouts pro Transaktion sauber weiterzählen statt den gesamten Lauf zu blockieren.
- Fortschritt so belassen, dass immer `completed/total` hochzählt.
- Stalled/Timeout-Fälle sichtbar machen, damit die Anzeige nicht ewig bei `0/x` steht.

2. Einheitlichen KI-Analyse-Context bauen
- Eine gemeinsame Hilfslogik für den `suggest-match`-Payload einführen.
- Diese Logik in allen 3 Einstiegspunkten verwenden:
  - `useTransactionAiPrefetch`
  - `TransactionReviewMode` (`rerunAiAnalysis`)
  - `AssignmentDialog`
- Immer mitsenden:
  - Kontenrahmen
  - Wirtschaftsjahre
  - liegenschaftsspezifische Buchungshinweise
  - historische Buchungen
  - Rechnungs-/Vorlagenkandidaten
  - relevante offene Transaktionen derselben Liegenschaft

3. Automatisches Nachmatchen nach neuen Rechnungen/Vorlagen
- Nach erfolgreicher OCR in `extract-invoice` automatisch einen zielgerichteten Rematch für offene Transaktionen der betroffenen Liegenschaft auslösen.
- Nach neu erstellter Vorlage ebenfalls passende offene Transaktionen erneut prüfen.
- Nach manueller Rechnungszuordnung die bestehende `ai_suggestion` für diese Transaktion zurücksetzen und sofort neu analysieren, damit die Buchungsmaske danach vollständig ist.

4. Buchungsmaske für Rechnungs-Matches vollständig befüllen
- In `TransactionReviewMode.tsx` Rechnung und KI konsequent zusammenführen:
  - Rechnung = Belegdaten
  - KI = Gegenkonto, Buchungstyp, §35a, `amount_35a`, Fiskaljahr, Erklärung
- Auflösung in dieser Reihenfolge:
  - `invoice.suggested_account_id`
  - `ai.booking_hint.suggested_bookings[0].account_id`
  - `account_number` / `counter_account_number` gegen Kontenrahmen auflösen
- Auch `related_invoice_id`, `related_template_id`, Split-/Teilzahlungsfälle sauber mappen.

5. Offene Transaktionen intelligenter behandeln
- Für ungematchte Transaktionen soll die KI immer drei Dinge liefern bzw. anzeigen, wenn vorhanden:
  - beste Rechnungs-/Vorlagenkandidaten
  - Buchungsvorschlag mit Gegenkonto/§35a/Fiskaljahr
  - Vorlagenvorschlag oder Hinweis „Rechnung fehlt“
- So bleibt der Human-in-the-loop-Workflow erhalten: Die KI analysiert, der Nutzer prüft.

6. Robusten Kostenschutz ergänzen
- Nicht nur clientseitig begrenzen, sondern dauerhaft auf Transaktionsebene absichern.
- Dazu DB-gestützte Analyse-Metadaten ergänzen, z. B.:
  - Analyse-Status
  - letzter Analysezeitpunkt
  - Anzahl Versuche
  - Cooldown / Sperre nach mehreren Fehlern
- So verhindern wir, dass Reloads, Rematchs oder Bugs dieselben Transaktionen unendlich oft neu anstoßen.

Technische Details / betroffene Dateien:
- `src/hooks/useTransactionAiPrefetch.ts`
  - Timeout, Batch-Strategie, Fortschritt, Fehlerbehandlung
- `src/components/finance/TransactionReviewMode.tsx`
  - vollständiges Merge Rechnung + KI
  - konsistenter Einzel-Rerun mit vollem Kontext
- `src/components/finance/AssignmentDialog.tsx`
  - gleiche KI-Qualität wie im Prefetch
  - bessere Vorschläge für offene Buchungen
- `src/components/finance/BankStatementsTab.tsx`
  - Rematch-/Reset-Trigger nach manuellen Zuordnungen / neuen Vorlagen
- `supabase/functions/extract-invoice/index.ts`
  - nach OCR automatisch Folgematching anstoßen
- `supabase/functions/parse-bank-statement/index.ts`
  - zielgerichteten Rematch-Fluss erweitern
- `supabase/functions/suggest-match/index.ts`
  - optional auf Performance/Antwortzeit trimmen, falls nötig
- `supabase/migrations/*`
  - falls wir den dauerhaften Kostenschutz mit Analyse-Statusfeldern sauber absichern

Erwartetes Ergebnis:
- Die KI-Anzeige hängt nicht mehr bei `0/x`.
- Beim Import eines Kontoauszugs werden passende Rechnungen/Vorlagen automatisch gematcht.
- Neu hochgeladene Rechnungen und neu erstellte Vorlagen führen danach automatisch zu neuem Matching offener Buchungen.
- Bei gematchten Rechnungen wird die Buchungsmaske vollständig vorbelegt, besonders Gegenkonto und §35a.
- Bei offenen Buchungen zeigt die KI nachvollziehbare Kandidaten, Buchungsvorschläge und ggf. Vorlagenvorschläge.
- API-Kosten sind gegen Endlosschleifen deutlich besser abgesichert.

QA nach Umsetzung:
- XML importieren → automatische Matches erscheinen.
- Danach neue Rechnung hochladen → offene passende Transaktion wird automatisch nachgematcht.
- Neue Vorlage erstellen → ähnliche offene Transaktionen werden erneut geprüft.
- Gematchte Rechnung ohne `suggested_account_id` → Gegenkonto kommt trotzdem aus KI.
- Hausmeister/Winterdienst → §35a und Betrag werden vorbelegt.
- Offene Buchung ohne Match → Kandidaten + Buchungsvorschlag + ggf. Vorlagenvorschlag sichtbar.
- Fehler-/Timeout-Fall → KI-Anzeige bleibt nicht hängen, sondern zählt weiter bzw. zeigt Abbruch sauber an.
