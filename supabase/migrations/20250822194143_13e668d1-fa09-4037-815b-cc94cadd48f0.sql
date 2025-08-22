
-- 0) Einmalige Voraussetzung: profiles.user_id muss eindeutig sein,
--    damit wir darauf als Fremdschlüssel verweisen können.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_constraint
    WHERE  conname = 'profiles_user_id_unique'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_user_id_unique UNIQUE (user_id);
  END IF;
END$$;

-- 1) Tabelle für Gebäude-Verwalter (Admins, die Gebäuden zugeordnet werden)
CREATE TABLE IF NOT EXISTS public.building_managers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (building_id, user_id)
);

-- Indizes
CREATE INDEX IF NOT EXISTS idx_building_managers_building ON public.building_managers (building_id);
CREATE INDEX IF NOT EXISTS idx_building_managers_user ON public.building_managers (user_id);

-- RLS aktivieren
ALTER TABLE public.building_managers ENABLE ROW LEVEL SECURITY;

-- Policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'building_managers' AND policyname = 'Admins can manage building managers'
  ) THEN
    CREATE POLICY "Admins can manage building managers"
      ON public.building_managers
      FOR ALL
      USING (get_user_role(auth.uid()) = 'admin')
      WITH CHECK (get_user_role(auth.uid()) = 'admin');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'building_managers' AND policyname = 'Managers can view their assignments'
  ) THEN
    CREATE POLICY "Managers can view their assignments"
      ON public.building_managers
      FOR SELECT
      USING (user_id = auth.uid());
  END IF;
END$$;

-- 2) Tabelle für Web Push Subscriptions
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  endpoint   text NOT NULL UNIQUE,
  p256dh     text NOT NULL,
  auth       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'push_subscriptions' AND policyname = 'Users can insert their own push subscriptions'
  ) THEN
    CREATE POLICY "Users can insert their own push subscriptions"
      ON public.push_subscriptions
      FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'push_subscriptions' AND policyname = 'Users can select their own push subscriptions'
  ) THEN
    CREATE POLICY "Users can select their own push subscriptions"
      ON public.push_subscriptions
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'push_subscriptions' AND policyname = 'Users can update their own push subscriptions'
  ) THEN
    CREATE POLICY "Users can update their own push subscriptions"
      ON public.push_subscriptions
      FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'push_subscriptions' AND policyname = 'Users can delete their own push subscriptions'
  ) THEN
    CREATE POLICY "Users can delete their own push subscriptions"
      ON public.push_subscriptions
      FOR DELETE
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'push_subscriptions' AND policyname = 'Admins can read all push subscriptions'
  ) THEN
    CREATE POLICY "Admins can read all push subscriptions"
      ON public.push_subscriptions
      FOR SELECT
      USING (get_user_role(auth.uid()) = 'admin');
  END IF;
END$$;
