## Problem

Auf dem Admin-Dashboard zeigt das KPI „Neue E-Mails" bei Magnus 4 ungelesene Mails an, obwohl er für seine 3 abonnierten Postfächer 0 ungelesene hat.

## Ursache

Die RPC `get_dashboard_global_stats` filtert serverseitig bereits korrekt nach `in_app_email_subscriptions` des aufrufenden Users (per `auth.uid()`).

Der Bug liegt im Frontend-Cache: in `src/pages/Dashboard.tsx` ist der React-Query-Key

```ts
queryKey: ["dashboard-global-stats", managementMode]
```

— er enthält **nicht** die User-ID. Wenn vorher ein anderer Admin (z. B. Regina, mit Abos auf das Konto mit 4 ungelesenen Mails) im selben Browser eingeloggt war, liefert der Cache nach Login-Wechsel weiterhin dessen Stats an Magnus aus, bis nach 60 s neu gefetcht wird oder der Cache gelöscht wird. Genauso betroffen ist `dashboard-portfolio-totals`.

## Änderungen

**`src/pages/Dashboard.tsx`**
- `user?.id` aus `useAuth` ziehen (ist bereits importiert, nur `profile` wird aktuell genutzt) und in beide Query-Keys aufnehmen:
  - `["dashboard-global-stats", user?.id, managementMode]`
  - `["dashboard-portfolio-totals", user?.id]`
- Queries via `enabled: !!user?.id` absichern, damit kein Request ohne User feuert.

**`src/hooks/useAuth.tsx`** (nur falls noch nicht vorhanden)
- Beim Sign-out `queryClient.clear()` aufrufen, damit auch andere user-spezifische Caches (Postfach, Todos etc.) nicht an den nächsten Login durchsickern. Diesen Punkt nur umsetzen, wenn beim Inspizieren kein bestehendes Clear existiert; sonst weglassen.

## Out of scope

- Die RPC selbst bleibt unverändert — sie filtert bereits korrekt nach `in_app_email_subscriptions` + Eingang-Folder + `is_read=false`.
- Keine UI-/Designänderungen.

## Verifikation

1. Als Regina einloggen → Dashboard zeigt 4 neue Mails.
2. Ausloggen, als Magnus einloggen → KPI „Neue E-Mails" zeigt sofort 0 (statt erst nach 60 s Refetch).
3. Magnus abonniert ein Postfach mit ungelesenen Mails → KPI aktualisiert sich beim nächsten Refetch.
