alter table public.etv_meetings add column if not exists meeting_kind text not null default 'ordentlich';
alter table public.etv_meetings drop constraint if exists etv_meetings_meeting_kind_check;
alter table public.etv_meetings add constraint etv_meetings_meeting_kind_check check (meeting_kind in ('ordentlich','ausserordentlich'));
update public.etv_meetings set meeting_kind = 'ausserordentlich' where title ilike '%außerordentlich%' or title ilike '%ausserordentlich%';
comment on column public.etv_meetings.meeting_kind is 'Art der Versammlung: ordentlich (zählt für § 24 Abs. 1 WEG) oder ausserordentlich.';
