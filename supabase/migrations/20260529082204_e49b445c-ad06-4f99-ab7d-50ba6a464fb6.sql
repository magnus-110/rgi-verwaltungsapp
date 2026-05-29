
-- 1) Move any files from Stammakte/Kaufverträge to Eigentümer/Kaufverträge per building
DO $$
DECLARE r record; v_src uuid; v_dst uuid;
BEGIN
  FOR r IN SELECT DISTINCT building_id FROM building_file_categories WHERE slug='stammakte-kaufvertraege' LOOP
    SELECT id INTO v_src FROM building_file_categories WHERE building_id=r.building_id AND slug='stammakte-kaufvertraege';
    SELECT id INTO v_dst FROM building_file_categories WHERE building_id=r.building_id AND slug='eigentuemer-kaufvertraege';
    IF v_dst IS NULL THEN
      -- ensure Eigentümer parent + Kaufverträge child exist
      PERFORM public.ensure_stammakte_categories(r.building_id);
      SELECT id INTO v_dst FROM building_file_categories WHERE building_id=r.building_id AND slug='eigentuemer-kaufvertraege';
    END IF;
    IF v_src IS NOT NULL AND v_dst IS NOT NULL THEN
      UPDATE building_files SET category_id = v_dst WHERE category_id = v_src;
    END IF;
  END LOOP;
END $$;

-- 2) Delete the Stammakte/Kaufverträge category rows
DELETE FROM building_file_categories WHERE slug='stammakte-kaufvertraege';

-- 3) Update seed RPC to no longer create Stammakte/Kaufverträge
CREATE OR REPLACE FUNCTION public.ensure_stammakte_categories(p_building_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mode public.management_mode := 'weg'::public.management_mode;
  v_stammakte uuid;
  v_versammlung uuid;
  v_dienstleister uuid;
  v_jahresbericht uuid;
  v_eigentuemer uuid;
  v_finanzen uuid;
  v_schriftverkehr uuid;
  v_sonstiges uuid;
BEGIN
  INSERT INTO building_file_categories(name,slug,building_id,management_mode,icon,color,sort_order,is_recommended)
  VALUES
    ('Stammakte','stammakte',p_building_id,v_mode,'folder','#3B82F6',1,true),
    ('Versammlung','versammlung',p_building_id,v_mode,'users','#8B5CF6',2,true),
    ('Dienstleister','dienstleister',p_building_id,v_mode,'wrench','#10B981',3,true),
    ('Jahresbericht','jahresbericht',p_building_id,v_mode,'bar-chart','#F59E0B',4,true),
    ('Eigentümer','eigentuemer',p_building_id,v_mode,'user','#EC4899',5,true),
    ('Finanzen','finanzen',p_building_id,v_mode,'wallet','#06B6D4',6,true),
    ('Schriftverkehr','schriftverkehr',p_building_id,v_mode,'mail','#6B7280',7,true),
    ('Sonstiges','sonstiges',p_building_id,v_mode,'folder-open','#9CA3AF',99,false)
  ON CONFLICT (building_id, slug) DO NOTHING;

  SELECT id INTO v_stammakte      FROM building_file_categories WHERE building_id=p_building_id AND slug='stammakte';
  SELECT id INTO v_versammlung    FROM building_file_categories WHERE building_id=p_building_id AND slug='versammlung';
  SELECT id INTO v_dienstleister  FROM building_file_categories WHERE building_id=p_building_id AND slug='dienstleister';
  SELECT id INTO v_jahresbericht  FROM building_file_categories WHERE building_id=p_building_id AND slug='jahresbericht';
  SELECT id INTO v_eigentuemer    FROM building_file_categories WHERE building_id=p_building_id AND slug='eigentuemer';
  SELECT id INTO v_finanzen       FROM building_file_categories WHERE building_id=p_building_id AND slug='finanzen';
  SELECT id INTO v_schriftverkehr FROM building_file_categories WHERE building_id=p_building_id AND slug='schriftverkehr';
  SELECT id INTO v_sonstiges      FROM building_file_categories WHERE building_id=p_building_id AND slug='sonstiges';

  INSERT INTO building_file_categories(name,slug,building_id,management_mode,icon,color,sort_order,parent_id,is_recommended,auto_rag_enabled)
  VALUES
    -- Stammakte (no Kaufverträge subfolder)
    ('Teilungserklärung & Gemeinschaftsordnung','stammakte-teilungserklaerung',p_building_id,v_mode,'scroll','#3B82F6',1,v_stammakte,true,true),
    ('Hausordnung','stammakte-hausordnung',p_building_id,v_mode,'list','#3B82F6',2,v_stammakte,false,true),
    ('Verwaltervertrag / Vollmacht / Übergabeprotokoll','stammakte-verwaltervertrag',p_building_id,v_mode,'file-text','#3B82F6',4,v_stammakte,true,true),
    ('Energiepass','stammakte-energiepass',p_building_id,v_mode,'zap','#3B82F6',5,v_stammakte,false,true),
    ('Bank','stammakte-bank',p_building_id,v_mode,'landmark','#3B82F6',6,v_stammakte,false,false),
    ('Pläne','stammakte-plaene',p_building_id,v_mode,'map','#3B82F6',7,v_stammakte,false,false),
    ('Schließanlage','stammakte-schliessanlage',p_building_id,v_mode,'key','#3B82F6',8,v_stammakte,false,false),
    -- Versammlung
    ('Protokolle','versammlung-protokolle',p_building_id,v_mode,'file-text','#8B5CF6',1,v_versammlung,true,true),
    ('Beschlusssammlung','versammlung-beschluesse',p_building_id,v_mode,'gavel','#8B5CF6',2,v_versammlung,true,true),
    -- Dienstleister
    ('Wartungsverträge','dienstleister-wartung',p_building_id,v_mode,'wrench','#10B981',1,v_dienstleister,true,true),
    ('Versicherungen','dienstleister-versicherungen',p_building_id,v_mode,'shield','#10B981',2,v_dienstleister,true,true),
    ('Prüfberichte','dienstleister-pruefberichte',p_building_id,v_mode,'clipboard-check','#10B981',3,v_dienstleister,false,true),
    ('Angebote','dienstleister-angebote',p_building_id,v_mode,'file-plus','#10B981',4,v_dienstleister,false,false),
    -- Jahresbericht
    ('Gesamtabrechnung','jahresbericht-gesamtabrechnung',p_building_id,v_mode,'file-text','#F59E0B',1,v_jahresbericht,true,true),
    ('Einzelabrechnung','jahresbericht-einzelabrechnung',p_building_id,v_mode,'file-text','#F59E0B',2,v_jahresbericht,true,true),
    ('Gesamtwirtschaftsplan','jahresbericht-gesamt-wp',p_building_id,v_mode,'pie-chart','#F59E0B',3,v_jahresbericht,true,true),
    ('Einzelwirtschaftsplan','jahresbericht-einzel-wp',p_building_id,v_mode,'pie-chart','#F59E0B',4,v_jahresbericht,true,true),
    ('Vermögensbericht','jahresbericht-vermoegen',p_building_id,v_mode,'trending-up','#F59E0B',5,v_jahresbericht,true,true),
    ('§35a Bescheinigung','jahresbericht-35a',p_building_id,v_mode,'receipt','#F59E0B',6,v_jahresbericht,true,true),
    ('Sammelberichte','jahresbericht-sammelberichte',p_building_id,v_mode,'folder','#F59E0B',7,v_jahresbericht,false,false),
    -- Eigentümer
    ('Kaufverträge','eigentuemer-kaufvertraege',p_building_id,v_mode,'file-signature','#EC4899',1,v_eigentuemer,false,false),
    ('Grundbuchauszüge','eigentuemer-grundbuch',p_building_id,v_mode,'book','#EC4899',2,v_eigentuemer,false,false),
    ('ET-Listen','eigentuemer-listen',p_building_id,v_mode,'users','#EC4899',3,v_eigentuemer,false,false),
    -- Finanzen
    ('Kontoauszüge','finanzen-kontoauszuege',p_building_id,v_mode,'landmark','#06B6D4',1,v_finanzen,true,false),
    ('Rechnungen','finanzen-rechnungen',p_building_id,v_mode,'receipt','#06B6D4',2,v_finanzen,true,true),
    ('Zahlungseingänge','finanzen-zahlungseingaenge',p_building_id,v_mode,'arrow-down-circle','#06B6D4',3,v_finanzen,false,false),
    -- Schriftverkehr
    ('Serienbriefe','schriftverkehr-serienbriefe',p_building_id,v_mode,'mail','#6B7280',1,v_schriftverkehr,false,false),
    ('Begrüßungsbriefe','schriftverkehr-begruessungsbriefe',p_building_id,v_mode,'mail-open','#6B7280',2,v_schriftverkehr,false,false)
  ON CONFLICT (building_id, slug) DO NOTHING;
END;
$$;
