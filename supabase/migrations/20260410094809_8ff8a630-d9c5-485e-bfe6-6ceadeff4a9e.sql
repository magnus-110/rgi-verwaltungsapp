ALTER TABLE public.bookings 
  ADD COLUMN amount_35a numeric DEFAULT NULL,
  ADD COLUMN line_items_detail jsonb DEFAULT NULL;