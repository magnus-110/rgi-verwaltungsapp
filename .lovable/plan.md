

# Plan: Automatische Liegenschaftserkennung aus Rechnung

## Uebersicht

Statt vor dem Upload eine Liegenschaft auszuwaehlen, werden PDFs direkt hochgeladen. Die OCR-Extraktion liest die Adresse/den Empfaenger aus der Rechnung und matcht sie automatisch gegen die `buildings`-Tabelle. Der Nutzer sieht dann die erkannte Liegenschaft und kann sie bei Bedarf korrigieren.

## Aenderungen

### 1. Edge Function `extract-invoice` erweitern

- Neues Tool-Parameter `recipient_address` (string) zum Extrahieren der Empfaengeradresse aus der Rechnung
- Nach Extraktion: Alle Buildings aus DB laden und per Adress-Aehnlichkeit (Teilstring-Match auf `address` und `name`) die passende Liegenschaft finden
- Falls Match gefunden: `building_id` auf der Invoice setzen
- Falls kein Match: `building_id` bleibt null, Nutzer muss manuell zuweisen

### 2. Frontend `InvoiceDropZone` umbauen

- Liegenschafts-Auswahl wird **optional** statt Pflichtfeld
- Upload ohne Building moeglich: `building_id` wird als `null` gespeichert, Storage-Pfad nutzt `unassigned/` Prefix
- Drop-Zone ist immer aktiv, kein `opacity-50` mehr
- Hinweis-Text aendern: "Liegenschaft wird automatisch erkannt"

### 3. `InvoicesTab` / `InvoiceDetailSheet` anpassen

- Rechnungen ohne `building_id` zeigen Badge "Liegenschaft zuweisen" an
- Im Detail-Sheet: Building-Dropdown zum manuellen Zuweisen/Korrigieren
- Filter muss auch `building_id IS NULL` beruecksichtigen (neuer Filter "Nicht zugeordnet")

## Technische Details

**Adress-Matching im Edge Function:**
```text
1. Extrahiere recipient_address aus OCR
2. Lade alle buildings (id, name, address)
3. Fuer jedes Building: pruefe ob address oder name als Teilstring in recipient_address vorkommt
4. Bei eindeutigem Match -> setze building_id
5. Bei mehreren Matches -> nimm den laengsten Match (spezifischster)
6. Bei keinem Match -> building_id bleibt null
```

**Storage-Pfad ohne Building:**
- Bisher: `{building_id}/{timestamp}_{filename}`
- Neu ohne Building: `unassigned/{timestamp}_{filename}`
- Bei spaeterer Zuweisung bleibt der Pfad unveraendert (kein Verschieben noetig)

## Dateien

| Datei | Aenderung |
|---|---|
| `supabase/functions/extract-invoice/index.ts` | `recipient_address` extrahieren, Building-Matching Logik |
| `src/components/finance/InvoiceDropZone.tsx` | Building-Auswahl optional, Upload immer moeglich |
| `src/components/finance/InvoicesTab.tsx` | Filter fuer "Nicht zugeordnet", Badge anzeigen |
| `src/components/finance/InvoiceDetailSheet.tsx` | Building-Zuweisung im Detail |

