## Ziel

Beim Buchen im Kontoauszug (`TransactionReviewMode`) darf der Betrag **nie automatisch** verändert werden — weder vom KI-Vorschlag noch von Vorlagen/Rechnungen. Manuelles Überschreiben bleibt möglich (für Splits), aber der Originalbetrag bleibt klein sichtbar und beim Buchen erscheint eine harte Warnung, wenn Summe ≠ Bankposition.

## Betroffene Datei

`src/components/finance/TransactionReviewMode.tsx` (einzige Stelle, die alle Wege bündelt: KI-Übernahme, Vorlagen-/Rechnungs-Auto-Fill, Positions-Selektion, Buchen).

## Aktueller Stand (kurz)

- `createDefaultRow` setzt `amount` initial korrekt auf `|txn.amount|` (Z. 420). ✓
- Vorlagen-/Rechnungs-Auto-Fill (Z. 511–552) fasst `amount` **nicht** an. ✓ (wird abgesichert)
- KI-Single-Mode (Z. 766–822) fasst `amount` **nicht** an. ✓
- KI-Split-Mode (Z. 703–763, Z. 708/721): überschreibt `amount` pro Zeile mit `s.amount` oder `absAmount / sb.length`. ⚠️
- `applySelectionToRow` (Z. 865–886): setzt `amount = Summe der angeklickten Positionen`. ⚠️ Das ändert den Betrag automatisch.
- Buchen-Pfad (Z. 999+ Single, Z. 1007+ Split): **keinerlei** Prüfung, ob `Σ row.amount == |txn.amount|`.

## Änderungen

### 1. Original-Betrag pro Zeile mitführen
- Neues Feld `original_txn_amount: number` in `BookingRowData`.
- In `createDefaultRow`, `applyAiSuggestion` (Single + Split), `addSplitRow`, `createNewBookingFromSelection` immer mit `Math.abs(currentTxn.amount)` befüllen.
- Wird nur einmal beim Anlegen der Zeile gesetzt, nie überschrieben.

### 2. Automatisches Überschreiben unterbinden

**Vorlagen/Rechnungen (Single-Auto-Fill, Z. 511–552):**
Defensiv ein Kommentar + expliziter Schutz: `row.amount` wird hier **nie** angefasst. (Aktueller Code hält das schon ein — wird per Kommentar fixiert und ein eventueller späterer Fehler durch einen Guard im `useEffect` verhindert: wenn `row.amount` schon gesetzt ist, nie überschreiben.)

**KI-Single (Z. 766+):** unverändert (rührt `amount` nicht an), nur Kommentar.

**KI-Split (Z. 703+):** Bleibt funktional (Splits müssen Beträge verteilen), aber:
- Statt `absAmount / sb.length` Fallback wird **kein** auto-verteilter Betrag mehr gesetzt — Zellen ohne `s.amount` bekommen `"0.00"` und müssen vom Nutzer befüllt werden.
- `original_txn_amount` wird pro Zeile gesetzt.
- Sicherheitscheck am Ende: wenn `Σ rowAmount ≠ absAmount`, Toast-Hinweis (kein Block, da Split absichtlich).

**`applySelectionToRow` (Positions-Klick, Z. 865+):**
- Schreibt **nicht mehr** in `row.amount`.
- Aktualisiert weiterhin `line_items_detail` / `amount_35a` und Text.
- Wenn der Nutzer den Positionsbetrag tatsächlich übernehmen will, gibt es einen neuen kleinen Button „Summe in Betrag übernehmen" direkt unter dem Betragsfeld.

### 3. UI: Originalbetrag immer sichtbar

Direkt **über** dem großen Betrag-Input (Z. 2382+) ein kleines Label:

```
Bankposition: −245,80 €      [✓ stimmt | ⚠ Abweichung: +12,00 €]
```

- Bei Single-Row wird das Label nur angezeigt, wenn `parseAmount(row.amount) !== row.original_txn_amount`.
- Bei Split-Rows (`formRows.length > 1`) immer sichtbar, plus rechts kleiner Live-Counter „Summe Splits: 245,80 / 245,80 €" über der Zeilenliste.
- Bei Abweichung: rotes Border am Input, Hinweis-Text in `text-destructive`.

### 4. Harte Warnung beim Buchen

In `handleBookSingle` (vor `setBookingSingle(rowId)`, Z. 998):

```
const txnAbs = Math.abs(currentTxn.amount);
const rowSum = formRows.reduce((s, r) => s + (parseAmount(r.amount) || 0), 0);
const diff = +(rowSum - txnAbs).toFixed(2);

if (Math.abs(diff) > 0.01) {
  // AlertDialog statt Confirm — bewusst zwei Klicks nötig
  setMismatchDialog({ rowId, txnAbs, rowSum, diff });
  return;
}
```

Neuer `<AlertDialog>` mit:
- Titel: „Betrag weicht von der Bankposition ab"
- Body: Bankposition, Buchungssumme, **Differenz fett rot**, Liste aller Zeilenbeträge.
- Roter Bestätigungs-Button: „Trotzdem buchen" — erst dann ruft er `proceedBooking(rowId)` auf.
- Cancel-Button (Default-Fokus).

Gilt für Single **und** Split (Split: Prüfung erst beim letzten Buchen-Klick, also im `if (allBooked)`-Zweig vor dem RPC-Aufruf um Z. 1029).

### 5. Manueller Override bleibt
- Betrag-Input bleibt editierbar.
- Beim manuellen Ändern wird `original_txn_amount` **nicht** überschrieben → das kleine Label und die Warnung greifen.

## Edge Cases
- Mehrere Banktransaktionen, die nach Wechsel zur nächsten: `original_txn_amount` wird beim Aufbau neuer Rows in `useEffect`/`createDefaultRow` neu aus `currentTxn.amount` gezogen.
- §35a-Anteil und MwSt bleiben von der Änderung unberührt (sie ändern `amount` ohnehin nicht).
- Storno/Update einer bereits gebuchten Zeile (`isUpdate`): gleiche Prüfung läuft, da `formRows` zum Zeitpunkt des Bestätigens identisch behandelt wird.

## Akzeptanzkriterien

1. Klick auf „KI-Vorschlag übernehmen (Single)" oder Auswahl einer Vorlage/Rechnung → `row.amount` bleibt exakt auf dem Bank-Betrag.
2. Klick auf Rechnungspositionen ändert den Betrag **nicht** mehr (nur über expliziten neuen Button).
3. Bei Splits zeigt die UI permanent Bankposition + Live-Summe.
4. Bei jeder Abweichung > 1 Cent erscheint vor dem Buchen ein blockierender AlertDialog mit klarer Differenz; Buchen erst nach zweitem bewussten Klick möglich.
5. Originalbetrag steht klein über dem Betragsfeld, sobald die Zeile vom Original abweicht (oder immer bei Splits).
