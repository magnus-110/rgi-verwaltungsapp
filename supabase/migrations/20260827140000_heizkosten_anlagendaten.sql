-- Heizkostenmodul: Felder für die Angaben, die in den Abrechnungen der
-- Messdienstleister stehen und bisher kein Zuhause hatten.
--
-- Drei Dinge haben sich beim Durchgehen der Unterlagen gezeigt:
--
--  1. Nicht jede Anlage rechnet über das Kalenderjahr ab. Ahornstr. und
--     Neuer Weg 8 laufen 01.05.–30.04., Straußbergstr. 01.03.–28.02.,
--     Birkenweg 13 01.04.–31.03., Josbergweg 01.06.–31.05.
--  2. Die Grundkosten für Heizung und Warmwasser werden teilweise über
--     UNTERSCHIEDLICHE Flächen verteilt (Birkenweg 7, beide Vilstalstr.).
--  3. Der Heizwert des Brennstoffs steht im Kopf der Abrechnung und wird
--     für die §9-Trennung gebraucht (Heizöl 10 kWh/l, Pellets 5 kWh/kg).
--
-- Alles additiv, keine bestehende Spalte wird verändert.

alter table public.heating_systems
  -- Fläche, über die die Warmwasser-Grundkosten verteilt werden.
  -- Bleibt leer, wenn sie mit billing_area_m2 (Heizung) übereinstimmt.
  add column if not exists hotwater_area_m2 numeric,

  -- Heizwert je Brennstoffeinheit und die Einheit selbst.
  add column if not exists calorific_value_kwh numeric,
  add column if not exists fuel_unit text,

  -- Beginn des Abrechnungsjahres. 1/1 = Kalenderjahr.
  add column if not exists period_start_month smallint not null default 1,
  add column if not exists period_start_day smallint not null default 1,

  -- Anteil des Eigentümers an den CO2-Kosten nach CO2KostAufG.
  -- Wird je Abrechnung neu eingestuft; hier steht der zuletzt bekannte Wert.
  add column if not exists co2_owner_share numeric,

  -- Bezugsgröße der Heizungs-Verbrauchskosten laut Abrechnung:
  -- 'einheiten' (Heizkostenverteiler), 'kwh', 'mwh', 'liter', 'm3'
  add column if not exists heating_consumption_unit text,

  -- Woher die Einstellungen stammen (Dateiname + Zeitraum), damit später
  -- nachvollziehbar ist, gegen welches Dokument geprüft wurde.
  add column if not exists settings_source text;

alter table public.heating_systems
  drop constraint if exists heating_systems_fuel_unit_check;
alter table public.heating_systems
  add constraint heating_systems_fuel_unit_check
  check (fuel_unit is null or fuel_unit in ('liter', 'kg', 'm3', 'kwh'));

alter table public.heating_systems
  drop constraint if exists heating_systems_consumption_unit_check;
alter table public.heating_systems
  add constraint heating_systems_consumption_unit_check
  check (heating_consumption_unit is null
         or heating_consumption_unit in ('einheiten', 'kwh', 'mwh', 'liter', 'm3'));

alter table public.heating_systems
  drop constraint if exists heating_systems_period_start_check;
alter table public.heating_systems
  add constraint heating_systems_period_start_check
  check (period_start_month between 1 and 12 and period_start_day between 1 and 28);

comment on column public.heating_systems.hotwater_area_m2 is
  'Fläche für die Warmwasser-Grundkosten, wenn sie von der Heizungsfläche abweicht';
comment on column public.heating_systems.period_start_month is
  'Beginn des Abrechnungsjahres (Monat). 1 = Kalenderjahr.';
comment on column public.heating_systems.co2_owner_share is
  'Anteil des Eigentümers an den CO2-Kosten nach CO2KostAufG, zuletzt bekannter Wert';
comment on column public.heating_systems.settings_source is
  'Beleg für die eingetragenen Einstellungen: Dokument und Zeitraum';
