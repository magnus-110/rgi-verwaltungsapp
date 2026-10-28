-- Dieselbe Mandatsreferenz darf im Objekt für mehrere Einheiten gelten
-- (z. B. Wohnung und Stellplatz über ein Mandat), aber nur einmal je Einheit.
drop index if exists public.sepa_mandates_referenz_idx;
create unique index sepa_mandates_referenz_idx
  on public.sepa_mandates (building_id, mandatsreferenz, assignment_id) nulls not distinct;

-- Hausgeld-Abgleich: Konfliktklausel an die neue Regel anpassen
do $$
declare d text;
begin
  d := pg_get_functiondef('public.hausgeld_abgleich(boolean, uuid[])'::regprocedure);
  if position('on conflict (building_id, mandatsreferenz) do nothing' in d) > 0 then
    execute replace(d, 'on conflict (building_id, mandatsreferenz) do nothing',
                       'on conflict (building_id, mandatsreferenz, assignment_id) do nothing');
  end if;
end $$;
