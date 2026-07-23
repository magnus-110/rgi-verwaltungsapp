
-- 1) Enum erweitern
ALTER TYPE public.survey_status ADD VALUE IF NOT EXISTS 'paused';
ALTER TYPE public.survey_status ADD VALUE IF NOT EXISTS 'archived';

-- 2) surveys: neue Spalten
ALTER TABLE public.surveys
  ADD COLUMN IF NOT EXISTS is_visible_to_owners boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS welcome_title text,
  ADD COLUMN IF NOT EXISTS welcome_message text,
  ADD COLUMN IF NOT EXISTS end_title text,
  ADD COLUMN IF NOT EXISTS end_message text;

-- 3) survey_items: Info-Typ + Abhängigkeiten
ALTER TABLE public.survey_items
  ADD COLUMN IF NOT EXISTS item_type text NOT NULL DEFAULT 'question',
  ADD COLUMN IF NOT EXISTS depends_on_item_id uuid REFERENCES public.survey_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS depends_on_choice public.survey_choice;

ALTER TABLE public.survey_items DROP CONSTRAINT IF EXISTS survey_items_item_type_check;
ALTER TABLE public.survey_items
  ADD CONSTRAINT survey_items_item_type_check CHECK (item_type IN ('question','info'));

-- 4) RLS neu: Eigentümer sehen nur aktive & sichtbare Umfragen im gültigen Zeitfenster
DROP POLICY IF EXISTS surveys_select_owner ON public.surveys;
CREATE POLICY surveys_select_owner ON public.surveys
FOR SELECT USING (
  status = 'open'::survey_status
  AND is_visible_to_owners = true
  AND (opens_at IS NULL OR opens_at <= now())
  AND (closes_at IS NULL OR closes_at >= now())
  AND EXISTS (
    SELECT 1 FROM public.weg_owner_buildings w
    WHERE w.user_id = auth.uid() AND w.building_id = surveys.building_id
  )
);

DROP POLICY IF EXISTS items_select ON public.survey_items;
CREATE POLICY items_select ON public.survey_items
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.surveys s
    WHERE s.id = survey_items.survey_id
      AND (
        is_rgi_staff()
        OR (
          s.status = 'open'::survey_status
          AND s.is_visible_to_owners = true
          AND (s.opens_at IS NULL OR s.opens_at <= now())
          AND (s.closes_at IS NULL OR s.closes_at >= now())
          AND EXISTS (
            SELECT 1 FROM public.weg_owner_buildings w
            WHERE w.user_id = auth.uid() AND w.building_id = s.building_id
          )
        )
      )
  )
);

DROP POLICY IF EXISTS images_select ON public.survey_item_images;
CREATE POLICY images_select ON public.survey_item_images
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.survey_items i
    JOIN public.surveys s ON s.id = i.survey_id
    WHERE i.id = survey_item_images.item_id
      AND (
        is_rgi_staff()
        OR (
          s.status = 'open'::survey_status
          AND s.is_visible_to_owners = true
          AND (s.opens_at IS NULL OR s.opens_at <= now())
          AND (s.closes_at IS NULL OR s.closes_at >= now())
          AND EXISTS (
            SELECT 1 FROM public.weg_owner_buildings w
            WHERE w.user_id = auth.uid() AND w.building_id = s.building_id
          )
        )
      )
  )
);

-- 5) Löschsperre für Umfragen mit Stimmen (Verwaltung soll archivieren statt löschen)
CREATE OR REPLACE FUNCTION public.prevent_delete_survey_with_votes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.survey_votes v WHERE v.survey_id = OLD.id) THEN
    RAISE EXCEPTION 'Diese Umfrage enthält bereits Stimmen und kann nicht gelöscht werden. Bitte archivieren.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_delete_survey_with_votes ON public.surveys;
CREATE TRIGGER trg_prevent_delete_survey_with_votes
BEFORE DELETE ON public.surveys
FOR EACH ROW EXECUTE FUNCTION public.prevent_delete_survey_with_votes();
