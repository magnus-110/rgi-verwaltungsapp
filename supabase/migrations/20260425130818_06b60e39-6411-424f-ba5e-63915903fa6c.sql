
-- ============================================================================
-- PHASE 1: Onboarding-Wizard "Verwaltungsübernahme" + Username-Login-System
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) PROFILES: Username-Login-System
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS auth_pseudo_email TEXT,
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS initial_password_set_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique_idx
  ON public.profiles (lower(username))
  WHERE username IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_auth_pseudo_email_unique_idx
  ON public.profiles (lower(auth_pseudo_email))
  WHERE auth_pseudo_email IS NOT NULL;

-- Username-Format-Validation per Trigger (kein CHECK mit immutability issues)
CREATE OR REPLACE FUNCTION public.validate_username()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  reserved TEXT[] := ARRAY['admin','root','support','system','postmaster','webmaster','noreply','info','rgi','test'];
BEGIN
  IF NEW.username IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.username := lower(trim(NEW.username));

  IF length(NEW.username) < 3 OR length(NEW.username) > 60 THEN
    RAISE EXCEPTION 'Username muss zwischen 3 und 60 Zeichen lang sein';
  END IF;

  IF NEW.username !~ '^[a-z0-9][a-z0-9._-]*[a-z0-9]$' THEN
    RAISE EXCEPTION 'Username darf nur Kleinbuchstaben, Zahlen, Punkte, Bindestriche und Unterstriche enthalten';
  END IF;

  IF NEW.username = ANY(reserved) THEN
    RAISE EXCEPTION 'Dieser Username ist reserviert';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_username ON public.profiles;
CREATE TRIGGER trg_validate_username
  BEFORE INSERT OR UPDATE OF username ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.validate_username();

-- ----------------------------------------------------------------------------
-- 2) CONTACTS: Onboarding-Vorschlags-Pool
-- ----------------------------------------------------------------------------
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS suggest_in_onboarding BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_category TEXT;

CREATE INDEX IF NOT EXISTS contacts_suggest_onboarding_idx
  ON public.contacts (suggest_in_onboarding, onboarding_category)
  WHERE suggest_in_onboarding = true;

-- ----------------------------------------------------------------------------
-- 3) CONTACT_PERSONS: Onboarding-Erwartungen
-- ----------------------------------------------------------------------------
ALTER TABLE public.contact_persons
  ADD COLUMN IF NOT EXISTS onboarding_expectations TEXT,
  ADD COLUMN IF NOT EXISTS willing_cash_audit BOOLEAN;

-- ----------------------------------------------------------------------------
-- 4) BUILDINGS: Heizungsart (falls nicht vorhanden)
-- ----------------------------------------------------------------------------
ALTER TABLE public.buildings
  ADD COLUMN IF NOT EXISTS heating_type TEXT;

-- ----------------------------------------------------------------------------
-- 5) ONBOARDING_ACTIVATIONS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.onboarding_activations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id UUID NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  activated_by UUID REFERENCES auth.users(id),
  activated_at TIMESTAMPTZ DEFAULT now(),
  deactivated_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(building_id)
);

ALTER TABLE public.onboarding_activations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage onboarding activations"
  ON public.onboarding_activations FOR ALL
  USING (public.user_can_access_building(auth.uid(), building_id))
  WITH CHECK (public.user_can_access_building(auth.uid(), building_id));

CREATE POLICY "Owners view onboarding activation of their buildings"
  ON public.onboarding_activations FOR SELECT
  USING (building_id IN (SELECT public.get_user_building_ids(auth.uid())));

-- ----------------------------------------------------------------------------
-- 6) ONBOARDING_PROGRESS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.onboarding_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  building_id UUID NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  current_step INT NOT NULL DEFAULT 1,
  step_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  step1_completed_at TIMESTAMPTZ,
  step2_completed_at TIMESTAMPTZ,
  step3_completed_at TIMESTAMPTZ,
  step4_completed_at TIMESTAMPTZ,
  step5_completed_at TIMESTAMPTZ,
  fully_completed_at TIMESTAMPTZ,
  fab_dismissed_at TIMESTAMPTZ,
  is_repeat_owner BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, building_id)
);

CREATE INDEX IF NOT EXISTS onboarding_progress_building_idx
  ON public.onboarding_progress (building_id);
CREATE INDEX IF NOT EXISTS onboarding_progress_user_idx
  ON public.onboarding_progress (user_id);

ALTER TABLE public.onboarding_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own onboarding progress"
  ON public.onboarding_progress FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins view onboarding progress in their buildings"
  ON public.onboarding_progress FOR SELECT
  USING (public.user_can_access_building(auth.uid(), building_id));

CREATE POLICY "Admins update onboarding progress in their buildings"
  ON public.onboarding_progress FOR UPDATE
  USING (public.user_can_access_building(auth.uid(), building_id));

-- Auto-step-advance trigger
CREATE OR REPLACE FUNCTION public.advance_onboarding_step()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.step1_completed_at IS NOT NULL AND COALESCE(OLD.step1_completed_at, NULL) IS NULL THEN
    NEW.current_step := GREATEST(NEW.current_step, 2);
  END IF;
  IF NEW.step2_completed_at IS NOT NULL AND COALESCE(OLD.step2_completed_at, NULL) IS NULL THEN
    NEW.current_step := GREATEST(NEW.current_step, 3);
  END IF;
  IF NEW.step3_completed_at IS NOT NULL AND COALESCE(OLD.step3_completed_at, NULL) IS NULL THEN
    NEW.current_step := GREATEST(NEW.current_step, 4);
  END IF;
  IF NEW.step4_completed_at IS NOT NULL AND COALESCE(OLD.step4_completed_at, NULL) IS NULL THEN
    NEW.current_step := GREATEST(NEW.current_step, 5);
  END IF;
  IF NEW.step5_completed_at IS NOT NULL AND NEW.step1_completed_at IS NOT NULL
     AND NEW.fully_completed_at IS NULL THEN
    NEW.fully_completed_at := now();
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_advance_onboarding_step ON public.onboarding_progress;
CREATE TRIGGER trg_advance_onboarding_step
  BEFORE UPDATE ON public.onboarding_progress
  FOR EACH ROW EXECUTE FUNCTION public.advance_onboarding_step();

-- ----------------------------------------------------------------------------
-- 7) ONBOARDING_SUBMISSIONS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.onboarding_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  building_id UUID NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS onboarding_submissions_building_status_idx
  ON public.onboarding_submissions (building_id, status);
CREATE INDEX IF NOT EXISTS onboarding_submissions_user_idx
  ON public.onboarding_submissions (user_id);

ALTER TABLE public.onboarding_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own submissions"
  ON public.onboarding_submissions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users view own submissions"
  ON public.onboarding_submissions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins manage submissions in their buildings"
  ON public.onboarding_submissions FOR ALL
  USING (public.user_can_access_building(auth.uid(), building_id))
  WITH CHECK (public.user_can_access_building(auth.uid(), building_id));

-- ----------------------------------------------------------------------------
-- 8) ONBOARDING_MAGIC_LINKS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.onboarding_magic_links (
  token TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  building_id UUID REFERENCES public.buildings(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS onboarding_magic_links_user_idx
  ON public.onboarding_magic_links (user_id);

ALTER TABLE public.onboarding_magic_links ENABLE ROW LEVEL SECURITY;

-- No client-side access — only via service-role Edge Functions

-- Validation trigger for expires_at (no CHECK with now())
CREATE OR REPLACE FUNCTION public.validate_magic_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.expires_at <= now() THEN
    RAISE EXCEPTION 'Magic-Link Expiry muss in der Zukunft liegen';
  END IF;
  IF NEW.expires_at > now() + interval '7 days' THEN
    RAISE EXCEPTION 'Magic-Link darf maximal 7 Tage gültig sein';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_magic_link ON public.onboarding_magic_links;
CREATE TRIGGER trg_validate_magic_link
  BEFORE INSERT OR UPDATE ON public.onboarding_magic_links
  FOR EACH ROW EXECUTE FUNCTION public.validate_magic_link();

-- ----------------------------------------------------------------------------
-- 9) ONBOARDING_LETTER_LOG
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.onboarding_letter_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id UUID NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  campaign_id UUID,
  is_existing_user BOOLEAN NOT NULL DEFAULT false,
  username TEXT,
  initial_password_hash TEXT,
  magic_link_token TEXT,
  generated_by UUID REFERENCES auth.users(id),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  invalidated_at TIMESTAMPTZ,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS onboarding_letter_log_building_idx
  ON public.onboarding_letter_log (building_id);
CREATE INDEX IF NOT EXISTS onboarding_letter_log_contact_idx
  ON public.onboarding_letter_log (contact_id);

ALTER TABLE public.onboarding_letter_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view letter log in their buildings"
  ON public.onboarding_letter_log FOR SELECT
  USING (public.user_can_access_building(auth.uid(), building_id));

-- Inserts/updates only via service role (Edge Functions)

-- ----------------------------------------------------------------------------
-- 10) Generic updated_at trigger function (idempotent)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at_generic()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_onboarding_activations_updated_at ON public.onboarding_activations;
CREATE TRIGGER trg_onboarding_activations_updated_at
  BEFORE UPDATE ON public.onboarding_activations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_generic();

DROP TRIGGER IF EXISTS trg_onboarding_submissions_updated_at ON public.onboarding_submissions;
CREATE TRIGGER trg_onboarding_submissions_updated_at
  BEFORE UPDATE ON public.onboarding_submissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_generic();
