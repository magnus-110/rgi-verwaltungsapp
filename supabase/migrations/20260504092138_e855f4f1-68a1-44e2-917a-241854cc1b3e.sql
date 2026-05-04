-- Vendor Memory: Unique-Index mit COALESCE für nullable IBAN + sicherer Upsert RPC

-- Vorhandene UNIQUE/CONSTRAINTS aufräumen, damit der nullable-IBAN-Fall sauber funktioniert
DROP INDEX IF EXISTS public.vendor_memory_unique_idx;
ALTER TABLE public.vendor_memory DROP CONSTRAINT IF EXISTS vendor_memory_unique_combo;

-- Funktionaler Unique-Index: behandelt NULL IBAN als leeren String
CREATE UNIQUE INDEX vendor_memory_unique_idx
  ON public.vendor_memory (
    COALESCE(vendor_iban, ''),
    vendor_name_normalized,
    management_mode,
    account_number
  );

-- RPC für sicheren Upsert (wird vom Edge-Function aufgerufen)
CREATE OR REPLACE FUNCTION public.vendor_memory_upsert(
  p_vendor_iban text,
  p_vendor_name_normalized text,
  p_management_mode management_mode,
  p_account_number text,
  p_account_category text,
  p_purpose_pattern text,
  p_is_35a boolean
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id uuid;
BEGIN
  IF p_account_number IS NULL OR p_vendor_name_normalized IS NULL OR p_vendor_name_normalized = '' THEN
    RETURN;
  END IF;

  SELECT id INTO v_existing_id
  FROM public.vendor_memory
  WHERE COALESCE(vendor_iban, '') = COALESCE(p_vendor_iban, '')
    AND vendor_name_normalized = p_vendor_name_normalized
    AND management_mode = p_management_mode
    AND account_number = p_account_number
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.vendor_memory
       SET usage_count = usage_count + 1,
           last_used_at = now(),
           account_category = COALESCE(p_account_category, account_category),
           purpose_pattern = COALESCE(p_purpose_pattern, purpose_pattern),
           is_35a_relevant = p_is_35a
     WHERE id = v_existing_id;
  ELSE
    INSERT INTO public.vendor_memory (
      vendor_iban, vendor_name_normalized, management_mode,
      account_number, account_category, purpose_pattern,
      is_35a_relevant, usage_count, last_used_at
    ) VALUES (
      p_vendor_iban, p_vendor_name_normalized, p_management_mode,
      p_account_number, p_account_category, p_purpose_pattern,
      p_is_35a, 1, now()
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.vendor_memory_upsert(text, text, management_mode, text, text, text, boolean) TO authenticated, service_role, anon;