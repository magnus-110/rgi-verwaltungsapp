-- Protokoll-Unterschrift: zusätzliche Rolle Verwaltungsbeirat
alter table public.etv_protocol_signatures drop constraint if exists etv_protocol_signatures_role_check;
alter table public.etv_protocol_signatures add constraint etv_protocol_signatures_role_check check (role in ('leiter','protokollant','eigentuemer','beirat'));
alter table public.etv_protocol_sign_requests drop constraint if exists etv_protocol_sign_requests_role_check;
alter table public.etv_protocol_sign_requests add constraint etv_protocol_sign_requests_role_check check (role in ('leiter','protokollant','eigentuemer','beirat'));
