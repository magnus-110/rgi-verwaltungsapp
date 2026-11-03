-- Elektronische Unterschrift: fertige Vorlagen „SEPA-Lastschriftmandat“ und „Eigentümer-Stammdatenblatt“.
-- Erzeugt werden die PDFs in der Edge-Funktion sign-request (Aktion aus_vorlage, _shared/signatur/vorlagen.ts).
-- Nach Abschluss übernimmt das Büro die Angaben von Hand („In Stammdaten übernehmen“) – nichts automatisch.

-- 1. Neue Dokumentarten
alter table public.sign_requests drop constraint if exists sign_requests_dokumentart_check;
alter table public.sign_requests add constraint sign_requests_dokumentart_check
  check (dokumentart in ('verwaltervertrag','vollmacht','umlaufbeschluss','dienstleistervertrag','angebot','protokoll','abnahme','sonstiges','sepa_mandat','stammdatenblatt'));
alter table public.sign_mail_templates drop constraint if exists sign_mail_templates_dokumentart_check;
alter table public.sign_mail_templates add constraint sign_mail_templates_dokumentart_check
  check (dokumentart in ('verwaltervertrag','vollmacht','umlaufbeschluss','dienstleistervertrag','angebot','protokoll','abnahme','sonstiges','sepa_mandat','stammdatenblatt'));

-- 2. Neue Quelle „vorlage“ (PDF aus einer Vorlage der App erzeugt)
alter table public.sign_requests drop constraint if exists sign_requests_quelle_typ_check;
alter table public.sign_requests add constraint sign_requests_quelle_typ_check
  check (quelle_typ in ('building_file','email_attachment','offer','contract','etv_meeting','upload','vorlage'));

-- 3. Angaben zur Vorlage je Vorgang (Art, Eigentümer, Einheiten, Mandatsreferenz, Übernahme in die Stammdaten)
alter table public.sign_requests add column if not exists vorlage jsonb;
comment on column public.sign_requests.vorlage is
  'Nur bei Vorgängen aus einer Vorlage: {art, building_id, contact_id, assignment_ids[], mandatsreferenz?, glaeubiger_id?, personen[], uebernommen_am?, uebernommen_von?}';

-- 4. Mailtexte
insert into public.sign_mail_templates (dokumentart, bezeichnung, betreff, text, frist_tage, erinnerung_nach_tagen) values
 ('sepa_mandat', 'SEPA-Lastschriftmandat', 'Bitte unterschreiben: SEPA-Lastschriftmandat – {Objekt}',
  E'{Anrede},\n\nfür den Einzug des Hausgeldes bitten wir Sie um ein SEPA-Lastschriftmandat. Ihre Angaben sind schon eingetragen – bitte prüfen, die Bankverbindung ergänzen und bis zum {Frist} unterschreiben.\n\nUnterschreiben muss die Kontoinhaberin bzw. der Kontoinhaber.', 21, 7),
 ('stammdatenblatt', 'Eigentümer-Stammdatenblatt', 'Bitte prüfen: Ihre Angaben als Eigentümer – {Objekt}',
  E'{Anrede},\n\ndamit wir Sie gut erreichen, bitten wir Sie, Ihre bei uns gespeicherten Angaben zu prüfen. Alles Vorausgefüllte können Sie direkt ändern. Bitte bis zum {Frist} bestätigen.', 21, 7)
on conflict (dokumentart) do nothing;

-- 5. Zustellweg je Eigentümer-Einheit (aus dem Stammdatenblatt)
alter table public.contact_building_assignments add column if not exists zustellweg text;
alter table public.contact_building_assignments drop constraint if exists contact_building_assignments_zustellweg_check;
alter table public.contact_building_assignments add constraint contact_building_assignments_zustellweg_check
  check (zustellweg is null or zustellweg in ('email','post'));
comment on column public.contact_building_assignments.zustellweg is 'Wunsch des Eigentümers für Unterlagen: email | post (null = unbekannt)';

-- 6. SEPA-Mandat: Verweis auf den Unterschriften-Vorgang, neue Quelle „unterschrift“
alter table public.sepa_mandates add column if not exists sign_request_id uuid references public.sign_requests(id) on delete set null;
alter table public.sepa_mandates drop constraint if exists sepa_mandates_quelle_check;
alter table public.sepa_mandates add constraint sepa_mandates_quelle_check
  check (quelle in ('buero','eigentuemer','scan','uebernahme','fragebogen','import','unterschrift'));
