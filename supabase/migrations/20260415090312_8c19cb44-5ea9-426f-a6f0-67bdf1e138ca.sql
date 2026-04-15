-- Add bank_transaction_id to bookings for 1:N relationship (multiple bookings per transaction)
ALTER TABLE public.bookings 
ADD COLUMN bank_transaction_id uuid REFERENCES public.bank_transactions(id);

-- Index for fast lookup
CREATE INDEX idx_bookings_bank_transaction_id ON public.bookings(bank_transaction_id);
