# Service-Hub freischalten (nur Nebenkostenabrechnung) + Stripe live

## 1. Service-Hub für Eigentümer sichtbar machen

Der Menüpunkt "Service-Hub" ist in der Eigentümer-Navigation aktuell auskommentiert (die Seiten und Routen existieren bereits und funktionieren). Er wird wieder aktiviert, sodass Eigentümer den Hub im Menü sehen und die Nebenkostenabrechnung kaufen können.

## 2. Nur noch Nebenkostenabrechnung anzeigen

Im Service-Hub werden die beiden Karten "Anlage V (Steuererklärung)" und "Mietvertrag" entfernt. Stattdessen kommt unter der Nebenkosten-Karte ein dezenter Hinweis-Block:

> Weitere Services in Vorbereitung — Anlage V für die Steuererklärung und der digitale Mietvertrag folgen in Kürze.

Der Rest (Preis, Erstellen-Button, Rechtshinweis) bleibt unverändert. Die Datenbank-Preiseinträge für `anlage_v` und `mietvertrag` bleiben liegen (auf `active = false` gesetzt), damit sie später ohne Migration wieder aktiviert werden können.

## 3. Stripe: von Sandbox auf Live umstellen

Technisch läuft das über zwei Secrets, die im Backend genutzt werden. Für den Livegang musst du in deinem Stripe-Dashboard Folgendes tun (ich kann die Werte nicht selbst erzeugen):

1. **Stripe-Konto aktivieren** — im Dashboard oben von "Testmodus" auf Live schalten. Dafür müssen Firmendaten, Bankverbindung und Identitätsprüfung abgeschlossen sein.
2. **Live Secret Key kopieren** — Dashboard → Entwickler → API-Schlüssel (Live-Modus) → "Geheimer Schlüssel" (`sk_live_…`).
3. **Live-Webhook anlegen** — Dashboard → Entwickler → Webhooks (Live-Modus) → Endpunkt hinzufügen:
   - URL: `https://eebphowrbarzawwixqcc.supabase.co/functions/v1/stripe-webhook`
   - Events: `checkout.session.completed` und `charge.refunded`
   - Danach das "Signing secret" (`whsec_…`) kopieren.
4. **Stripe Tax prüfen** — im Checkout ist `automatic_tax` aktiv. Im Live-Modus muss unter Stripe Tax die Steuerregistrierung (Deutschland) hinterlegt sein, sonst schlägt der Checkout fehl.
5. Danach hinterlege ich die beiden Werte (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) über das sichere Secret-Formular — du fügst sie dort ein, ich sehe sie nicht.

Sobald die Live-Keys hinterlegt sind, läuft jeder Kauf mit echtem Geld. Empfehlung: vorher einmal komplett im Testmodus durchspielen (Kauf → Webhook → PDF-Erstellung), danach umschalten.

## Technische Details

- `src/components/WegOwnerLayout.tsx`: auskommentierten Service-Hub-Navigationseintrag reaktivieren.
- `src/pages/weg-owner/ServiceHub.tsx`: `tools`-Array auf `nebenkosten` reduzieren, "Bald verfügbar"-Hinweisbox ergänzen, Grid auf eine Karte anpassen.
- Migration: `UPDATE public.service_pricing SET active = false WHERE service_type IN ('anlage_v','mietvertrag');`
- Keine Änderung an `create-service-checkout` / `stripe-webhook` nötig — die lesen die Keys aus den Secrets, der Umstieg ist reiner Key-Tausch.
