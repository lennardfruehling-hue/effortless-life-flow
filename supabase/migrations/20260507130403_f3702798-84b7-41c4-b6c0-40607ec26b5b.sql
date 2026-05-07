
-- =========================
-- Households + membership
-- =========================
CREATE TABLE public.households (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'My Household',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TYPE public.household_role AS ENUM ('owner', 'member');

CREATE TABLE public.household_members (
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role public.household_role NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (household_id, user_id),
  UNIQUE (user_id) -- one household per user
);

CREATE TABLE public.household_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(18), 'hex'),
  invited_by UUID NOT NULL,
  accepted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '14 days')
);

CREATE INDEX idx_household_invites_email ON public.household_invites (lower(email));
CREATE INDEX idx_household_invites_token ON public.household_invites (token);

-- =========================
-- Helper functions (SECURITY DEFINER, avoid recursion)
-- =========================
CREATE OR REPLACE FUNCTION public.current_household()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT household_id FROM public.household_members WHERE user_id = auth.uid() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.same_household(_a UUID, _b UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.household_members ma
    JOIN public.household_members mb ON ma.household_id = mb.household_id
    WHERE ma.user_id = _a AND mb.user_id = _b
  )
$$;

CREATE OR REPLACE FUNCTION public.is_household_owner(_user UUID, _household UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.household_members
    WHERE user_id = _user AND household_id = _household AND role = 'owner'
  )
$$;

-- =========================
-- Auto-create personal household on signup
-- =========================
CREATE OR REPLACE FUNCTION public.handle_new_user_household()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_household_id UUID;
  pending RECORD;
BEGIN
  -- If there's a pending invite for this email, join that household instead
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

CREATE TRIGGER on_auth_user_created_household
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_household();

-- Backfill: create households for existing users
DO $$
DECLARE u RECORD; new_id UUID;
BEGIN
  FOR u IN SELECT id, email FROM auth.users
           WHERE id NOT IN (SELECT user_id FROM public.household_members)
  LOOP
    INSERT INTO public.households (name) VALUES (COALESCE(u.email, 'My Household')) RETURNING id INTO new_id;
    INSERT INTO public.household_members (household_id, user_id, role) VALUES (new_id, u.id, 'owner');
  END LOOP;
END $$;

-- =========================
-- RLS
-- =========================
ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their household"
  ON public.households FOR SELECT
  USING (id = public.current_household());

CREATE POLICY "Owners can update their household"
  ON public.households FOR UPDATE
  USING (public.is_household_owner(auth.uid(), id))
  WITH CHECK (public.is_household_owner(auth.uid(), id));

CREATE POLICY "Members can view co-members"
  ON public.household_members FOR SELECT
  USING (household_id = public.current_household());

CREATE POLICY "Members can leave"
  ON public.household_members FOR DELETE
  USING (user_id = auth.uid());

CREATE POLICY "Members can view invites for their household"
  ON public.household_invites FOR SELECT
  USING (household_id = public.current_household());

CREATE POLICY "Members can create invites for their household"
  ON public.household_invites FOR INSERT
  WITH CHECK (household_id = public.current_household() AND invited_by = auth.uid());

CREATE POLICY "Members can revoke invites for their household"
  ON public.household_invites FOR DELETE
  USING (household_id = public.current_household());

-- =========================
-- Expand user_data RLS to household sharing
-- =========================
DROP POLICY IF EXISTS "Users select own data" ON public.user_data;
DROP POLICY IF EXISTS "Users insert own data" ON public.user_data;
DROP POLICY IF EXISTS "Users update own data" ON public.user_data;
DROP POLICY IF EXISTS "Users delete own data" ON public.user_data;

CREATE POLICY "Household members select shared data"
  ON public.user_data FOR SELECT
  USING (public.same_household(auth.uid(), user_id));

CREATE POLICY "Household members insert shared data"
  ON public.user_data FOR INSERT
  WITH CHECK (public.same_household(auth.uid(), user_id));

CREATE POLICY "Household members update shared data"
  ON public.user_data FOR UPDATE
  USING (public.same_household(auth.uid(), user_id))
  WITH CHECK (public.same_household(auth.uid(), user_id));

CREATE POLICY "Household members delete shared data"
  ON public.user_data FOR DELETE
  USING (public.same_household(auth.uid(), user_id));

-- updated_at trigger for households
CREATE TRIGGER households_touch_updated_at
  BEFORE UPDATE ON public.households
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
