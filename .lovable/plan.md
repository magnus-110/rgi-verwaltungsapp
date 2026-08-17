# Backend-Ausfall sichtbar machen (Health-Check + Statusbanner)

## Ausgangslage (geprüft)

- Der aktuelle Login-Fehler ist kein App-Fehler: Die Auth-Logs zeigen zwischen 05:34 und 05:38 UTC durchgängig `failed to connect to host=localhost user=supabase_auth_admin database=postgres: connection refused`; direkte SQL-Abfragen scheitern ebenfalls mit `ECONNREFUSED ...:5432`. Der Datenbankserver des Projekts ist also nicht erreichbar.
- Die Anmeldung zeigt heute die rohe Servermeldung an: in `src/hooks/useAuth.tsx` wird `error.message` unverändert als Toast-Beschreibung ausgegeben — daher "Database error querying schema".

## Ziel

Wenn das Backend ausfällt, soll die App das erkennen, verständlich erklären und sich automatisch erholen — statt kryptische Datenbankmeldungen zu zeigen.

## Umsetzung

### 1. Health-Check (sparsam, ereignisgesteuert)

- Kein Dauer-Polling im Normalbetrieb. Geprüft wird nur, wenn ein Auth-/Datenfehler auftritt, der auf einen Serverausfall hindeutet (500/503, "Database error", "Failed to fetch").
- Ist der Ausfall bestätigt, wird nur noch alle 60 s nachgeprüft (und nur bei aktivem Browser-Tab), bis die Verbindung zurück ist. Zusätzlich manuell über "Erneut versuchen".


### 2. Statusbanner

- Ist das Backend nicht erreichbar, erscheint app-weit oben ein auffälliges, aber nicht blockierendes Banner: "Server vorübergehend nicht erreichbar — wir versuchen es automatisch weiter." mit Zeitpunkt des letzten Versuchs und Schaltfläche "Erneut versuchen".
- Sobald die Verbindung zurück ist, verschwindet das Banner automatisch und es erscheint kurz ein Hinweis "Verbindung wiederhergestellt".
- Das Banner erscheint sowohl im Admin-Bereich als auch in den Nutzer-Portalen und auf der Anmeldeseite.

### 3. Verständliche Fehlermeldungen bei der Anmeldung

- Typische Server-/Datenbankfehler ("Database error querying schema", 500/503, Netzwerkfehler) werden in eine klare Meldung übersetzt: "Anmeldung derzeit nicht möglich — der Server ist vorübergehend nicht erreichbar. Bitte in wenigen Minuten erneut versuchen."
- Falsche Zugangsdaten bleiben klar davon getrennt ("E-Mail oder Passwort ist falsch."), damit niemand in die falsche Richtung sucht.
- Gilt gleichermaßen für Passwort-Login und Passkey-Anmeldung.

## Technische Details

- Neu: `src/hooks/useBackendHealth.tsx` — leichter Ping (`HEAD`-Select auf eine öffentlich lesbare Tabelle), Zustände `online | offline`, Prüfung nur nach Fehlerereignis bzw. im 60-s-Takt während eines Ausfalls, Pause bei `document.hidden`, Reaktion auf `online`/`offline`-Events des Browsers.
- Neu: `src/components/system/BackendStatusBanner.tsx` — Banner mit semantischen Tokens (destructive/warning), Retry-Button, Auto-Ausblenden bei Erholung; eingebunden in `AdminLayout.tsx`, `TenantLayout.tsx`, `WegOwnerLayout.tsx` und `src/pages/Login.tsx`.
- Neu: `src/lib/authErrorMessage.ts` — Mapping von Supabase-Fehlern (`error.status`, `error_code: unexpected_failure`, "Database error", "Failed to fetch") auf deutsche Klartexte; genutzt in `src/hooks/useAuth.tsx` (Zeilen ~213-220) und `src/pages/Login.tsx` (Passkey-Toasts).
- Keine Datenbankänderung nötig (wäre derzeit ohnehin nicht möglich).

## Aktueller Supabase-Status (soeben geprüft, 12:33 Uhr)

- REST-API: dauerhaft `503` mit `PGRST002 – Could not query the database for the schema cache. Retrying.`
- Storage-API: `400`, Postgres-Verbindung: `ECONNREFUSED :5432`
- Bedeutung: Nicht PostgREST oder die App ist defekt, sondern die Postgres-Instanz selbst startet nicht bzw. nimmt keine Verbindungen an. Typische Ursachen: volle Disk, Out-of-Memory beim Start, hängender WAL/Recovery-Vorgang.
- Ein Neustart hilft in diesen Fällen erfahrungsgemäß nicht — nötig ist ein Eingriff durch Supabase (Disk vergrößern / Instanz manuell hochfahren). Das kann weder die App noch ich von außen tun; erforderlich ist ein Support-Ticket bei Supabase mit Projekt-Ref `eebphowrbarzawwixqcc`, Fehlercode `PGRST002` und dem Hinweis „Postgres refuses connections, restart does not help“.
- Falls im Dashboard eine Disk-Auslastung nahe 100 % oder eine Compute-Warnung sichtbar ist: Disk vergrößern (das ist der einzige Selbsthilfe-Weg, der ohne DB-Verbindung funktioniert).

