
-- 1) WEG-Eigentümer dürfen ihre eigenen Datensätze lesen/ändern
create policy "WEG owners can view own details"
on public.weg_owners
for select
to authenticated
using ((get_user_role(auth.uid()) = 'weg_owner') and (user_id = auth.uid()));

create policy "WEG owners can update own details"
on public.weg_owners
for update
to authenticated
using ((get_user_role(auth.uid()) = 'weg_owner') and (user_id = auth.uid()))
with check ((get_user_role(auth.uid()) = 'weg_owner') and (user_id = auth.uid()));

-- 2) Sync-Funktion: weg_owners -> profiles
create or replace function public.sync_weg_owner_to_profile()
returns trigger
language plpgsql
as $function$
begin
  update public.profiles
     set first_name = coalesce(new.first_name, first_name),
         last_name  = coalesce(new.last_name,  last_name),
         phone      = coalesce(new.phone,      phone),
         updated_at = now()
   where user_id = new.user_id;
  return new;
end;
$function$;

drop trigger if exists trg_sync_weg_owner_to_profile on public.weg_owners;
create trigger trg_sync_weg_owner_to_profile
after insert or update on public.weg_owners
for each row execute function public.sync_weg_owner_to_profile();

-- 3) Einmalige Nachpflege: erst aus weg_owners, dann aus auth.users (Metadaten)

-- 3a) Profile aus weg_owners befüllen (nur leere Felder überschreiben)
update public.profiles p
   set first_name = coalesce(p.first_name, w.first_name),
       last_name  = coalesce(p.last_name,  w.last_name),
       phone      = coalesce(p.phone,      w.phone),
       updated_at = now()
  from public.weg_owners w
 where w.user_id = p.user_id;

-- 3b) Profile aus auth.users.raw_user_meta_data befüllen (nur leere Felder überschreiben)
update public.profiles p
   set first_name = coalesce(p.first_name, (u.raw_user_meta_data ->> 'first_name')),
       last_name  = coalesce(p.last_name,  (u.raw_user_meta_data ->> 'last_name')),
       phone      = coalesce(p.phone,      (u.raw_user_meta_data ->> 'phone')),
       updated_at = now()
  from auth.users u
 where u.id = p.user_id;

-- 4) handle_new_user erweitern, damit neue Profile Name/Telefon mitbekommen
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $function$
begin
  insert into public.profiles (user_id, email, role, first_name, last_name, phone)
  values (
    new.id,
    new.email,
    'tenant', -- wird später über die App/Administration gesetzt
    coalesce(new.raw_user_meta_data ->> 'first_name', null),
    coalesce(new.raw_user_meta_data ->> 'last_name',  null),
    coalesce(new.raw_user_meta_data ->> 'phone',      null)
  );
  return new;
end;
$function$;
