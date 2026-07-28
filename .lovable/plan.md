## Ziel
Im Admin-Sidebar neben "Meldungen" ein Zahlen-Badge anzeigen, das die Anzahl offener Meldungen (status = "open") enthält.

## Umsetzung
1. **Neuer Hook `src/hooks/useOpenReportsCount.ts`**
   - Query auf `reports`-Tabelle mit `select('id', { count: 'exact', head: true }).eq('status', 'open')`.
   - Supabase Realtime-Channel auf `reports` (INSERT/UPDATE/DELETE) → Refetch bei Änderungen.
   - Rückgabe: `count: number`.

2. **`src/components/AdminSidebar.tsx`**
   - Hook aufrufen (nur wenn Admin-Menü aktiv, nicht im Broker-Mode).
   - Beim Menüpunkt "Meldungen" (`/tickets`) rechts einen kleinen roten Badge (`bg-destructive text-white`, rund, min-w-5, text-xs) mit der Zahl anzeigen, wenn `count > 0`.
   - Im collapsed State: kleiner Punkt oben rechts am Icon.

## Details
- Keine DB-Änderung nötig; RLS auf `reports` erlaubt Admins bereits Lesezugriff.
- Badge nur bei `count > 0` rendern, bei >99 → "99+".
