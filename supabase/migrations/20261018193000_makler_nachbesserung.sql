-- Nachbesserungen Maklerbereich (Prüfung 18.10.2026)

-- 1) Fotos löschen: Storage braucht zusätzlich eine Lese-Regel, sonst bleibt die Datei liegen.
drop policy if exists "Makler Fotos lesen" on storage.objects;
create policy "Makler Fotos lesen" on storage.objects for select to authenticated
  using (bucket_id = 'makler-fotos' and public.broker_is_broker());

-- 2) Makler-Freigabe darf nur ein Admin vergeben (nicht jeder Mitarbeiter sich selbst).
create or replace function public.guard_profile_protected_columns()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if auth.uid() is not null and not coalesce(public.user_has_admin_access(auth.uid()), false) then
    if new.user_id is distinct from old.user_id
       or new.building_id is distinct from old.building_id
       or new.broker_mode_enabled is distinct from old.broker_mode_enabled
       or new.mfa_required is distinct from old.mfa_required then
      raise exception 'Keine Berechtigung, diese Profil-Angaben zu ändern';
    end if;
  end if;
  if auth.uid() is not null
     and new.broker_mode_enabled is distinct from old.broker_mode_enabled
     and not coalesce(public.rgi_is_admin(auth.uid()), false) then
    raise exception 'Nur ein Admin kann den Maklerbereich freischalten';
  end if;
  return new;
end;
$function$;

-- 3) Website: abgeschlossene Objekte nur als Referenz zeigen.
create or replace function public.public_listings(_channel text default 'website')
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x->>'sort_key'), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', bp.id, 'slug', bp.slug, 'legacy_id', bp.legacy_website_id, 'listing_type', bp.listing_type,
      'website_state', bp.website_state, 'is_reference', bp.is_reference, 'reference_order', bp.reference_order,
      'display_order', bp.display_order, 'display_hidden', bp.display_hidden, 'title', bp.title,
      'description', bp.description, 'street', bp.street, 'house_number', bp.house_number,
      'postal_code', bp.postal_code, 'city', bp.city, 'district', bp.district,
      'property_type', bp.property_type, 'property_subtype', bp.property_subtype, 'condition', bp.condition,
      'price_eur', bp.price_eur, 'cold_rent_eur', bp.cold_rent_eur, 'warm_rent_eur', bp.warm_rent_eur,
      'service_charge_eur', bp.service_charge_eur, 'heating_cost_eur', bp.heating_cost_eur,
      'deposit_eur', bp.deposit_eur, 'commission_text', bp.commission_text,
      'commission_buyer_pct', bp.commission_buyer_pct, 'commission_tenant_pct', bp.commission_tenant_pct,
      'living_space_sqm', bp.living_space_sqm, 'plot_size_sqm', bp.plot_size_sqm, 'rooms', bp.rooms,
      'bedrooms', bp.bedrooms, 'bathrooms', bp.bathrooms, 'floor', bp.floor, 'total_floors', bp.total_floors,
      'year_built', bp.year_built, 'available_from', bp.available_from, 'heating_type', bp.heating_type,
      'energy_source', bp.energy_source, 'energy_class', bp.energy_class, 'energy_value', bp.energy_value,
      'energy_certificate_type', bp.energy_certificate_type, 'energy_certificate_date', bp.energy_certificate_date,
      'features', bp.features, 'updated_at', bp.updated_at, 'created_at', bp.created_at,
      'images', coalesce((select jsonb_agg(jsonb_build_object('path', i.storage_path, 'caption', i.caption) order by i.sort_order, i.created_at)
                          from public.broker_property_images i where i.property_id = bp.id), '[]'::jsonb),
      'sort_key', lpad(coalesce(bp.reference_order, 9999)::text, 5, '0') || coalesce(to_char(bp.created_at, 'YYYYMMDDHH24MISS'), '')
    ) x
    from public.broker_properties bp
    where (
      (_channel = 'website' and (
         (bp.show_on_website and bp.status in ('vermarktung','reserviert'))
         or (bp.is_reference and bp.status = 'abgeschlossen')))
      or (_channel = 'portal' and bp.show_in_portal and bp.status in ('vermarktung','reserviert'))
      or (_channel = 'display' and bp.show_on_website and bp.status in ('vermarktung','reserviert') and not bp.display_hidden)
    )
  ) s;
$$;
grant execute on function public.public_listings(text) to anon, authenticated;
