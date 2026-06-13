
create or replace function public.get_proxy_meeting_state(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_attendee record;
  v_meeting record;
  v_assignment record;
  v_active record;
  v_has_voted boolean := false;
  v_votes jsonb := '[]'::jsonb;
  v_agenda jsonb := '[]'::jsonb;
  v_attendees jsonb := '{}'::jsonb;
  v_yes int := 0; v_no int := 0; v_abs int := 0;
  v_yes_mea numeric := 0; v_no_mea numeric := 0; v_abs_mea numeric := 0;
  v_present int := 0; v_total int := 0;
begin
  select id, meeting_id, assignment_id, proxy_token_used, proxy_external_name
    into v_attendee
  from public.etv_attendees
  where proxy_token = p_token;

  if v_attendee.id is null then
    return jsonb_build_object('error', 'INVALID_TOKEN');
  end if;

  select m.id, m.title, m.status, m.meeting_date, m.location, m.is_secret_ballot,
         b.name as building_name, b.address as building_address, b.id as building_id
    into v_meeting
  from public.etv_meetings m
  left join public.buildings b on b.id = m.building_id
  where m.id = v_attendee.meeting_id;

  select cba.unit_number into v_assignment
  from public.contact_building_assignments cba
  where cba.id = v_attendee.assignment_id;

  -- Active voting item (if any)
  select id, title, description, resolution_text, voting_principle, status
    into v_active
  from public.etv_agenda_items
  where meeting_id = v_attendee.meeting_id
    and status = 'voting'
  order by sort_order
  limit 1;

  if v_active.id is not null then
    select exists(
      select 1 from public.etv_votes
      where agenda_item_id = v_active.id
        and assignment_id = v_attendee.assignment_id
    ) into v_has_voted;

    -- Aggregate live votes
    select
      count(*) filter (where vote='yes'),
      count(*) filter (where vote='no'),
      count(*) filter (where vote='abstain'),
      coalesce(sum(mea_weight) filter (where vote='yes'), 0),
      coalesce(sum(mea_weight) filter (where vote='no'), 0),
      coalesce(sum(mea_weight) filter (where vote='abstain'), 0)
    into v_yes, v_no, v_abs, v_yes_mea, v_no_mea, v_abs_mea
    from public.etv_votes
    where agenda_item_id = v_active.id;

    if v_meeting.is_secret_ballot is not true then
      select coalesce(jsonb_agg(jsonb_build_object(
        'vote', v.vote,
        'unit_number', cba.unit_number,
        'first_name', c.first_name,
        'last_name', c.last_name,
        'company_name', c.company_name
      ) order by cba.unit_number), '[]'::jsonb)
      into v_votes
      from public.etv_votes v
      left join public.contact_building_assignments cba on cba.id = v.assignment_id
      left join public.contacts c on c.id = cba.contact_id
      where v.agenda_item_id = v_active.id;
    end if;
  end if;

  -- Agenda summary
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'title', title, 'status', status, 'result', result
  ) order by sort_order), '[]'::jsonb)
  into v_agenda
  from public.etv_agenda_items
  where meeting_id = v_attendee.meeting_id;

  -- Attendee counts
  select
    count(*) filter (where attendance_type = 'present' or (attendance_type='proxy' and checked_in_at is not null)),
    count(*)
  into v_present, v_total
  from public.etv_attendees
  where meeting_id = v_attendee.meeting_id;

  v_attendees := jsonb_build_object('present', v_present, 'total', v_total);

  return jsonb_build_object(
    'meeting', jsonb_build_object(
      'id', v_meeting.id,
      'title', v_meeting.title,
      'status', v_meeting.status,
      'meeting_date', v_meeting.meeting_date,
      'location', v_meeting.location,
      'is_secret_ballot', v_meeting.is_secret_ballot,
      'building_id', v_meeting.building_id,
      'building_name', v_meeting.building_name,
      'building_address', v_meeting.building_address
    ),
    'assignment', jsonb_build_object(
      'id', v_attendee.assignment_id,
      'unit_number', v_assignment.unit_number
    ),
    'proxy_token_used', coalesce(v_attendee.proxy_token_used, false),
    'proxy_external_name', v_attendee.proxy_external_name,
    'active_voting_item', case when v_active.id is null then null else jsonb_build_object(
      'id', v_active.id,
      'title', v_active.title,
      'description', v_active.description,
      'resolution_text', v_active.resolution_text,
      'voting_principle', v_active.voting_principle
    ) end,
    'has_voted', v_has_voted,
    'live_counts', jsonb_build_object(
      'yes', v_yes, 'no', v_no, 'abstain', v_abs,
      'yes_mea', v_yes_mea, 'no_mea', v_no_mea, 'abstain_mea', v_abs_mea
    ),
    'single_votes', v_votes,
    'agenda', v_agenda,
    'attendees', v_attendees
  );
end;
$$;

grant execute on function public.get_proxy_meeting_state(uuid) to anon, authenticated;
