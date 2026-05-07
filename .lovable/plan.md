## Befund

Ich bin mit den bisherigen Änderungen nur eingeschränkt sicher: Der lokale Test beweist, dass Browser/Windows Notifications anzeigen kann. Die Datenbank zeigt aber, dass der Server-Test zwar `sent` meldet, der Service Worker aber offenbar keinen Push empfängt. Das spricht gegen reine Windows-/Chrome-Berechtigungen und eher für eine der folgenden echten Ursachen:

1. VAPID-Key-Paar passt nicht exakt zur Subscription oder wurde zwischenzeitlich gewechselt.
2. Die App sendet an alte/mehrfache Subscriptions desselben Users; `sent` heißt bei FCM nur angenommen, nicht sichtbar zugestellt.
3. Der Server-Test nutzt eine zu schwache Erfolgsmessung: Er zählt Annahme durch FCM als Erfolg, ohne Empfang im Service Worker nachzuweisen.
4. Der sichtbare Preview-Test läuft nicht in derselben eingeloggten Browser-Session, daher konnte ich die UI-Diagnostik nicht direkt auslesen.

Konkrete Signale aus der Prüfung:

- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` sind vorhanden.
- `get-vapid-public-key` liefert einen Public Key.
- `send-push` hat keine 401/403/410 Fehler geloggt.
- `notification_log` zeigt Test-Pushes mit `sent_count` 2 bis 3.
- Es existieren aktuell 3 aktive Push-Subscriptions für denselben User, davon 2 Windows/Chrome und 1 Android.
- Die letzten Server-Tests wurden laut DB an alle diese Subscriptions gesendet.

## Plan zur echten Fehlerbehebung

### 1. Server-Test nicht mehr nur als „gesendet“ bewerten
- `send-push` soll pro Subscription zusätzlich sichere Debug-Metadaten zurückgeben:
  - Endpoint-Hash statt Endpoint im Klartext
  - Gerät/Browser-Label
  - `last_used_at`
  - HTTP-Status vom Push-Dienst
  - VAPID-Public-Key-Fingerprint, nicht den Key selbst
- In der Settings-UI wird angezeigt, an welches Gerät der Test wirklich ging.

### 2. VAPID-Key-Mismatch eindeutig ausschließen
- Beim Erstellen einer Subscription wird ein Hash/Fingerprint des aktuell vom Client geladenen VAPID Public Keys in `push_subscriptions` gespeichert.
- `send-push` vergleicht diesen gespeicherten Fingerprint mit dem aktuellen Server-VAPID-Fingerprint.
- Wenn sie nicht übereinstimmen, wird die Subscription nicht als „gesund“ angezeigt und die UI fordert eine Neu-Registrierung.

### 3. Alte/defekte Subscriptions bereinigen
- Beim Aktivieren oder „Service Worker neu registrieren“ werden nicht nur lokale Subscriptions gelöscht, sondern auch alle bisherigen Subscriptions dieses Users für denselben Browser/Device-Kontext bereinigt.
- Optional: Subscriptions ohne passenden VAPID-Fingerprint werden automatisch entfernt.

### 4. Empfangsnachweis in der UI sauber machen
- Der Service Worker behält `lastPushReceived`, `lastPushShown` und Fehler in einem kleinen Cache.
- Die Settings-UI fragt diesen Status aktiv ab, statt nur auf Live-`postMessage` zu warten. Dadurch sieht man auch dann den Empfang, wenn der Push ankam, während die React-Komponente gerade neu gerendert wurde.

### 5. Edge Function härten
- `send-push` soll zwischen folgenden Zuständen unterscheiden:
  - `sent` = Push-Dienst hat angenommen
  - `failed:401/403` = VAPID/Auth-Problem
  - `failed:404/410` = Subscription tot und gelöscht
  - `mismatch` = Subscription wurde mit anderem VAPID-Key erzeugt
  - `no_subscription`
- Test-Pushes bleiben dedup-frei genug, damit Wiederholungen nicht blockiert werden.

### 6. Validierung nach Umsetzung
- Edge Functions deployen/testen.
- DB-Abfrage prüfen: Subscriptions enthalten Fingerprint und nur aktuelle Geräte bleiben übrig.
- Server-Test ausführen und prüfen, ob die Antwort pro Gerät den korrekten Zustand zeigt.

## Einschätzung

Aktuell halte ich einen VAPID-/Subscription-Mismatch oder veraltete Mehrfach-Subscriptions für die wahrscheinlichste Ursache. Dass FCM `sent` liefert, macht einen komplett falschen Private Key weniger wahrscheinlich, schließt aber einen Subscription-/Key-Wechsel oder ein Zustellproblem an die aktuelle Browser-Instanz nicht sicher aus.