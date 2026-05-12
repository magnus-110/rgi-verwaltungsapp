ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS settlement_35a_type text
  CHECK (settlement_35a_type IS NULL OR settlement_35a_type IN ('dienste','handwerker'));