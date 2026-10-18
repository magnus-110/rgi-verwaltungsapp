-- Hochgeladenes Exposé landet automatisch in der RGI-Ablage:
-- Ordner „Makler" › Objekt › „Exposé – <Objekt>". Die Datei bleibt im Bucket
-- makler-unterlagen, die Ablage zeigt nur darauf (storage_bucket).
create or replace function public.broker_expose_in_ablage()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  wurzel uuid;
  ordner uuid;
  titel text;
  wer uuid;
begin
  if new.category is distinct from 'expose' then return new; end if;
  wer := coalesce(new.created_by, auth.uid());
  if wer is null then return new; end if;
  select title into titel from broker_properties where id = new.property_id;

  select id into wurzel from building_file_categories where is_company and slug = 'rgi-makler' limit 1;
  if wurzel is null then
    insert into building_file_categories (name, slug, parent_id, building_id, is_company, management_mode, sort_order)
    values ('Makler', 'rgi-makler', null, null, true, 'weg', 15)
    returning id into wurzel;
  end if;

  select id into ordner from building_file_categories where is_company and slug = 'rgi-makler-' || new.property_id limit 1;
  if ordner is null then
    insert into building_file_categories (name, slug, parent_id, building_id, is_company, management_mode, sort_order)
    values (coalesce(titel, 'Objekt'), 'rgi-makler-' || new.property_id, wurzel, null, true, 'weg', 10)
    returning id into ordner;
  end if;

  -- Ältere Exposés dieses Objekts sind nicht mehr die aktuelle Fassung.
  update building_files set is_current_version = false
   where broker_property_id = new.property_id and is_company and display_name like 'Exposé – %' and is_current_version;

  insert into building_files (display_name, file_path, file_size, mime_type, category_id, building_id, is_company,
    storage_bucket, management_mode, visibility_role, visible_to_users, rag_enabled, source, uploaded_by, broker_property_id)
  values ('Exposé – ' || coalesce(titel, 'Objekt'), new.storage_path, coalesce(new.size_bytes, 0), new.mime_type, ordner, null, true,
    'makler-unterlagen', 'weg', 'intern', false, false, 'manual', wer, new.property_id);
  return new;
exception when others then
  raise warning 'broker_expose_in_ablage: %', sqlerrm;
  return new;
end $$;

revoke execute on function public.broker_expose_in_ablage() from public, anon, authenticated;

drop trigger if exists broker_expose_in_ablage on public.broker_property_documents;
create trigger broker_expose_in_ablage after insert on public.broker_property_documents
  for each row execute function public.broker_expose_in_ablage();
