
-- 1) Buildings
create index if not exists idx_buildings_mgmt_created on public.buildings (management_mode, created_at desc);
create index if not exists idx_buildings_name_lower on public.buildings (lower(name));
create index if not exists idx_buildings_address_lower on public.buildings (lower(address));
create index if not exists idx_buildings_code on public.buildings (building_code);

-- 2) Tenants
create index if not exists idx_tenants_building on public.tenants (building_id);
create index if not exists idx_tenants_user on public.tenants (user_id);
create index if not exists idx_tenants_created on public.tenants (created_at);
create unique index if not exists tenants_user_building_unique on public.tenants (user_id, building_id);

-- 3) WEG owner buildings
create index if not exists idx_wob_user on public.weg_owner_buildings (user_id);
create index if not exists idx_wob_building on public.weg_owner_buildings (building_id);
create index if not exists idx_wob_created on public.weg_owner_buildings (created_at);
create unique index if not exists wob_user_building_unique on public.weg_owner_buildings (user_id, building_id);

-- 4) WEG owners
create unique index if not exists weg_owners_user_unique on public.weg_owners (user_id);
create index if not exists idx_weg_owners_email on public.weg_owners (email);

-- 5) Profiles
create unique index if not exists profiles_user_unique on public.profiles (user_id);
create index if not exists idx_profiles_role on public.profiles (role);
create index if not exists idx_profiles_building on public.profiles (building_id);

-- 6) Reports (Miete)
create index if not exists idx_miete_reports_reported_by on public.miete_reports (reported_by);
create index if not exists idx_miete_reports_building on public.miete_reports (building_id);
create index if not exists idx_miete_reports_status on public.miete_reports (status);
create index if not exists idx_miete_reports_created on public.miete_reports (created_at);

-- 7) Reports (WEG)
create index if not exists idx_weg_reports_reported_by on public.weg_reports (reported_by);
create index if not exists idx_weg_reports_owner on public.weg_reports (weg_owner_id);
create index if not exists idx_weg_reports_building on public.weg_reports (building_id);
create index if not exists idx_weg_reports_status on public.weg_reports (status);
create index if not exists idx_weg_reports_created on public.weg_reports (created_at);

-- 8) Forum
create index if not exists idx_forum_posts_mgmt_created on public.forum_posts (management_mode, created_at desc);
create index if not exists idx_forum_posts_building on public.forum_posts (building_id);
create index if not exists idx_templates_mgmt on public.forum_post_templates (management_mode);

-- 9) Chatbot settings (eine Zeile je management_mode)
create unique index if not exists chatbot_settings_mgmt_unique on public.chatbot_settings (management_mode);
