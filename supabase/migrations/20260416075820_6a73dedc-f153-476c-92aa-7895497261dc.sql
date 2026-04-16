ALTER TABLE public.bookings ADD COLUMN needs_review boolean NOT NULL DEFAULT false;
ALTER TABLE public.bookings ADD COLUMN review_note text;