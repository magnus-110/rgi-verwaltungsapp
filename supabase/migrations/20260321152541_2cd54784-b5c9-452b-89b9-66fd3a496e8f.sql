ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS source_line_index integer,
  ADD COLUMN IF NOT EXISTS split_part integer,
  ADD COLUMN IF NOT EXISTS split_parts_total integer;