-- Heizkosten: Umlageschlüssel je Anlage frei wählbar
-- =================================================
--
-- Bisher wurde der Anteil des Gemeinschaftseigentums (Hausmeisterwohnung,
-- Gemeinschaftsräume) fest nach Wohnfläche auf die übrigen Einheiten verteilt.
-- Welcher Schlüssel richtig ist, steht aber in der Teilungserklärung bzw. im
-- Beschluss der Gemeinschaft und ist von Haus zu Haus verschieden — am
-- Achweg 3-5 wird zum Beispiel nach Einheiten verteilt, nicht nach Quadratmeter.
--
-- Der Schlüssel wird deshalb je Anlage eingestellt. Die möglichen Werte sind
-- genau die Anteile, die in der App ohnehin schon je Person gepflegt sind
-- (contact_building_shares.share_type, definiert in building_share_types):
-- 'qm', 'einheit', 'mea', 'personen' und die hausspezifischen Schlüssel.

alter table public.heating_systems
  add column if not exists common_area_share_type text not null default 'qm';

comment on column public.heating_systems.common_area_share_type is
  'Umlageschlüssel für das Gemeinschaftseigentum. Verweist auf contact_building_shares.share_type des Gebäudes, z. B. qm, einheit, mea.';

-- Abrechnungsfläche je Nutzernummer
-- ---------------------------------
-- Die Fläche, mit der der Messdienstleister rechnet, ist nicht immer die
-- Wohnfläche aus der Teilungserklärung: Balkone, Dachschrägen und
-- Nebenräume werden anders gewichtet. Wo sie von der App abweicht, steht sie
-- ab jetzt direkt an der Nutzernummer und hat Vorrang vor dem qm-Anteil.
alter table public.heating_user_mapping
  add column if not exists billing_area_m2 numeric(10,2);

comment on column public.heating_user_mapping.billing_area_m2 is
  'Abrechnungsfläche laut Messdienstleister. Hat Vorrang vor dem qm-Anteil der Zuordnung; leer lassen, wenn beide gleich sind.';
