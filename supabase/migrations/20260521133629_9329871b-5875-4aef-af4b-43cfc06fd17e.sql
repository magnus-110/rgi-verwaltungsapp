UPDATE public.cash_audit_statements
SET category = 'plan'
WHERE category IS DISTINCT FROM 'plan'
  AND (
    file_name ~* 'Gesamtabrechnung|Einzelabrechnung|Vermoegensbericht|Vermögensbericht|§?35a|_35a|Wirtschaftsplan|^Abrechnung[_ ]'
  );