
-- Wirtschaftsplan 2025 Birkenweg 6: Items aus HV-Office-Abrechnung 2025 (Plan-Spalte) eintragen
-- Plan-Datensatz: 33cc4f5b-dadb-4b8d-9002-d52a3f7145a1 (active, source='manual')
-- Quelle: Abrechnung_Birkenweg_HV_Office_1.pdf (vom Eigentümer übermittelt)

INSERT INTO public.economic_plan_items (plan_id, account_id, planned_amount, adjustment_reason)
VALUES
  -- 1030 Papiertonne (HV-Office) → unser 1030 (Wasser/Entw.) - Bezeichnung weicht ab, Wert lt. PDF
  ('33cc4f5b-dadb-4b8d-9002-d52a3f7145a1', '00a7f0fb-f680-4bc4-b44b-ee99e1b21846', 27.84,
   'HV-Office-Plan 2025: Papiertonne 27,84 €. Hinweis: HV-Office-Konto 1030 entspricht in unserem Kontenrahmen ggf. einem anderen Konto - Bezeichnung prüfen.'),

  ('33cc4f5b-dadb-4b8d-9002-d52a3f7145a1', '62f1a4d2-f561-4356-a217-cfa498e9956f', 111.68,
   'HV-Office-Plan 2025: Allgemeinstrom 111,68 €.'),

  -- HV-Office hat 1300 (Sach/Haftpflicht 41,65) + 1310 (Wohngeb. 854,32) - bei uns auf 1300 zusammengefasst
  ('33cc4f5b-dadb-4b8d-9002-d52a3f7145a1', 'bc5458b5-cb59-42c3-b198-4d8db51ee141', 895.97,
   'HV-Office-Plan 2025: Versicherungen gesamt = Sach/Haftpflicht 41,65 € + Wohngebäude 854,32 €. In unserem Kontenrahmen auf Konto 1300 (Hauptkonto Versicherungen) konsolidiert.'),

  ('33cc4f5b-dadb-4b8d-9002-d52a3f7145a1', 'cf2b62d5-b1a4-4598-a2d3-40c5e179ef84', 5148.99,
   'HV-Office-Plan 2025: Heizung/Warmwasser 5.148,99 €.'),

  ('33cc4f5b-dadb-4b8d-9002-d52a3f7145a1', '64bfc5e6-31c6-4ae4-8983-3cb9bcf73123', 1927.80,
   'HV-Office-Plan 2025: Verwaltungsgebühren 1.927,80 €.'),

  ('33cc4f5b-dadb-4b8d-9002-d52a3f7145a1', '04066968-7310-438b-978f-afd19fbcdd80', 144.32,
   'HV-Office-Plan 2025: Kontogebühren 144,32 €.'),

  -- HV-Office 1530 Lfd. Instandhaltung → bei uns 1600 (Laufende Instandhaltung/Reparaturen)
  ('33cc4f5b-dadb-4b8d-9002-d52a3f7145a1', '4ae7880f-1028-4cd6-a4c5-38cc14edf50c', 240.98,
   'HV-Office-Plan 2025: Lfd. Instandhaltung 240,98 € (HV-Office-Konto 1530 → bei uns Konto 1600).')
ON CONFLICT DO NOTHING;

-- Plan-Summen abgleichen (Bewirtschaftungskosten ohne Rücklage):
-- 27,84 + 111,68 + 895,97 + 5.148,99 + 1.927,80 + 144,32 + 240,98 = 8.497,58 €
-- + Rücklage 3.600,00 = Wirtschaftsplansumme 12.097,58 € ✓ (matcht PDF)
-- HV-Office Vorschussverpflichtung 14.100,00 € (höher als Plansumme, da Vorsorge-Puffer)

-- total_costs auf Plansumme ohne Rücklage updaten (war 10.500,12)
UPDATE public.economic_plans
SET total_costs = 8497.58,
    notes = COALESCE(notes,'') || E'\nPlan-Items eingetragen aus HV-Office-Abrechnung 2025. Plansumme inkl. Rücklage: 12.097,58 € (PDF-Wert: 12.097,58 € ✓). Vorschussverpflichtung 14.100,00 € (HV-Office-Wert).'
WHERE id = '33cc4f5b-dadb-4b8d-9002-d52a3f7145a1';
