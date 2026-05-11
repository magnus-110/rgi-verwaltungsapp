## Beobachtung

Aus DB-Check: Die Buchung im Screenshot (`Markus Reithemann Re. Nr. 250573 Streusalz`) hat in der Datenbank:
- `split_parts_total = 2`, `split_part = 2`
- `invoice_id` gesetzt, gleiche `invoice_id` wie ein zweites Booking („11/25 Winterdienst …")
- `invoices.file_path = f7267…/1777970159191_Scan2026-04-24_163122.pdf` (Datei existiert im Bucket-Pfad)

Trotzdem zeigt das UI weder die Splitsektion noch das PDF an. Zwei unabhängige Ursachen.

## Ursache 1: React-Query-Cache hält alte Spalten

`useQuery` in `CashAuditAccountSheet.tsx` und `CashAuditJournal.tsx` nutzt den Key `["audit-bookings", buildingId, fiscalYear, …]`. Beim Hinzufügen von `split_part, split_parts_total` zur SELECT-Liste hat sich der Key nicht geändert. Solange die App offen war und React-Query die Daten aus dem In-Memory-Cache liefert (z. B. weil dieselbe Komponente bereits einmal eingehängt war), enthalten die Buchungs-Objekte die neuen Felder nicht → `isSplit` bleibt `false` → keine Splitsektion.

**Fix**: Cache-Key bumpen, damit alte Einträge invalidiert werden.

```ts
queryKey: ["audit-bookings-v2", buildingId, fiscalYear, tokenMode ? token : "auth"]
```

In beiden Dateien:
- `src/components/finance/CashAuditAccountSheet.tsx`
- `src/components/finance/CashAuditJournal.tsx`

## Ursache 2: PDF lädt nicht

Wahrscheinlich liefert `supabase.storage.from("invoices").createSignedUrl(cleanPath, 3600)` für diese Datei einen Fehler (z. B. weil die path-Bereinigungslogik etwas wegsplittet, was nicht weg darf, oder weil der signed URL silently fehlschlägt). Aktuell wird der Fehler verschluckt:

```ts
const { data } = await supabase.storage.from("invoices").createSignedUrl(cleanPath, 3600);
if (!cancelled && data?.signedUrl) setPdfUrl(data.signedUrl);
```

**Fix in `src/components/finance/BookingReviewDialog.tsx`** (PDF-useEffect):

1. Fehler aus `createSignedUrl` destrukturieren und in der State festhalten:
   ```ts
   const [pdfError, setPdfError] = useState<string | null>(null);
   …
   const { data, error } = await supabase.storage.from("invoices").createSignedUrl(cleanPath, 3600);
   if (cancelled) return;
   if (error || !data?.signedUrl) {
     setPdfError(error?.message || "Signed URL leer");
     console.warn("[BookingReviewDialog] signed URL failed", { cleanPath, error });
   } else {
     setPdfUrl(data.signedUrl);
   }
   setPdfLoading(false);
   ```

2. Fallback-Anzeige um den Fehler ergänzen, damit wir bei der nächsten Beobachtung sofort sehen, woran es liegt:
   ```tsx
   <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground p-6 text-center">
     Beleg konnte nicht geladen werden.{pdfError && <><br/><span className="text-xs">{pdfError}</span></>}
   </div>
   ```

3. Path-Bereinigung defensiver: nur ein einzelnes führendes `invoices/` entfernen, kein Mehrfach-Strip:
   ```ts
   const raw = booking.invoices!.file_path!;
   const cleanPath = raw.startsWith("invoices/") ? raw.slice("invoices/".length) : raw.replace(/^\/+/, "");
   ```

## Robustere Split-Erkennung (bonus, gleiche Datei)

Zusätzlich Splitgruppen erkennen, auch wenn `split_parts_total` (noch) nicht gesetzt ist – über Geschwister-Anzahl:

```ts
const siblingsCount = siblings?.length ?? 0;
const isSplit =
  !!(booking?.split_parts_total && booking.split_parts_total > 1) ||
  siblingsCount > 1;
```

Außerdem die Sibling-Query unabhängig von `isSplit` ausführen, sobald `booking.invoice_id` existiert, und erst nach Eintreffen der Daten entscheiden, ob die Splitsektion sichtbar wird (`siblings.length > 1`). Dadurch werden auch Altbestand-Splits ohne `split_parts_total` korrekt angezeigt.

Anzeige der Kennzahl „X von Y" fällt auf `siblings.length` zurück, wenn `split_parts_total`/`split_part` fehlen:

```ts
const total = booking.split_parts_total ?? siblings?.length ?? 0;
const part  = booking.split_part ?? (siblings?.findIndex(s => s.id === booking.id) ?? -1) + 1;
```

## Geänderte Dateien

- `src/components/finance/CashAuditAccountSheet.tsx` – queryKey bumpen
- `src/components/finance/CashAuditJournal.tsx` – queryKey bumpen
- `src/components/finance/BookingReviewDialog.tsx` – PDF-Error sichtbar machen, Path-Bereinigung defensiver, Split-Erkennung über Sibling-Count erweitern

## Nicht im Scope

- Keine DB-Migrationen.
- Keine Änderungen an `BookingsTab` / Make.com-Logik.
