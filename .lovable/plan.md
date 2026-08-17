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

- Neu: `src/hooks/useBackendHealth.tsx` — leichter Ping (`supabase.auth.getSession()` plus ein minimaler `HEAD`-Select auf eine öffentlich lesbare Tabelle), Zustand `online | degraded | offline`, Backoff-Intervalle, Pause bei `document.hidden`, Reaktion auf `online`/`offline`-Events des Browsers.
- Neu: `src/components/system/BackendStatusBanner.tsx` — Banner mit semantischen Tokens (destructive/warning), Retry-Button, Auto-Ausblenden bei Erholung; eingebunden in `AdminLayout.tsx`, `TenantLayout.tsx`, `WegOwnerLayout.tsx` und `src/pages/Login.tsx`.
- Neu: `src/lib/authErrorMessage.ts` — Mapping von Supabase-Fehlern (`error.status`, `error_code: unexpected_failure`, "Database error", "Failed to fetch") auf deutsche Klartexte; genutzt in `src/hooks/useAuth.tsx` (Zeilen ~213-220) und `src/pages/Login.tsx` (Passkey-Toasts).
- Keine Datenbankänderung nötig.

## Hinweis

Der aktuelle Ausfall selbst lässt sich nur im Supabase-Dashboard beheben (Projektstatus, Neustart, Disk-/Compute-Auslastung). Diese Änderung verhindert den Ausfall nicht, macht ihn aber für alle Nutzer verständlich.
