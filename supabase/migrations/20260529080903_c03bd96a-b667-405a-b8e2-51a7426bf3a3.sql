-- =========================================================
-- DMS: Einheitliche Ordnerstruktur + Bestands-Remapping
-- =========================================================

-- 1. Snapshot der bestehenden Kategorien (mit Parent-Slug-Kontext)
CREATE TEMP TABLE _old_cats_ctx ON COMMIT DROP AS
SELECT c.id        AS old_id,
       c.building_id,
       c.name      AS name,
       c.slug      AS old_slug,
       p.slug      AS parent_slug,
       p.name      AS parent_name
FROM public.building_file_categories c
LEFT JOIN public.building_file_categories p ON p.id = c.parent_id
WHERE c.building_id IS NOT NULL;

-- 2. Slugs aller gebäudespezifischen Kategorien freigeben (Index hat WHERE slug IS NOT NULL)
UPDATE public.building_file_categories
   SET slug = NULL
 WHERE building_id IS NOT NULL;

-- 3. Neue Seed-Funktion mit Soll-Struktur
CREATE OR REPLACE FUNCTION public.ensure_stammakte_categories(p_building_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mode public.management_mode;
  v_stammakte uuid; v_versammlung uuid; v_dienstleister uuid;
  v_jahresbericht uuid; v_eigentuemer uuid; v_finanzen uuid;
  v_schriftverkehr uuid; v_sonstiges uuid;
BEGIN
  SELECT management_mode INTO v_mode FROM public.buildings WHERE id = p_building_id;
  IF v_mode IS NULL THEN RETURN; END IF;

  -- Top-Level
  INSERT INTO public.building_file_categories (name, slug, building_id, management_mode, icon, color, sort_order, is_recommended, auto_rag_enabled)
  VALUES ('Stammakte','stammakte',p_building_id,v_mode,'folder-archive','#6366F1',10,true,true)
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_stammakte FROM public.building_file_categories WHERE building_id=p_building_id AND slug='stammakte';

  INSERT INTO public.building_file_categories (name, slug, building_id, management_mode, icon, color, sort_order, is_recommended, auto_rag_enabled)
  VALUES ('Versammlung','versammlung',p_building_id,v_mode,'users','#10B981',20,true,true)
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_versammlung FROM public.building_file_categories WHERE building_id=p_building_id AND slug='versammlung';

  INSERT INTO public.building_file_categories (name, slug, building_id, management_mode, icon, color, sort_order, is_recommended, auto_rag_enabled)
  VALUES ('Dienstleister','dienstleister',p_building_id,v_mode,'wrench','#0EA5E9',30,true,true)
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_dienstleister FROM public.building_file_categories WHERE building_id=p_building_id AND slug='dienstleister';

  INSERT INTO public.building_file_categories (name, slug, building_id, management_mode, icon, color, sort_order, is_recommended, auto_rag_enabled)
  VALUES ('Jahresbericht','jahresbericht',p_building_id,v_mode,'file-spreadsheet','#8B5CF6',40,true,true)
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_jahresbericht FROM public.building_file_categories WHERE building_id=p_building_id AND slug='jahresbericht';

  INSERT INTO public.building_file_categories (name, slug, building_id, management_mode, icon, color, sort_order, is_recommended, auto_rag_enabled)
  VALUES ('Eigentümer','eigentuemer',p_building_id,v_mode,'users','#EC4899',50,true,true)
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_eigentuemer FROM public.building_file_categories WHERE building_id=p_building_id AND slug='eigentuemer';

  INSERT INTO public.building_file_categories (name, slug, building_id, management_mode, icon, color, sort_order)
  VALUES ('Finanzen','finanzen',p_building_id,v_mode,'wallet','#F59E0B',60)
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_finanzen FROM public.building_file_categories WHERE building_id=p_building_id AND slug='finanzen';

  INSERT INTO public.building_file_categories (name, slug, building_id, management_mode, icon, color, sort_order)
  VALUES ('Schriftverkehr','schriftverkehr',p_building_id,v_mode,'mail','#64748B',70)
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_schriftverkehr FROM public.building_file_categories WHERE building_id=p_building_id AND slug='schriftverkehr';

  INSERT INTO public.building_file_categories (name, slug, building_id, management_mode, icon, color, sort_order)
  VALUES ('Sonstiges','sonstiges',p_building_id,v_mode,'folder','#94A3B8',999)
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_sonstiges FROM public.building_file_categories WHERE building_id=p_building_id AND slug='sonstiges';

  -- Stammakte Unterordner
  INSERT INTO public.building_file_categories (name, slug, building_id, management_mode, icon, color, sort_order, parent_id, is_recommended, auto_rag_enabled) VALUES
    ('Teilungserklärung & Gemeinschaftsordnung','stammakte-teilungserklaerung',p_building_id,v_mode,'file-text','#6366F1',1,v_stammakte,true,true),
    ('Hausordnung','stammakte-hausordnung',p_building_id,v_mode,'file-text','#6366F1',2,v_stammakte,true,true),
    ('Kaufverträge','stammakte-kaufvertraege',p_building_id,v_mode,'file-signature','#6366F1',3,v_stammakte,false,true),
    ('Verwaltervertrag / Vollmacht / Übergabeprotokoll','stammakte-verwaltervertrag',p_building_id,v_mode,'file-signature','#6366F1',4,v_stammakte,true,true),
    ('Energiepass','stammakte-energiepass',p_building_id,v_mode,'leaf','#6366F1',5,v_stammakte,false,true),
    ('Bank','stammakte-bank',p_building_id,v_mode,'landmark','#6366F1',6,v_stammakte,false,true),
    ('Pläne','stammakte-plaene',p_building_id,v_mode,'map','#6366F1',7,v_stammakte,false,false),
    ('Schließanlage','stammakte-schliessanlage',p_building_id,v_mode,'key','#6366F1',8,v_stammakte,false,false)
  ON CONFLICT DO NOTHING;

  -- Versammlung Unterordner
  INSERT INTO public.building_file_categories (name, slug, building_id, management_mode, icon, color, sort_order, parent_id, is_recommended, auto_rag_enabled) VALUES
    ('Protokolle','versammlung-protokolle',p_building_id,v_mode,'file-text','#10B981',1,v_versammlung,true,true),
    ('Beschlusssammlung','versammlung-beschluesse',p_building_id,v_mode,'gavel','#10B981',2,v_versammlung,true,true)
  ON CONFLICT DO NOTHING;

  -- Dienstleister Unterordner
  INSERT INTO public.building_file_categories (name, slug, building_id, management_mode, icon, color, sort_order, parent_id, is_recommended, auto_rag_enabled) VALUES
    ('Wartungsverträge','dienstleister-wartung',p_building_id,v_mode,'wrench','#0EA5E9',1,v_dienstleister,true,true),
    ('Versicherungen','dienstleister-versicherungen',p_building_id,v_mode,'shield','#0EA5E9',2,v_dienstleister,true,true),
    ('Prüfberichte','dienstleister-pruefberichte',p_building_id,v_mode,'shield-check','#0EA5E9',3,v_dienstleister,true,true),
    ('Angebote','dienstleister-angebote',p_building_id,v_mode,'file-text','#0EA5E9',4,v_dienstleister,false,false)
  ON CONFLICT DO NOTHING;

  -- Jahresbericht Unterordner
  INSERT INTO public.building_file_categories (name, slug, building_id, management_mode, icon, color, sort_order, parent_id, auto_rag_enabled) VALUES
    ('Gesamtabrechnung','jahresbericht-gesamtabrechnung',p_building_id,v_mode,'file-spreadsheet','#8B5CF6',1,v_jahresbericht,false),
    ('Einzelabrechnung','jahresbericht-einzelabrechnung',p_building_id,v_mode,'file-spreadsheet','#8B5CF6',2,v_jahresbericht,false),
    ('Gesamtwirtschaftsplan','jahresbericht-gesamt-wp',p_building_id,v_mode,'file-spreadsheet','#8B5CF6',3,v_jahresbericht,false),
    ('Einzelwirtschaftsplan','jahresbericht-einzel-wp',p_building_id,v_mode,'file-spreadsheet','#8B5CF6',4,v_jahresbericht,false),
    ('Vermögensbericht','jahresbericht-vermoegen',p_building_id,v_mode,'trending-up','#8B5CF6',5,v_jahresbericht,false),
    ('§35a Bescheinigung','jahresbericht-35a',p_building_id,v_mode,'receipt','#8B5CF6',6,v_jahresbericht,false),
    ('Sammelberichte','jahresbericht-sammelberichte',p_building_id,v_mode,'folder-archive','#8B5CF6',7,v_jahresbericht,false)
  ON CONFLICT DO NOTHING;

  -- Eigentümer Unterordner
  INSERT INTO public.building_file_categories (name, slug, building_id, management_mode, icon, color, sort_order, parent_id, auto_rag_enabled) VALUES
    ('Kaufverträge','eigentuemer-kaufvertraege',p_building_id,v_mode,'file-signature','#EC4899',1,v_eigentuemer,false),
    ('Grundbuchauszüge','eigentuemer-grundbuch',p_building_id,v_mode,'file-text','#EC4899',2,v_eigentuemer,false),
    ('ET-Listen','eigentuemer-listen',p_building_id,v_mode,'users','#EC4899',3,v_eigentuemer,false)
  ON CONFLICT DO NOTHING;

  -- Finanzen Unterordner
  INSERT INTO public.building_file_categories (name, slug, building_id, management_mode, icon, color, sort_order, parent_id, auto_rag_enabled) VALUES
    ('Kontoauszüge','finanzen-kontoauszuege',p_building_id,v_mode,'landmark','#F59E0B',1,v_finanzen,false),
    ('Rechnungen','finanzen-rechnungen',p_building_id,v_mode,'receipt','#F59E0B',2,v_finanzen,false),
    ('Zahlungseingänge','finanzen-zahlungseingaenge',p_building_id,v_mode,'arrow-down-circle','#F59E0B',3,v_finanzen,false)
  ON CONFLICT DO NOTHING;

  -- Schriftverkehr Unterordner
  INSERT INTO public.building_file_categories (name, slug, building_id, management_mode, icon, color, sort_order, parent_id, auto_rag_enabled) VALUES
    ('Serienbriefe','schriftverkehr-serienbriefe',p_building_id,v_mode,'mail','#64748B',1,v_schriftverkehr,false),
    ('Begrüßungsbriefe','schriftverkehr-begruessungsbriefe',p_building_id,v_mode,'mail','#64748B',2,v_schriftverkehr,false)
  ON CONFLICT DO NOTHING;
END;
$$;

-- 4. Soll-Struktur für alle Gebäude erzeugen
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.buildings LOOP
    PERFORM public.ensure_stammakte_categories(r.id);
  END LOOP;
END $$;

-- 5. Remap-Tabelle: alte Kategorie-ID → neue Slug
CREATE TEMP TABLE _remap ON COMMIT DROP AS
SELECT old_id, building_id, name, old_slug, parent_slug,
  CASE
    -- exakte Slug-Mappings
    WHEN old_slug = 'finanzen-gesamtabrechnungen' THEN 'jahresbericht-gesamtabrechnung'
    WHEN old_slug = 'finanzen-einzelabrechnungen' THEN 'jahresbericht-einzelabrechnung'
    WHEN old_slug = 'finanzen-wirtschaftsplaene'  THEN 'jahresbericht-gesamt-wp'
    WHEN old_slug = 'finanzen-rechnungen'         THEN 'finanzen-rechnungen'
    WHEN old_slug = 'rechnungen'                  THEN 'finanzen-rechnungen'
    WHEN old_slug = 'finanzen-kontoauszuege'      THEN 'finanzen-kontoauszuege'
    WHEN old_slug = 'stammakte-versicherungen'    THEN 'dienstleister-versicherungen'
    WHEN old_slug = 'stammakte-grundbuch'         THEN 'eigentuemer-grundbuch'
    WHEN old_slug = 'stammakte-gemeinschaftsordnung' THEN 'stammakte-teilungserklaerung'
    WHEN old_slug = 'stammakte-teilungserklaerung' THEN 'stammakte-teilungserklaerung'
    WHEN old_slug = 'stammakte-hausordnung'       THEN 'stammakte-hausordnung'
    WHEN old_slug = 'stammakte-stammdaten'        THEN 'sonstiges'
    WHEN old_slug = 'pruefberichte'               THEN 'dienstleister-pruefberichte'
    WHEN old_slug = 'vertraege-versorger'         THEN 'dienstleister-wartung'
    WHEN old_slug = 'vertraege-dienstleister'     THEN 'dienstleister-wartung'
    WHEN old_slug = 'vertraege-bank'              THEN 'stammakte-bank'
    WHEN old_slug = 'protokolle'                  THEN 'versammlung-protokolle'
    WHEN old_slug = 'serienbriefe'                THEN 'schriftverkehr-serienbriefe'
    WHEN old_slug = 'begruessungsbriefe'          THEN 'schriftverkehr-begruessungsbriefe'
    WHEN old_slug = 'korrespondenz'               THEN 'schriftverkehr'
    WHEN old_slug = 'personen'                    THEN 'eigentuemer'
    WHEN old_slug = 'sonstiges'                   THEN 'sonstiges'
    WHEN old_slug = 'stammakte'                   THEN 'stammakte'
    WHEN old_slug = 'finanzen'                    THEN 'finanzen'
    WHEN old_slug = 'vertraege'                   THEN 'dienstleister'
    -- Name-Heuristik (case-insensitive)
    WHEN parent_slug = 'finanzen-wirtschaftsplaene' AND name ILIKE 'einzel%' THEN 'jahresbericht-einzel-wp'
    WHEN name ILIKE 'einzelwirtschaftsplan%'                 THEN 'jahresbericht-einzel-wp'
    WHEN name ILIKE 'gesamtwirtschaftsplan%'                 THEN 'jahresbericht-gesamt-wp'
    WHEN name ILIKE 'wirtschaftsplan%' OR name ILIKE 'wirtschaftspl%ne' THEN 'jahresbericht-gesamt-wp'
    WHEN name ILIKE 'gesamtabrechnung%'                      THEN 'jahresbericht-gesamtabrechnung'
    WHEN name ILIKE 'einzelabrechnung%'
      OR name ILIKE 'nebenkostenabrechnung%'
      OR name ILIKE 'hausgeldabrechnung%'                    THEN 'jahresbericht-einzelabrechnung'
    WHEN name ILIKE 'verm%gensbericht%' OR name ILIKE 'vermoegensbericht%' THEN 'jahresbericht-vermoegen'
    WHEN name ILIKE '%35a%'                                  THEN 'jahresbericht-35a'
    WHEN name ILIKE 'sammelbericht%'                         THEN 'jahresbericht-sammelberichte'
    WHEN name ILIKE 'verwalter%' OR name ILIKE 'vollmacht%'
      OR name ILIKE '%bergabeprotokoll%'                     THEN 'stammakte-verwaltervertrag'
    WHEN name ILIKE 'energieausweis%' OR name ILIKE 'energieasuweis%'
      OR name ILIKE 'energiepass%'                           THEN 'stammakte-energiepass'
    WHEN name ILIKE 'pl%ne' OR name ILIKE 'plaene'           THEN 'stammakte-plaene'
    WHEN name ILIKE 'schlie%anlage' OR name ILIKE 'schliessanlage' THEN 'stammakte-schliessanlage'
    WHEN name ILIKE 'teilungserkl%rung%' OR name ILIKE 'gemeinschaftsordnung%' THEN 'stammakte-teilungserklaerung'
    WHEN name ILIKE 'hausordnung%'                           THEN 'stammakte-hausordnung'
    WHEN name ILIKE 'kaufvertr%'                             THEN 'stammakte-kaufvertraege'
    WHEN name ILIKE 'mietvertrag%'                           THEN 'stammakte-kaufvertraege'
    WHEN name ILIKE 'versammlungsprotokoll%' OR name ILIKE 'protokoll%' THEN 'versammlung-protokolle'
    WHEN name ILIKE 'beschluss%'                             THEN 'versammlung-beschluesse'
    WHEN name ILIKE 'versicherung%'                          THEN 'dienstleister-versicherungen'
    WHEN name ILIKE 'wartung%'                               THEN 'dienstleister-wartung'
    WHEN name ILIKE 'angebot%'                               THEN 'dienstleister-angebote'
    WHEN name ILIKE 'pr%fbericht%' OR name ILIKE 'pruefbericht%' THEN 'dienstleister-pruefberichte'
    WHEN name ILIKE 'rechnung%'                              THEN 'finanzen-rechnungen'
    WHEN name ILIKE 'kontoauszug%' OR name ILIKE 'kontoausz%ge' THEN 'finanzen-kontoauszuege'
    WHEN name ILIKE 'zahlungseing%' OR name ILIKE 'zahlung%' THEN 'finanzen-zahlungseingaenge'
    WHEN name ILIKE 'bank%'                                  THEN 'stammakte-bank'
    WHEN name ILIKE 'grundbuch%'                             THEN 'eigentuemer-grundbuch'
    WHEN name ILIKE 'et-liste%' OR name ILIKE 'eigent%merliste%' THEN 'eigentuemer-listen'
    WHEN name ILIKE 'serienbrief%'                           THEN 'schriftverkehr-serienbriefe'
    WHEN name ILIKE 'begr%ungsbrief%' OR name ILIKE 'begruessungsbrief%' THEN 'schriftverkehr-begruessungsbriefe'
    ELSE NULL
  END AS new_slug
FROM _old_cats_ctx;

-- 6. Auflösen: alte ID → neue ID
CREATE TEMP TABLE _remap_resolved ON COMMIT DROP AS
SELECT r.old_id, r.building_id, r.new_slug, c.id AS new_id
FROM _remap r
JOIN public.building_file_categories c
  ON c.building_id = r.building_id
 AND c.slug = r.new_slug
WHERE r.new_slug IS NOT NULL;

-- 7. Dateien umhängen
UPDATE public.building_files f
   SET category_id = m.new_id
  FROM _remap_resolved m
 WHERE f.category_id = m.old_id
   AND m.old_id <> m.new_id;

-- 8. Dateien ohne Kategorie per Namens-Heuristik einsortieren
UPDATE public.building_files bf
   SET category_id = c.id
  FROM public.building_file_categories c
 WHERE bf.deleted_at IS NULL
   AND bf.category_id IS NULL
   AND c.building_id = bf.building_id
   AND c.slug = CASE
     WHEN bf.display_name ILIKE 'einzelabrechnung%'            THEN 'jahresbericht-einzelabrechnung'
     WHEN bf.display_name ILIKE 'gesamtabrechnung%'            THEN 'jahresbericht-gesamtabrechnung'
     WHEN bf.display_name ILIKE 'einzelwirtschaftsplan%'       THEN 'jahresbericht-einzel-wp'
     WHEN bf.display_name ILIKE 'gesamtwirtschaftsplan%'       THEN 'jahresbericht-gesamt-wp'
     WHEN bf.display_name ILIKE 'wirtschaftsplan%'             THEN 'jahresbericht-gesamt-wp'
     WHEN bf.display_name ILIKE 'verm%gensbericht%'
       OR bf.display_name ILIKE 'vermoegensbericht%'           THEN 'jahresbericht-vermoegen'
     WHEN bf.display_name ILIKE '%35a%'                        THEN 'jahresbericht-35a'
     ELSE NULL
   END;

-- 9. Unbekannte Alt-Kategorien mit Dateien unter "Sonstiges" einsortieren
UPDATE public.building_file_categories c
   SET parent_id = s.id
  FROM public.building_file_categories s
 WHERE s.slug = 'sonstiges'
   AND s.building_id = c.building_id
   AND c.building_id IS NOT NULL
   AND c.slug IS NULL
   AND c.id <> s.id
   AND EXISTS (SELECT 1 FROM public.building_files f WHERE f.category_id = c.id AND f.deleted_at IS NULL);

-- 10. Leere Alt-Container aufräumen (iterativ, Eltern erst nach Kindern)
DO $$
DECLARE n int;
BEGIN
  FOR i IN 1..6 LOOP
    DELETE FROM public.building_file_categories c
     WHERE c.building_id IS NOT NULL
       AND c.slug IS NULL
       AND NOT EXISTS (SELECT 1 FROM public.building_files f WHERE f.category_id = c.id)
       AND NOT EXISTS (SELECT 1 FROM public.building_file_categories ch WHERE ch.parent_id = c.id);
    GET DIAGNOSTICS n = ROW_COUNT;
    EXIT WHEN n = 0;
  END LOOP;
END $$;