
-- Tags table (shared across notes & lists)
CREATE TABLE public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read tags" ON public.tags FOR SELECT USING (true);
CREATE POLICY "public insert tags" ON public.tags FOR INSERT WITH CHECK (true);
CREATE POLICY "public update tags" ON public.tags FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "public delete tags" ON public.tags FOR DELETE USING (true);

-- Join table: note <-> tag
CREATE TABLE public.note_tags (
  note_id UUID NOT NULL REFERENCES public.research_notes(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, tag_id)
);
ALTER TABLE public.note_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read note_tags" ON public.note_tags FOR SELECT USING (true);
CREATE POLICY "public insert note_tags" ON public.note_tags FOR INSERT WITH CHECK (true);
CREATE POLICY "public delete note_tags" ON public.note_tags FOR DELETE USING (true);

-- Join table: list <-> tag
CREATE TABLE public.list_tags (
  list_id UUID NOT NULL REFERENCES public.task_lists(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (list_id, tag_id)
);
ALTER TABLE public.list_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read list_tags" ON public.list_tags FOR SELECT USING (true);
CREATE POLICY "public insert list_tags" ON public.list_tags FOR INSERT WITH CHECK (true);
CREATE POLICY "public delete list_tags" ON public.list_tags FOR DELETE USING (true);

-- Add project_id to task_lists (research_notes already has project_id)
ALTER TABLE public.task_lists ADD COLUMN project_id TEXT;
