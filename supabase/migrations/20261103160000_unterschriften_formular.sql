-- Elektronische Unterschrift: Formular statt Einzelklick, Reihenfolge, änderbare vorbelegte Angaben,
-- Korrektur per Antippen (Textebene des PDFs).
--
-- sign_request_fields
--  - reihenfolge: Reihenfolge im Formular des Unterzeichners (Standard = Lesereihenfolge Seite, y, x)
--  - format: Untertyp eines Textfeldes, derzeit nur 'iban' (Prüfziffer, 4er-Blöcke, Bank/BIC aus der BLZ)
--  - heute_vorbelegen: Datumsfeld mit dem heutigen Datum vorbelegen (änderbar); null = automatisch bei „Datum“
--  - neuer Feldtyp 'vorbelegt': Angabe steht schon im PDF (ausgangswert, Lage text_zeilen), der Unterzeichner
--    darf sie ändern. Geändert → alter Text exakt durchgestrichen, neuer Wert dunkelblau (pdf.ts/ersetzung.ts).
--    wert = neuer Wert (null = unverändert).
--  - text_zeilen: [{x, y, w, h, basis, groesse}] – Textzeilen des Originals (PDF-Punkte, oben links)
--  - frei: {bis, oben} – Platz rechts bis x bzw. oben bis y (für „dahinter“/„darüber“/Fußnote)
-- sign_request_ergaenzungen (art 'korrektur', neu per Antippen): original_text, zeilen, frei, darstellung.
-- Alte Korrekturen (Rechteck, ohne zeilen) bleiben unverändert gültig und werden wie bisher gezeichnet.

alter table public.sign_request_fields add column if not exists reihenfolge integer;
alter table public.sign_request_fields add column if not exists format text;
alter table public.sign_request_fields add column if not exists heute_vorbelegen boolean;
alter table public.sign_request_fields add column if not exists ausgangswert text;
alter table public.sign_request_fields add column if not exists text_zeilen jsonb;
alter table public.sign_request_fields add column if not exists frei jsonb;

alter table public.sign_request_fields drop constraint if exists sign_request_fields_typ_check;
alter table public.sign_request_fields add constraint sign_request_fields_typ_check
  check (typ in ('ankreuz', 'auswahl', 'datum', 'text', 'vorbelegt'));
alter table public.sign_request_fields drop constraint if exists sign_request_fields_format_check;
alter table public.sign_request_fields add constraint sign_request_fields_format_check
  check (format is null or (format = 'iban' and typ = 'text'));
alter table public.sign_request_fields drop constraint if exists sign_request_fields_vorbelegt_check;
alter table public.sign_request_fields add constraint sign_request_fields_vorbelegt_check
  check (typ <> 'vorbelegt' or (ausfueller = 'unterzeichner' and char_length(coalesce(ausgangswert, '')) between 1 and 300 and jsonb_typeof(text_zeilen) = 'array'));
alter table public.sign_request_fields drop constraint if exists sign_request_fields_reihenfolge_check;
alter table public.sign_request_fields add constraint sign_request_fields_reihenfolge_check
  check (reihenfolge is null or reihenfolge between 0 and 9999);

comment on column public.sign_request_fields.reihenfolge is 'Reihenfolge im Formular des Unterzeichners (Standard: Lesereihenfolge Seite, y, x).';
comment on column public.sign_request_fields.format is 'Untertyp eines Textfeldes: iban (Prüfziffer, 4er-Blöcke, Bank/BIC aus der BLZ).';
comment on column public.sign_request_fields.heute_vorbelegen is 'Datumsfeld mit heutigem Datum vorbelegen (änderbar). null = automatisch bei Beschriftung „Datum“.';
comment on column public.sign_request_fields.ausgangswert is 'Nur typ vorbelegt: Text, der schon im PDF steht (Ausgangswert im Formular).';
comment on column public.sign_request_fields.text_zeilen is 'Nur typ vorbelegt: Textzeilen des Originals [{x,y,w,h,basis,groesse}] in PDF-Punkten (oben links).';
comment on column public.sign_request_fields.frei is 'Nur typ vorbelegt: freier Platz {bis, oben} für den neuen Wert.';

alter table public.sign_request_ergaenzungen add column if not exists original_text text;
alter table public.sign_request_ergaenzungen add column if not exists zeilen jsonb;
alter table public.sign_request_ergaenzungen add column if not exists frei jsonb;
alter table public.sign_request_ergaenzungen add column if not exists darstellung text;
alter table public.sign_request_ergaenzungen drop constraint if exists sign_request_ergaenzungen_original_check;
alter table public.sign_request_ergaenzungen add constraint sign_request_ergaenzungen_original_check
  check (
    (original_text is null or char_length(original_text) between 1 and 500)
    and (zeilen is null or (art = 'korrektur' and jsonb_typeof(zeilen) = 'array'))
    and (darstellung is null or darstellung in ('dahinter', 'darueber', 'fussnote'))
  );

comment on column public.sign_request_ergaenzungen.original_text is 'Korrektur per Antippen: der ersetzte Text aus der Textebene des PDFs (bei Scans leer).';
comment on column public.sign_request_ergaenzungen.zeilen is 'Korrektur per Antippen: Textzeilen des Originals [{x,y,w,h,basis,groesse}] – werden exakt durchgestrichen. null = alte Rechteck-Korrektur.';
comment on column public.sign_request_ergaenzungen.frei is 'Korrektur per Antippen: freier Platz {bis, oben, scan?} für den neuen Text.';
comment on column public.sign_request_ergaenzungen.darstellung is 'Wo der neue Text steht: dahinter · darueber · fussnote.';
