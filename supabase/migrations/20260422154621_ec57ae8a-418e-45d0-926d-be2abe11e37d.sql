UPDATE public.bookings 
SET booking_type = 'expense'
WHERE building_id='f5fa943b-3fbc-459b-b2f0-f9e20443c787'
  AND fiscal_year=2025
  AND booking_type = 'manual'
  AND description LIKE 'HK-Umbuchung Strom%';