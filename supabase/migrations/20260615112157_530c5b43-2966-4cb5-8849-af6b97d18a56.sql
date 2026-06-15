UPDATE public.profiles
SET terms_accepted_at = NULL,
    passkey_prompt_dismissed_at = NULL
WHERE user_id = (
  SELECT id FROM auth.users WHERE lower(email) = 'magnusgottinger@gmail.com' LIMIT 1
);