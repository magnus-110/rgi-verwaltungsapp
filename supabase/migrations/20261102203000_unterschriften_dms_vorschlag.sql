-- Unterschriften: Endfassung ausgehender Vorgänge wird nicht mehr automatisch im DMS abgelegt,
-- sondern auf /unterschriften von Hand („Im DMS ablegen“, sign-request dms_ablegen).
-- Der automatische Vorschlag (Objekt bzw. Firmen-DMS, Ordner, Dateiname) wird von dms-vorschlag
-- beim ersten Öffnen des Dialogs berechnet und hier gespeichert – samt Rückmeldung nach der Ablage
-- (abgelegt_am, geaendert), wie dms_vorschlaege beim Postfach.
-- kopie_dms bleibt aus Kompatibilität bestehen (wirkt nur noch bei ETV-Protokollen).
alter table public.sign_requests add column if not exists dms_vorschlag jsonb;

comment on column public.sign_requests.dms_vorschlag is
  'Vorschlag für die DMS-Ablage der Endfassung: {ziel: objekt|firma|null, building_id, category_slug, category_id, dateiname, dokumentart, quelle, erstellt_am, abgelegt_am, geaendert}';
comment on column public.sign_requests.kopie_dms is
  'Nur noch für ETV-Protokolle: Endfassung automatisch im DMS ablegen. Ausgehende Vorgänge werden von Hand abgelegt (sign-request dms_ablegen).';
