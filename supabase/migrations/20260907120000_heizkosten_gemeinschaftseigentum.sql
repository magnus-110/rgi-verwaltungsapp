-- Manche Nutzernummern des Messdienstleisters sind keine Wohnung eines
-- Eigentuemers, sondern Gemeinschaftseigentum: Hausmeisterwohnung,
-- Gemeinschaftsraeume, Waschkueche.
--
-- Sie einfach wegzulassen waere falsch: sie haben Flaeche und Verbrauch, und
-- ohne sie fehlte beides in der Bezugsgroesse - alle anderen zahlten zu viel.
-- Ihr Anteil wird deshalb ganz normal gerechnet und danach nach Wohnflaeche
-- auf die uebrigen Einheiten umgelegt (siehe abrechnung.ts, Schritt 4b).
--
-- Die Flaeche steht direkt an der Nutzernummer, weil in der App keine Einheit
-- dahintersteht, an der sie haengen koennte.

alter table public.heating_user_mapping
  add column if not exists is_common_area boolean not null default false,
  add column if not exists common_area_m2 numeric;

comment on column public.heating_user_mapping.is_common_area is
  'Gemeinschaftseigentum: Anteil wird gerechnet und danach auf alle Einheiten umgelegt';
comment on column public.heating_user_mapping.common_area_m2 is
  'Flaeche laut Messdienstleister, da keine Einheit der App dahinter steht';

-- Achweg 3-5: 0001 Hausmeisterwohnung, 0002 Gemeinschaftsraeume
update public.heating_user_mapping m
set is_common_area = true,
    common_area_m2 = case m.provider_user_no when '0001' then 77.50 else 101.05 end,
    confidence = 'bestaetigt',
    matched_by = 'Gemeinschaftseigentum - wird auf alle Einheiten umgelegt'
from public.heating_systems hs
where hs.id = m.heating_system_id
  and hs.provider_property_no = '202087'
  and m.provider_user_no in ('0001', '0002');
