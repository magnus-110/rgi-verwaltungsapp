alter table public.etv_meetings add column if not exists steps_done jsonb not null default '{}'::jsonb;
comment on column public.etv_meetings.steps_done is 'Manuell abgehakte Schritte der Versammlung: {"planung":true,"einladung":false,...}; überschreibt die automatische Erkennung je Schritt.';
