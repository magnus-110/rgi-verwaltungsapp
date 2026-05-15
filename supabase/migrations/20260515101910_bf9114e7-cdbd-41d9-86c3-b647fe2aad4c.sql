CREATE TABLE public.account_review_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  fiscal_year integer NOT NULL,
  account_id uuid NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE CASCADE,
  note text NOT NULL DEFAULT '',
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (building_id, fiscal_year, account_id)
);

CREATE INDEX idx_account_review_notes_lookup
  ON public.account_review_notes (building_id, fiscal_year);

ALTER TABLE public.account_review_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read account review notes"
  ON public.account_review_notes FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated can insert account review notes"
  ON public.account_review_notes FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update account review notes"
  ON public.account_review_notes FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated can delete account review notes"
  ON public.account_review_notes FOR DELETE
  TO authenticated USING (true);

CREATE TRIGGER trg_account_review_notes_updated_at
  BEFORE UPDATE ON public.account_review_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();