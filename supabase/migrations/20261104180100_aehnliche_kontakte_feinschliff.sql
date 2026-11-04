-- Feinschliff public.aehnliche_kontakte: „Name ähnlich“ nur bei seltenem Wort oder mindestens zwei Wörtern
-- (sonst passte z. B. ein einzelner Vorname „Hans“ zu jedem Hans), „Name enthält“ nicht zusätzlich zu „Name gleich/ähnlich“.

create or replace function public.aehnliche_kontakte(
  p_name text default null,
  p_telefon text default null,
  p_email text default null,
  p_iban text default null,
  p_limit int default 10
)
returns table (
  contact_id uuid,
  anzeige text,
  kurzname text,
  ort text,
  kontakt_typ text,
  dienstleister boolean,
  gruende text[],
  punkte int,
  sicher boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_w text[] := public._kontakt_name_woerter(p_name);
  v_tel text := public._telefon_norm(p_telefon);
  v_mail text := lower(btrim(coalesce(p_email, '')));
  v_dom text;
  v_iban text := upper(regexp_replace(coalesce(p_iban, ''), '\s', '', 'g'));
begin
  if not (public.is_rgi_staff()
          or coalesce(auth.jwt() ->> 'role', '') = 'service_role'
          or session_user in ('postgres', 'supabase_admin')) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;

  if v_mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then v_mail := ''; end if;
  v_dom := nullif(split_part(v_mail, '@', 2), '');
  if v_dom in ('gmail.com', 'googlemail.com', 'gmx.de', 'gmx.net', 'gmx.at', 'gmx.ch', 'web.de', 't-online.de',
               'yahoo.com', 'yahoo.de', 'outlook.com', 'outlook.de', 'hotmail.com', 'hotmail.de', 'live.com', 'live.de',
               'msn.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'aol.de', 'freenet.de', 'posteo.de', 'mail.de',
               'online.de', 'arcor.de', 'kabelmail.de', 'vodafone.de', '1und1.de', 'ionos.de', 'mailbox.org',
               'protonmail.com', 'proton.me', 'email.de', 'onlinehome.de') then
    v_dom := null;
  end if;
  if length(v_tel) < 6 then v_tel := ''; end if;
  if length(v_iban) < 15 then v_iban := ''; end if;

  return query
  with namen as (
    select c.id as cid, n.name
      from public.contacts c,
           lateral (values (c.company_name), (c.short_name), (concat_ws(' ', c.first_name, c.last_name))) as n(name)
     where cardinality(v_w) > 0 and nullif(btrim(n.name), '') is not null
    union
    select p.contact_id, concat_ws(' ', p.first_name, p.last_name)
      from public.contact_persons p
     where cardinality(v_w) > 0 and nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), '') is not null
  ),
  nw as (
    select x.cid, x.w from (select namen.cid, public._kontakt_name_woerter(namen.name) as w from namen) x
     where cardinality(x.w) > 0
  ),
  haeufigkeit as (
    select wort, count(distinct nw.cid) as n from nw, unnest(nw.w) as wort group by wort
  ),
  treffer as (
    -- Name gleich (normalisiert, Reihenfolge egal)
    select nw.cid, 'Name gleich'::text as grund, 100 as p, true as s from nw where nw.w = v_w
    union all
    -- ein Name steckt ganz im anderen („Fa. Munz“ ↔ „Elektrotechnik Munz“)
    select nw.cid, 'Name ähnlich', 70, false from nw
     where nw.w <> v_w
       and ((v_w <@ nw.w and (cardinality(v_w) >= 2 or exists (
              select 1 from unnest(v_w) x join haeufigkeit h on h.wort = x where length(x) >= 3 and h.n <= 5)))
         or (nw.w <@ v_w and (cardinality(nw.w) >= 2 or exists (
              select 1 from unnest(nw.w) x join haeufigkeit h on h.wort = x where length(x) >= 3 and h.n <= 5))))
    union all
    -- Suche: jedes eingegebene Wort ist Anfang eines Wortes im Namen
    select nw.cid, 'Name beginnt so', 50, false from nw
     where not (v_w <@ nw.w)
       and not exists (select 1 from unnest(v_w) x
                        where length(x) < 2 or not exists (select 1 from unnest(nw.w) y where y like x || '%'))
    union all
    -- seltener Namensteil gleich (z. B. Nachname steckt im Firmennamen)
    select nw.cid, 'Name enthält „' || x || '“', 40, false
      from nw, unnest(nw.w) as x
      join haeufigkeit h on h.wort = x
     where x = any (v_w) and length(x) >= 4 and h.n <= 3
       and not (nw.w <@ v_w) and not (v_w <@ nw.w)
    union all
    select t.contact_id, 'gleiche Telefonnummer', 90, true from public.contact_phones t
     where v_tel <> '' and public._telefon_norm(t.phone_number) = v_tel
    union all
    select t.contact_id, 'gleiche Telefonnummer', 90, true from public.contact_persons t
     where v_tel <> '' and public._telefon_norm(t.phone) = v_tel
    union all
    select t.contact_id, 'gleiche E-Mail', 95, true from public.contact_emails t
     where v_mail <> '' and lower(btrim(t.email)) = v_mail
    union all
    select t.contact_id, 'gleiche E-Mail', 95, true from public.contact_persons t
     where v_mail <> '' and lower(btrim(t.email)) = v_mail
    union all
    select t.contact_id, 'gleiche E-Mail-Domain (@' || v_dom || ')', 30, false from public.contact_emails t
     where v_dom is not null and split_part(lower(btrim(t.email)), '@', 2) = v_dom and lower(btrim(t.email)) <> v_mail
    union all
    select t.contact_id, 'gleiche E-Mail-Domain (@' || v_dom || ')', 30, false from public.contact_persons t
     where v_dom is not null and split_part(lower(btrim(t.email)), '@', 2) = v_dom and lower(btrim(t.email)) <> v_mail
    union all
    select t.contact_id, 'gleiche IBAN', 90, true from public.contact_bank_accounts t
     where v_iban <> '' and upper(regexp_replace(coalesce(t.iban, ''), '\s', '', 'g')) = v_iban
  ),
  je_kontakt as (
    select t.cid,
           array_agg(distinct t.grund) as gruende,
           least(100, max(t.p) + 5 * (count(distinct t.grund) - 1))::int as punkte,
           bool_or(t.s) as sicher
      from treffer t
     group by t.cid
  )
  select c.id,
         coalesce(nullif(btrim(c.company_name), ''), nullif(btrim(concat_ws(' ', c.first_name, c.last_name)), ''),
                  nullif(btrim(c.short_name), ''), 'Ohne Namen'),
         c.short_name,
         nullif(btrim(concat_ws(' ', c.address_zip, c.address_city)), ''),
         c.contact_type::text,
         coalesce(c.is_service_provider_pool, false),
         k.gruende,
         k.punkte,
         k.sicher
    from je_kontakt k
    join public.contacts c on c.id = k.cid
   order by k.punkte desc, 2
   limit greatest(1, least(coalesce(p_limit, 10), 50));
end;
$$;

