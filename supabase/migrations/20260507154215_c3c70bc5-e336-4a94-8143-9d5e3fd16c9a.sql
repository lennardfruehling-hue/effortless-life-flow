-- Privacy fields on shared tables
ALTER TABLE public.research_notes
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false;

ALTER TABLE public.task_lists
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false;

-- Replace permissive auth-only policies with household-aware + privacy-aware policies
DROP POLICY IF EXISTS "auth read research_notes" ON public.research_notes;
DROP POLICY IF EXISTS "auth insert research_notes" ON public.research_notes;
DROP POLICY IF EXISTS "auth update research_notes" ON public.research_notes;
DROP POLICY IF EXISTS "auth delete research_notes" ON public.research_notes;

CREATE POLICY "Household read notes"
  ON public.research_notes FOR SELECT TO authenticated
  USING (
    created_by IS NULL
    OR created_by = auth.uid()
    OR (is_private = false AND public.same_household(auth.uid(), created_by))
  );

CREATE POLICY "Auth insert notes"
  ON public.research_notes FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() OR created_by IS NULL);

CREATE POLICY "Owner or household update notes"
  ON public.research_notes FOR UPDATE TO authenticated
  USING (
    created_by IS NULL
    OR created_by = auth.uid()
    OR public.same_household(auth.uid(), created_by)
  )
  WITH CHECK (
    created_by IS NULL
    OR created_by = auth.uid()
    OR public.same_household(auth.uid(), created_by)
  );

CREATE POLICY "Owner delete notes"
  ON public.research_notes FOR DELETE TO authenticated
  USING (created_by IS NULL OR created_by = auth.uid());

DROP POLICY IF EXISTS "auth read task_lists" ON public.task_lists;
DROP POLICY IF EXISTS "auth insert task_lists" ON public.task_lists;
DROP POLICY IF EXISTS "auth update task_lists" ON public.task_lists;
DROP POLICY IF EXISTS "auth delete task_lists" ON public.task_lists;

CREATE POLICY "Household read lists"
  ON public.task_lists FOR SELECT TO authenticated
  USING (
    created_by IS NULL
    OR created_by = auth.uid()
    OR (is_private = false AND public.same_household(auth.uid(), created_by))
  );

CREATE POLICY "Auth insert lists"
  ON public.task_lists FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() OR created_by IS NULL);

CREATE POLICY "Owner or household update lists"
  ON public.task_lists FOR UPDATE TO authenticated
  USING (
    created_by IS NULL
    OR created_by = auth.uid()
    OR public.same_household(auth.uid(), created_by)
  )
  WITH CHECK (
    created_by IS NULL
    OR created_by = auth.uid()
    OR public.same_household(auth.uid(), created_by)
  );

CREATE POLICY "Owner delete lists"
  ON public.task_lists FOR DELETE TO authenticated
  USING (created_by IS NULL OR created_by = auth.uid());
