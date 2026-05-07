## Befund

Die Server-Seite funktioniert bereits: Es gibt aktive Windows- und Android-Push-Subscriptions, `send-push` loggt erfolgreiche Zustellungen (`sent_count > 0`) und die Browser-Push-Endpunkte werden aktualisiert. Das Problem liegt sehr wahrscheinlich im Client-Empfang bzw. in der Sichtbarkeit der Notification.

Auffällig ist: Der Service Worker zeigt aktuell nur eine Notification an, gibt aber keine belastbare Rückmeldung an die App. Wenn Windows/Chrome/Android die Notification nicht anzeigen, sieht die UI trotzdem nur „Test gesendet“. Außerdem nutzt die App `/favicon.ico` als Icon/Badge; besonders Badge-Icons sind bei Web Push auf Chromium/Android empfindlich und können zu nicht sichtbaren/ignorierten Notifications führen.

## Ziel

Push soll für Windows Chrome und Android Chrome zuverlässig sichtbar werden. Wenn es dennoch vom Browser/OS blockiert wird, soll die Einstellungsseite klar zeigen, wo es scheitert: Registrierung, Permission, Subscription, Serverversand oder Service-Worker-Empfang.

## Umsetzung

1. **Service Worker robuster machen**
   - Push-Payload defensiver parsen.
   - Notification-Optionen Chromium-kompatibel setzen.
   - Kein `.ico` mehr als Badge verwenden, sondern PNG-App-Icons aus `manifest.json`.
   - `renotify`, `timestamp`, `vibrate` und stabile `tag`-Logik ergänzen.
   - Beim Push-Empfang eine Message an offene App-Tabs senden, damit die UI bestätigen kann: „Push wurde vom Service Worker empfangen“.
   - Kaputten `/api/update-push-subscription`-Fetch entfernen/ersetzen, weil es diese API in der clientseitigen App nicht gibt.

2. **Frontend-Subscription stabilisieren**
   - `usePushSubscription` soll explizit prüfen, ob `/sw.js` wirklich registriert und aktiv ist.
   - Bei erneutem Aktivieren vorhandene Subscription sauber wiederverwenden oder erneuern, statt blind neu zu abonnieren.
   - Statusfelder ergänzen: Service Worker bereit, Browser-Permission, Subscription vorhanden, letzter Service-Worker-Push empfangen.
   - Fehler im Aktivierungsprozess verständlich zurückgeben und nicht verschlucken.

3. **Test-Push aussagekräftig machen**
   - Vor dem Server-Test optional eine lokale Browser-Notification über `registration.showNotification()` auslösen. Damit trennt man eindeutig:
     - lokale Notification funktioniert nicht → Browser/OS blockiert Anzeige
     - lokale Notification funktioniert, Server-Test nicht → Push-Kanal/Subscription/VAPID
   - Nach `send-push` nicht nur „Test gesendet“ anzeigen, sondern das Ergebnis (`sent_count`, `no_subscription`, `duplicate`, `quiet_hours`) auswerten.

4. **Einstellungs-UI verbessern**
   - In „Benachrichtigungen“ einen kompakten Diagnoseblock anzeigen:
     - Browser unterstützt Push
     - Berechtigung erteilt
     - Service Worker aktiv
     - Gerät registriert
     - letzter Server-Test
     - letzter Empfang im Service Worker
   - Konkrete Fehlermeldungen statt allgemeinem Erfolgstoast.

5. **Server-Payload leicht anpassen**
   - `send-push` soll standardmäßig PNG-Icon/Badge aus dem Manifest verwenden.
   - Response soll pro User detailliert genug sein, damit die UI anzeigen kann, ob wirklich an ein Gerät zugestellt wurde.

## Validierung

- Ich prüfe anschließend per Datenbank/Logs, dass der Test-Push weiterhin serverseitig `sent_count > 0` erzeugt.
- Zusätzlich prüfe ich im Browser, dass die Service-Worker-Datei erreichbar ist und die neue Diagnose-UI die Empfangskette sichtbar macht.

## Erwartetes Ergebnis

Wenn Windows oder Android Notifications noch blockiert, sieht man danach klar, ob die Blockade im Betriebssystem/Browser liegt. Wenn die Ursache im aktuellen Service-Worker/Icon-/Payload-Verhalten liegt, werden Test- und E-Mail-Pushes sichtbar angezeigt.