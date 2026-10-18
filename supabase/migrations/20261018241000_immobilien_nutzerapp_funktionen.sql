-- Funktionen für „Immobilien von RGI“ in der Nutzer-App.
-- Eigentümer greifen nie direkt auf die Tabellen zu, nur über diese Funktionen.

-- Ist der Bereich an? (aktiv = für alle; vorschau = RGI-Mitarbeiter sehen ihn trotzdem)
create or replace function public.portal_immobilien_status()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'aktiv', coalesce((select portal_immobilien_aktiv from rgi_company_settings limit 1), false),
    'vorschau', coalesce(public.is_rgi_staff(), false));
$$;

create or replace function public.portal_immobilien_offen()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    coalesce((select portal_immobilien_aktiv from rgi_company_settings limit 1), false)
    or coalesce(public.is_rgi_staff(), false));
$$;

-- Häuser (und Orte) des angemeldeten Eigentümers/Mieters
create or replace function public.portal_meine_gebaeude()
returns table (building_id uuid, city text) language sql stable security definer set search_path = public as $$
  select distinct b.id, b.city
    from contacts c
    join contact_building_assignments a on a.contact_id = c.id and a.is_active
    join buildings b on b.id = a.building_id
   where c.user_id = auth.uid();
$$;

-- Darf der Angemeldete etwas mit dieser Zielgruppe sehen?
create or replace function public.portal_darf_sehen(_zg text, _orte text[], _geb uuid[])
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(_zg, 'alle') = 'alle'
      or coalesce(public.is_rgi_staff(), false)
      or (_zg = 'orte' and exists (
            select 1 from public.portal_meine_gebaeude() g
             where lower(trim(g.city)) in (select lower(trim(x)) from unnest(coalesce(_orte, '{}')) x)))
      or (_zg = 'gebaeude' and exists (
            select 1 from public.portal_meine_gebaeude() g where g.building_id = any (coalesce(_geb, '{}'))));
$$;

-- Angebote für die Nutzer-App (leer, solange der Bereich aus ist)
create or replace function public.portal_listings()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when not public.portal_immobilien_offen() then '[]'::jsonb else
    coalesce((
      select jsonb_agg(x.v || jsonb_build_object(
               'startseite', bp.portal_startseite,
               'gemeldet', exists (select 1 from inquiries i where i.user_id = auth.uid() and i.broker_property_id = bp.id)))
        from jsonb_array_elements(public.public_listings('portal')) as x(v)
        join broker_properties bp on bp.id = (x.v->>'id')::uuid
       where (bp.portal_bis is null or bp.portal_bis >= current_date)
         and public.portal_darf_sehen(bp.portal_zielgruppe, bp.portal_orte, bp.portal_gebaeude)
    ), '[]'::jsonb)
  end;
$$;

-- Gesuche für die Nutzer-App: freigegebene + die eigenen Suchaufträge
create or replace function public.portal_gesuche()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when not public.portal_immobilien_offen() then '[]'::jsonb else
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', g.id, 'art', g.art, 'status', g.status, 'titel', g.titel, 'objektart', g.objektart,
               'ort', g.ort, 'umkreis_km', g.umkreis_km, 'zimmer_ab', g.zimmer_ab, 'flaeche_ab', g.flaeche_ab,
               'preis_bis', g.preis_bis, 'beschreibung', g.beschreibung,
               'fuer_wen', case when g.eingestellt_von = auth.uid() then g.fuer_wen end,
               'eigen', coalesce(g.eingestellt_von = auth.uid(), false),
               'gemeldet', exists (select 1 from inquiries i where i.user_id = auth.uid() and i.gesuch_id = g.id),
               'seit', coalesce(g.geprueft_am, g.created_at))
             order by coalesce(g.eingestellt_von = auth.uid(), false) desc, coalesce(g.geprueft_am, g.created_at) desc)
        from broker_gesuche g
       where (g.eingestellt_von = auth.uid() and g.status in ('pruefung', 'sichtbar', 'abgelehnt'))
          or (g.status = 'sichtbar'
              and (g.sichtbar_bis is null or g.sichtbar_bis >= current_date)
              and public.portal_darf_sehen(g.zielgruppe, g.orte, g.gebaeude))
    ), '[]'::jsonb)
  end;
$$;

-- Eigentümer stellt einen Suchauftrag ein oder ändert ihn (geht immer erst in die Prüfung)
create or replace function public.portal_suchauftrag_speichern(_id uuid, _d jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  gid uuid;
  kontakt uuid;
  _titel text := left(trim(coalesce(_d->>'titel', '')), 120);
begin
  if not public.portal_immobilien_offen() then raise exception 'Nicht verfügbar'; end if;
  if _titel = '' then raise exception 'Bitte eine Überschrift eingeben'; end if;
  select id into kontakt from contacts where user_id = uid limit 1;

  if _id is null then
    insert into broker_gesuche (art, status, titel, objektart, ort, zimmer_ab, flaeche_ab, preis_bis, beschreibung,
                                fuer_wen, eingestellt_von, contact_id, created_by)
    values ('eigentuemer', 'pruefung', _titel, left(_d->>'objektart', 40), left(_d->>'ort', 80),
            nullif(_d->>'zimmer_ab', '')::numeric, nullif(_d->>'flaeche_ab', '')::numeric,
            nullif(_d->>'preis_bis', '')::numeric, left(_d->>'beschreibung', 1000), left(_d->>'fuer_wen', 40),
            uid, kontakt, uid)
    returning id into gid;
  else
    update broker_gesuche set
      titel = _titel, objektart = left(_d->>'objektart', 40), ort = left(_d->>'ort', 80),
      zimmer_ab = nullif(_d->>'zimmer_ab', '')::numeric, flaeche_ab = nullif(_d->>'flaeche_ab', '')::numeric,
      preis_bis = nullif(_d->>'preis_bis', '')::numeric, beschreibung = left(_d->>'beschreibung', 1000),
      fuer_wen = left(_d->>'fuer_wen', 40), status = 'pruefung', geprueft_von = null, geprueft_am = null
     where id = _id and eingestellt_von = uid and status <> 'beendet'
    returning id into gid;
    if gid is null then raise exception 'Suchauftrag nicht gefunden'; end if;
  end if;

  insert into notifications (user_id, type, title, body, url, ref_type, ref_id)
  select p.user_id, 'suchauftrag',
         case when _id is null then 'Neuer Suchauftrag zur Prüfung' else 'Suchauftrag geändert – bitte prüfen' end,
         _titel, '/makler/gesuche', 'broker_gesuch', gid
    from profiles p
   where p.role = 'admin' and coalesce(p.broker_mode_enabled, false);
  return gid;
end $$;

-- Eigentümer beendet seinen Suchauftrag
create or replace function public.portal_suchauftrag_beenden(_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update broker_gesuche set status = 'beendet' where id = _id and eingestellt_von = auth.uid();
end $$;

revoke execute on function public.portal_immobilien_status() from public, anon;
revoke execute on function public.portal_immobilien_offen() from public, anon;
revoke execute on function public.portal_meine_gebaeude() from public, anon;
revoke execute on function public.portal_darf_sehen(text, text[], uuid[]) from public, anon;
revoke execute on function public.portal_listings() from public, anon;
revoke execute on function public.portal_gesuche() from public, anon;
revoke execute on function public.portal_suchauftrag_speichern(uuid, jsonb) from public, anon;
revoke execute on function public.portal_suchauftrag_beenden(uuid) from public, anon;
grant execute on function public.portal_immobilien_status() to authenticated;
grant execute on function public.portal_immobilien_offen() to authenticated;
grant execute on function public.portal_meine_gebaeude() to authenticated;
grant execute on function public.portal_darf_sehen(text, text[], uuid[]) to authenticated;
grant execute on function public.portal_listings() to authenticated;
grant execute on function public.portal_gesuche() to authenticated;
grant execute on function public.portal_suchauftrag_speichern(uuid, jsonb) to authenticated;
grant execute on function public.portal_suchauftrag_beenden(uuid) to authenticated;
