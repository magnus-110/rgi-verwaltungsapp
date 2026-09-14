-- Kopfprinzip (§ 25 Abs. 2 WEG): Ein Eigentümer hat grundsätzlich eine Stimme,
-- auch wenn ihm mehrere Einheiten gehören. head_weight = 1 -> die Einheit zählt
-- als eigener Kopf, head_weight = 0 -> die Einheit wird mit einer anderen Einheit
-- desselben Eigentümers zu einem Kopf zusammengefasst. Abweichende Regelungen
-- der Teilungserklärung lassen sich händisch einstellen.
alter table public.etv_attendees
  add column if not exists head_weight numeric not null default 1;

alter table public.etv_votes
  add column if not exists head_weight numeric not null default 1;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'etv_attendees_head_weight_check') then
    alter table public.etv_attendees
      add constraint etv_attendees_head_weight_check check (head_weight >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'etv_votes_head_weight_check') then
    alter table public.etv_votes
      add constraint etv_votes_head_weight_check check (head_weight >= 0);
  end if;
end $$;

comment on column public.etv_attendees.head_weight is
  'Stimmgewicht nach Koepfen: 1 = eigener Kopf, 0 = mit einer anderen Einheit desselben Eigentuemers zusammengefasst (Kopfprinzip, § 25 Abs. 2 WEG).';
comment on column public.etv_votes.head_weight is
  'Kopfgewicht der Stimme zum Zeitpunkt der Abstimmung (Snapshot aus etv_attendees.head_weight).';
