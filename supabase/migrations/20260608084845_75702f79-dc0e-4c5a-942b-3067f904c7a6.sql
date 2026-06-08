CREATE OR REPLACE FUNCTION public.seed_annual_cycle_tasks(
  p_building_id uuid,
  p_fiscal_year_start date,
  p_fiscal_year_end date
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  task_keys text[] := ARRAY[
    'beschluesse_umgesetzt',
    'heizkostenabrechnung_beantragt',
    'jahresabrechnung_erstellt',
    'vermoegensbericht_erstellt',
    'wirtschaftsplan_erstellt',
    'tops_abfragen',
    'kassenpruefung',
    'etv_einberufen',
    'etv_protokoll_fertig',
    'beschlusssammlung_aktualisiert',
    'paragraph_35a_versendet',
    'abrechnungsspitzen_gebucht',
    'hausgeldanpassung_umgesetzt',
    'bankabgleich_jahr_abgeschlossen',
    'jahresabschluss_archiviert'
  ];
  k text;
BEGIN
  IF NOT public.user_can_access_building(auth.uid(), p_building_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  FOREACH k IN ARRAY task_keys LOOP
    INSERT INTO public.annual_cycle_tasks (building_id, fiscal_year_start, fiscal_year_end, task_key)
    VALUES (p_building_id, p_fiscal_year_start, p_fiscal_year_end, k)
    ON CONFLICT (building_id, fiscal_year_start, task_key) DO NOTHING;
  END LOOP;
END $$;