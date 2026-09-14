-- Auszählung nach Köpfen statt nach Einheiten: Einheiten desselben Eigentümers
-- können zu einem Kopf zusammengefasst sein (head_weight = 0), § 25 Abs. 2 WEG.
drop function if exists public.rgi_agenda_item_vote_totals(uuid);

create function public.rgi_agenda_item_vote_totals(p_agenda_item_id uuid)
returns table(k_ja numeric, k_nein numeric, k_enth numeric, mea_ja numeric, mea_nein numeric, mea_enth numeric)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    round(coalesce(sum(coalesce(v.head_weight, 1)) filter (where v.vote = 'yes'), 0), 2),
    round(coalesce(sum(coalesce(v.head_weight, 1)) filter (where v.vote = 'no'), 0), 2),
    round(coalesce(sum(coalesce(v.head_weight, 1)) filter (where v.vote in ('abstain','abstention','abstained','enthaltung')), 0), 2),
    round(coalesce(sum(v.mea_weight) filter (where v.vote = 'yes'), 0), 3),
    round(coalesce(sum(v.mea_weight) filter (where v.vote = 'no'), 0), 3),
    round(coalesce(sum(v.mea_weight) filter (where v.vote in ('abstain','abstention','abstained','enthaltung')), 0), 3)
  from public.etv_votes v
  where v.agenda_item_id = p_agenda_item_id;
$function$;

comment on function public.rgi_agenda_item_vote_totals(uuid) is
  'Stimmensummen eines TOPs: Koepfe gewichtet mit etv_votes.head_weight (zusammengefasste Einheiten zaehlen einmal), MEA wie bisher.';
