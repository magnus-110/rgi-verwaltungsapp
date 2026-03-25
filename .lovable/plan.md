

# Plan: Encoding-Fix, Konto-Filter, Kuerzel & E-Mail-Zuordnung

## 1. Encoding-Fix in fetch-emails Edge Function

**Problem**: `decodeTextContent` fuer base64 nutzt `atob()`, was Latin-1 zurueckgibt. Bei UTF-8-kodierten E-Mails (z.B. "Göttinger") werden Multi-Byte-Zeichen als Mojibake angezeigt ("GÃ¶ttinger"). Ebenso dekodiert `decodeQuotedPrintable` Bytes via `String.fromCharCode`, was bei UTF-8 nicht funktioniert.

**Loesung**:
- `decodeTextContent` bei base64: Zuerst in `Uint8Array` dekodieren, dann mit `TextDecoder("utf-8")` in String wandeln. Charset aus Content-Type-Header extrahieren und an TextDecoder uebergeben (Fallback: UTF-8)
- `decodeQuotedPrintable`: Ebenfalls Bytes sammeln und mit `TextDecoder` dekodieren statt `String.fromCharCode`
- `decodeCharset` tatsaechlich implementieren: Charset aus Content-Type parsen, `TextDecoder` mit dem Charset verwenden
- `decodeRfc2047`: Base64-Variante ebenfalls mit `TextDecoder` + Charset dekodieren

## 2. Kuerzel-Feld fuer E-Mail-Konten

**DB**: Neues Feld `short_code` (varchar(5), nullable) auf `email_accounts`

**EmailSettingsSection.tsx**: Neues Eingabefeld "Kuerzel" (z.B. "MG", "CF") im Account-Formular

## 3. Kuerzel-Anzeige in der E-Mail-Liste

**Inbox.tsx**: 
- Accounts-Query um `short_code` erweitern
- In jedem E-Mail-Listeneintrag unten rechts das Kuerzel des zugehoerigen Accounts als kleines rundes Badge anzeigen (z.B. farbiger Kreis mit Initialen)
- Nur anzeigen wenn `filterAccountId === "all"` (also kein spezifisches Konto gefiltert)

## 4. E-Mail-Zuordnung (assigned_to)

**DB**: Neues Feld `assigned_to UUID REFERENCES profiles(user_id)` auf `emails`

**Inbox.tsx - E-Mail-Liste**:
- Unten rechts neben dem Kuerzel: kleines Dropdown (Select) fuer Zuordnung
- Zeigt aktuell zugeordnete Person (Initialen) oder leer bei info@-Mails
- Dropdown-Optionen: Alle Admin-Profile + "Keine Zuordnung"
- Bei Aenderung: `emails.assigned_to` updaten

**Inbox.tsx - Filter**:
- Neuer Filter "Nach Zuordnung" in der Suchleiste (Select mit allen Admins)
- Filtert die E-Mail-Liste nach `assigned_to`

## 5. Kontofilter fuer alle Ordner

- Den bestehenden Account-Filter (`filterAccountId`) auch auf Nicht-Archiv-Ordner anwenden (aktuell wird er bereits in der Query genutzt)

## Dateien

| Datei | Aenderung |
|---|---|
| `supabase/functions/fetch-emails/index.ts` | UTF-8-Encoding-Fix in allen Decode-Funktionen |
| Migration SQL | `short_code` und `assigned_to` auf `emails` / `email_accounts` |
| `src/components/email/EmailSettingsSection.tsx` | Kuerzel-Eingabefeld |
| `src/pages/Inbox.tsx` | Kuerzel-Badge, Zuordnungs-Dropdown, Zuordnungs-Filter |

