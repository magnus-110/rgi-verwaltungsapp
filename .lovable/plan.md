## Ziel

Anhänge bei E-Mails wie der von Gayer-Lesti (04.05., 17:42) zuverlässig erkennen und speichern, statt sie stillschweigend zu verlieren.

## Schritte

### 1. MIME-Parser in `supabase/functions/fetch-emails/index.ts` härten

- **Header-Folding korrekt auflösen**: vor jedem `getHeader`-Lookup Zeilen, die mit Whitespace beginnen, an die vorhergehende Zeile anhängen (RFC 5322 §2.2.3). Behebt verlorene `boundary="..."`- und `filename="..."`-Werte.
- **Boundary strikt pro MIME-Ebene** verwenden: `splitByBoundary` mit Regex `^--<boundary>(--)?\s*$` (multiline) statt `String.split` — verhindert Kollisionen mit Boundaries innerer Parts.
- **`message/rfc822`** als rekursiv zu parsenden Container behandeln (nicht als Anhang verwerfen, sondern Inhalt weiterverarbeiten und das Objekt zusätzlich als `.eml`-Anhang ablegen).
- **Decoding robuster**: bei `base64` Whitespace/Zeilenumbrüche entfernen, bei `quoted-printable` `=\r\n` und `=\n` als Soft-Breaks behandeln.
- **Filename**: zusätzlich RFC 2231 (`filename*=UTF-8''…`) und MIME-Encoded-Words (`=?UTF-8?…?=`) dekodieren.

### 2. Fallback über `bodyStructure`

Wenn nach dem MIME-Parsing `attachments.length === 0`, aber `checkHasAttachments(msg.bodyStructure) === true`:
- Pro Part-Pfad in `bodyStructure` einen gezielten `client.download(uid, partPath)` ausführen und die Bytes als Anhang speichern.
- Damit werden Anhänge auch dann gerettet, wenn unser Source-Parser an einer Edge-Case-Konstellation scheitert.

### 3. Logging & Diagnose

- Beim Insert eines Mails zusätzlich loggen, wenn `bodyStructure` Anhänge meldet, der Parser aber 0 fand (Warnung mit UID + Subject).
- Einmaligen Diagnose-Endpoint (intern, nur in dieser Function) `?reparse=<emailId>` bauen, der für eine bereits importierte Mail die IMAP-Source erneut zieht und den neuen Parser anwirft. So lässt sich die Gayer-Lesti-Mail (und vergleichbare Altfälle) ohne kompletten Reimport nachträglich reparieren.

### 4. Konkrete Reparatur dieser Mail

- Nach Deployment: `?reparse=29f3dedf-8731-4a4e-94fe-f192664d5c6d` aufrufen.
- Prüfen: Anhang („unterschriebenes Protokoll", vermutlich PDF) erscheint, `has_attachments=true`, sichtbar im UI.

## Technische Details

- Datei: `supabase/functions/fetch-emails/index.ts` (Funktionen `parseMimePart`, `splitByBoundary`, `getHeader`, `extractFilename`, `decodeContent`).
- Keine DB-Schemaänderungen nötig.
- Keine UI-Änderungen nötig — `EmailAttachments.tsx` zeigt nicht-inline Anhänge bereits korrekt an, sobald sie in `email_attachments` mit `is_inline=false` liegen.
- Reparse-Endpoint wird mit Service-Role-Check gesichert (Header `x-admin-key` gegen Supabase-Secret), damit kein öffentlicher Aufruf möglich ist.

## Risiken / Hinweise

- IMAP-Verbindung muss für `reparse` denselben UID noch sehen (Strato hält Mails im Posteingang — passt).
- Bei Boundary-Regex-Umstellung kurz mit 2–3 weiteren importierten Mails gegenchecken, dass keine bestehenden Imports rückwärts brechen (Logging in Schritt 3 hilft).
