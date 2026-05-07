
-- 1. PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  color TEXT NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Household members can view each other"
  ON public.profiles FOR SELECT
  USING (public.same_household(auth.uid(), user_id));

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2. AUTO-CREATE PROFILE ON SIGNUP (extend existing handle_new_user_household trigger function)
CREATE OR REPLACE FUNCTION public.handle_new_user_household()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_household_id UUID;
  pending RECORD;
  default_name TEXT;
BEGIN
  default_name := COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1));

  -- auto-create profile
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, default_name)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO pending
  FROM public.household_invites
  WHERE lower(email) = lower(NEW.email)
    AND accepted = false
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    INSERT INTO public.household_members (household_id, user_id, role)
    VALUES (pending.household_id, NEW.id, 'member')
    ON CONFLICT (user_id) DO NOTHING;
    UPDATE public.household_invites SET accepted = true WHERE id = pending.id;
  ELSE
    INSERT INTO public.households (name) VALUES (COALESCE(NEW.email, 'My Household'))
    RETURNING id INTO new_household_id;
    INSERT INTO public.household_members (household_id, user_id, role)
    VALUES (new_household_id, NEW.id, 'owner')
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Ensure trigger exists (idempotent)
DROP TRIGGER IF EXISTS on_auth_user_created_household ON auth.users;
CREATE TRIGGER on_auth_user_created_household
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_household();

-- 3. RPC: accept_invite_token — for already-signed-in users opening invite link
CREATE OR REPLACE FUNCTION public.accept_invite_token(_token TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv RECORD;
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO inv
  FROM public.household_invites
  WHERE token = _token AND accepted = false AND expires_at > now()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invite_invalid_or_expired');
  END IF;

  -- Move user to that household (replace any existing membership)
  DELETE FROM public.household_members WHERE user_id = uid;
  INSERT INTO public.household_members (household_id, user_id, role)
  VALUES (inv.household_id, uid, 'member');

  UPDATE public.household_invites SET accepted = true WHERE id = inv.id;

  RETURN jsonb_build_object('ok', true, 'household_id', inv.household_id);
END;
$$;

-- 4. Allow household_members INSERT for invited self (covers manual fallback)
CREATE POLICY "Users can join via accepted invite"
  ON public.household_members FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- 5. ASSIGNEE COLUMNS for cloud-stored entities
ALTER TABLE public.task_lists ADD COLUMN IF NOT EXISTS assignee_id UUID;
ALTER TABLE public.research_notes ADD COLUMN IF NOT EXISTS assignee_id UUID;

-- 6. Backfill profiles for existing users
INSERT INTO public.profiles (user_id, display_name)
SELECT id, COALESCE(raw_user_meta_data->>'display_name', split_part(email, '@', 1))
FROM auth.users
ON CONFLICT (user_id) DO NOTHING;
