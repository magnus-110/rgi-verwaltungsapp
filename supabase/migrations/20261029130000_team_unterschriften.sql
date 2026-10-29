-- Hinterlegte Unterschriften des Teams (für Protokolle u. ä.): nur Admins dürfen
-- sie lesen und einfügen. Die eigene Tabelle bleibt für alle anderen gesperrt.
create or replace function public.team_unterschriften()
returns table (user_id uuid, name text, signature_png text)
language sql
stable
security definer
set search_path = public
as $$
  select s.user_id,
         trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) as name,
         s.signature_png
  from user_signatures s
  join profiles p on p.user_id = s.user_id
  where exists (select 1 from profiles me where me.user_id = auth.uid() and me.role = 'admin')
    and s.signature_png is not null
  order by 2;
$$;

revoke all on function public.team_unterschriften() from public, anon;
grant execute on function public.team_unterschriften() to authenticated;
