ALTER TABLE public.chart_of_accounts
  ADD COLUMN IF NOT EXISTS umlagefaehig boolean NOT NULL DEFAULT false;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS umlagefaehig text
    CHECK (umlagefaehig IN ('ja','nein','unklar'));

CREATE INDEX IF NOT EXISTS idx_bookings_building_year_umlage
  ON public.bookings(building_id, fiscal_year, umlagefaehig);