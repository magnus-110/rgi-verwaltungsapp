-- Seed Brunata 2025 values for Birkenweg 6 (idempotent)
INSERT INTO public.heating_distribution_values
  (building_id, billing_period_id, assignment_id, amount, note)
VALUES
  ('f5fa943b-3fbc-459b-b2f0-f9e20443c787', 'b8076845-b37e-4a26-aa0a-98ac238b1575', '8a36d710-5e10-4aa5-8859-a1c38d95eb52', 2536.64, 'Brunata 2025 – Wollmann'),
  ('f5fa943b-3fbc-459b-b2f0-f9e20443c787', 'b8076845-b37e-4a26-aa0a-98ac238b1575', '218a212a-a247-4593-ba2b-fa1970663f1e', 1757.82, 'Brunata 2025 – Gottfried'),
  ('f5fa943b-3fbc-459b-b2f0-f9e20443c787', 'b8076845-b37e-4a26-aa0a-98ac238b1575', '19b4fc05-dc7b-436e-9e9d-652de10c1e45',  854.53, 'Brunata 2025 – Willems')
ON CONFLICT DO NOTHING;