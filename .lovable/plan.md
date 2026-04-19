

## Plan: Live-Abstimmung sofort aufploppen lassen

### Ursache
Die ETV-Tabellen sind nicht in der `supabase_realtime` Publication eingetragen. Der Frontend-Code (`VotingPopup.tsx`) abonniert korrekt `postgres_changes` auf `etv_agenda_items`, aber Postgres verschickt diese Events nicht.

### Umsetzung (eine Migration)

```sql
-- Realtime aktivieren für alle ETV-Tabellen
ALTER PUBLICATION supabase_realtime ADD TABLE 
  public.etv_agenda_items,
  public.etv_votes,
  public.etv_meetings,
  public.etv_attendees;

-- REPLICA IDENTITY FULL → liefert auch alte Werte mit (wichtig für UPDATE-Events)
ALTER TABLE public.etv_agenda_items REPLICA IDENTITY FULL;
ALTER TABLE public.etv_votes REPLICA IDENTITY FULL;
ALTER TABLE public.etv_meetings REPLICA IDENTITY FULL;
ALTER TABLE public.etv_attendees REPLICA IDENTITY FULL;
```

### Wirkung
- Sobald Verwalter „Abstimmung starten" klickt → `etv_agenda_items.status = 'voting'`
- Postgres sendet UPDATE-Event über Realtime
- Auf jedem Handy aller eingeloggten Eigentümer/Bevollmächtigten triggert der bereits vorhandene Listener in `VotingPopup.tsx` sofort den Vollbild-Dialog
- Live-Ergebnisse aktualisieren sich ebenfalls in Echtzeit (etv_votes)
- Auch das Live-Dashboard und die Anwesenheitsliste werden synchron

### Voraussetzungen auf Eigentümer-Seite
- App muss geöffnet sein (Tab/PWA aktiv) — bei geschlossener App helfen nur Push-Notifications
- Stabile Internetverbindung
- Eingeloggt als `weg_owner`

### Keine Code-Änderungen nötig
Der Listener im `WegOwnerLayout` → `VotingPopup` ist bereits korrekt implementiert. Nur die Datenbank-Publication fehlt.

### Geänderte Dateien
| Datei | Änderung |
|---|---|
| Neue Migration | `ALTER PUBLICATION` + `REPLICA IDENTITY FULL` für 4 ETV-Tabellen |

