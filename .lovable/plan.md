Plan: Eingehende-Anruf-Kontaktanzeige

1. Ziel
Eine neue Seite /anruf im AdminLayout, die den Query-Parameter ?nummer= aus PhonerLite liest, über die bestehende Supabase-RPC find_contact_by_phone den passenden Kontakt sucht und diesen groß, kontaktbezogen anzeigt.

2. Bestandsprüfung
- Die RPC find_contact_by_phone(p_num text) existiert bereits in Supabase und liefert { contact_id, label, name, objekte, phone }[].
- toTelHref in src/lib/phone.ts ist für Telefonnummern bereits vorhanden, wird hier aber nicht benötigt, da PhonerLite die Nummer als URL-Parameter übergibt.
- AdminLayout, React Router und Supabase-Client sind bereits im Projekt integriert.

3. Durchführung
3.1 Neue Seite anlegen
- Datei: src/pages/IncomingCall.tsx
- Implementierung exakt nach vom Nutzer bereitgestelltem Code:
  - Liest useSearchParams().get("nummer").
  - Ruft supabase.rpc("find_contact_by_phone", { p_num: num }) auf.
  - Dedupliziert Treffer pro contact_id.
  - Zeigt Ladezustand, „Unbekannte Nummer“ oder Name, Objekte und Telefon-Label groß zentriert an.
  - Nutzt Phone- und User-Icons von lucide-react.

3.2 Route registrieren
- In src/App.tsx:
  - Import IncomingCall from "./pages/IncomingCall" als eager Import (kleine Seite, keine separate Chunk nötig).
  - Route im Admin-Routes-Block ergänzen:
    <Route path="/anruf" element={<AdminLayout><IncomingCall /></AdminLayout>} />

4. Nicht im Scope
- Keine PhonerLite-Integration (Webhooks, CTI-Plugin, Edge Function) – nur die reine Anzeige-Seite.
- Keine Datenbankmigrationen, da die RPC bereits existiert.
- Keine RLS-/Auth-Änderungen, da die Seite über AdminLayout das bestehende Auth durchläuft.

5. Validierung
- TypeScript-Check ausführen.
- Seite /anruf?nummer=+49123456789 im Preview aufrufen und prüfen, ob Kontaktname und Objekte korrekt erscheinen.