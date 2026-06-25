## Ursache

Die 8 Anhänge sind im Storage vorhanden, aber **bitweise kaputt geschrieben**. Die JPG-Datei beginnt mit `C3 BF C3 98 C3 BF C3 A1…` statt mit dem JPEG-Magic `FF D8 FF E1…` — also eine zerstörte UTF‑8/Latin‑1-Re-Encodierung der Originalbytes. Dadurch öffnet sie kein Bild-/PDF-Viewer.

**Wer hat die Bytes kaputt gemacht?** Beim letzten Encoding-Fix wurde in `supabase/functions/fetch-emails/index.ts` (`downloadAttachmentsFromStructure`) für `encoding === "base64" | "quoted-printable"` ein Re-Decode hinzugefügt:

```
const encoding = String(node?.encoding || "").toLowerCase();
if (encoding === "base64" || encoding === "quoted-printable") {
  merged = decodeContent(bytesToLatin1(rawMerged), encoding);  // ← korrumpiert
}
```

`ImapFlow.download(uid, part)` liefert die Part-Inhalte aber **bereits transfer-decoded** (Binär für base64, Text für QP). Unser zusätzlicher Decode interpretiert die fertigen Binärbytes als Latin‑1-Text, `atob` schlägt fehl, der Fallback (`TextEncoder.encode(body)`) re-encodet die Latin‑1-Zeichen als UTF‑8 → JPGs/PDFs/XLSX sind ab Byte 0 zerstört. Dasselbe gilt analog für `decodeTextBytes`, wo der Text-Body unnötig nochmal durch `decodeTextContent` gejagt wird (führt zu denselben Mojibake-Fällen, die wir vorher schon repariert haben).

## Dauerhafter Fix

**Datei:** `supabase/functions/fetch-emails/index.ts`

1. **`downloadAttachmentsFromStructure`** — Re-Decode entfernen, Originalbytes von ImapFlow direkt verwenden:
   ```ts
   const { bytes: merged, truncated } = await streamPartToBytes(...);
   // KEIN bytesToLatin1/decodeContent mehr.
   ```
2. **`decodeTextBytes`** — den `base64/quoted-printable`-Zweig entfernen. ImapFlow liefert auch Text-Parts bereits decoded; wir brauchen nur noch den Charset-Decode (`decodeBytesWithCharset` + `repairMojibake`), der ohnehin schon im Fallback steht.
3. **`reparseSingleEmail`** – nutzt bereits `downloadAttachmentsFromStructure`; durch Fix 1 werden alle Re-Parses ab sofort korrekt geschrieben.

## Reparatur der bereits gespeicherten Anhänge

Re-Parse der einen betroffenen E-Mail (Hann ./. Gebäudeversicherung, ID `c4af4665…`) per `fetch-emails`-Action `reparse`, wodurch die 8 Storage-Objekte mit korrekten Bytes überschrieben werden. Dasselbe Verfahren ist auch für die zweite betroffene E-Mail (Arthrex, ID `147124b0…`) anwendbar.

Falls bei weiteren E-Mails der letzten Tage noch kaputte Anhänge gefunden werden, kann ich nach dem Codefix ein kleines Batch-Re-Parse über alle `email_attachments` der letzten 48 h auslösen.

## Aus dem Fix ausgeschlossen

- Frontend (`EmailAttachments.tsx`, `AttachmentPreviewDialog.tsx`) — funktioniert; das Problem liegt rein in den falsch geschriebenen Bytes.
- Storage-RLS, Bucket-Konfiguration, Signed-URL-Logik — alle in Ordnung (HTTP 200 verifiziert).
