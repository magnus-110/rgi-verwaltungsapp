WITH eff AS (
  SELECT epi.id AS item_id,
         COALESCE(o.distribution_key, a.default_distribution_key, 'mea') AS new_key
  FROM public.economic_plan_items epi
  JOIN public.economic_plans ep ON ep.id = epi.plan_id
  JOIN public.chart_of_accounts a ON a.id = epi.account_id
  LEFT JOIN public.building_account_overrides o
    ON o.building_id = ep.building_id AND o.account_id = epi.account_id
)
UPDATE public.economic_plan_items epi
SET distribution_key = eff.new_key
FROM eff
WHERE epi.id = eff.item_id
  AND COALESCE(LOWER(epi.distribution_key), '') IS DISTINCT FROM LOWER(eff.new_key);