-- Weisungen im Wortlaut zur Stimmabgabe (Ziffer 5 des RGI-Vollmachtsformulars).
--
-- Bisher konnte eine Weisung nur als Ja/Nein/Enthaltung erfasst werden
-- (pre_vote_instructions). Das Papierformular kennt daneben aber ergaenzende
-- Weisungen im Wortlaut - etwa Betragsgrenzen, die Bevorzugung eines bestimmten
-- Angebots oder Bedingungen der Zustimmung. Diese Eintragungen gehen den
-- Ankreuzungen ausdruecklich vor und waren in der App bisher nicht abbildbar.
--
-- Aufgefallen bei der Eigentuemerversammlung Adolf-Haff-Weg 3 am 04.09.2026:
-- Eine Vollmacht enthielt zu TOP 11 (Wallbox) ein "Ja" unter der Bedingung, dass
-- zuvor ein Modul fuer dynamisches Lastmanagement installiert wird. Ein reines
-- "Ja" haette diese Bedingung verloren.

ALTER TABLE public.etv_attendees
  ADD COLUMN IF NOT EXISTS pre_vote_instruction_notes jsonb;

COMMENT ON COLUMN public.etv_attendees.pre_vote_instruction_notes IS
  'Ergaenzende Weisungen im Wortlaut je Tagesordnungspunkt: { "<etv_agenda_items.id>": "<Weisungstext>" }. Geht der Ankreuzung in pre_vote_instructions vor (Ziffer 5 der Vollmacht). Sperrt fuer den betroffenen TOP die automatische Stimmuebernahme - die Versammlungsleitung muss den Wortlaut selbst bewerten.';

-- Nur ein Objekt, keine Liste oder Skalarwerte.
ALTER TABLE public.etv_attendees
  DROP CONSTRAINT IF EXISTS etv_attendees_instruction_notes_ist_objekt;
ALTER TABLE public.etv_attendees
  ADD CONSTRAINT etv_attendees_instruction_notes_ist_objekt
  CHECK (pre_vote_instruction_notes IS NULL OR jsonb_typeof(pre_vote_instruction_notes) = 'object');

-- Findet Versammlungen mit Wortlaut-Weisungen, die vor der Abstimmung zu pruefen sind.
CREATE INDEX IF NOT EXISTS idx_etv_attendees_wortlaut_weisungen
  ON public.etv_attendees (meeting_id)
  WHERE pre_vote_instruction_notes IS NOT NULL;
