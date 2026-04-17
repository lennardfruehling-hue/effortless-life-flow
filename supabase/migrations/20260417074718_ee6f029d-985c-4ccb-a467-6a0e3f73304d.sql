
-- Research notes (Notion-style)
CREATE TABLE public.research_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT 'Untitled',
  icon TEXT,
  project_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.note_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID NOT NULL REFERENCES public.research_notes(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  block_type TEXT NOT NULL DEFAULT 'text',
  content TEXT,
  checked BOOLEAN DEFAULT false,
  file_url TEXT,
  file_name TEXT,
  file_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_note_blocks_note ON public.note_blocks(note_id, position);

-- Lists
CREATE TABLE public.task_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'New List',
  description TEXT,
  icon TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.list_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id UUID NOT NULL REFERENCES public.task_lists(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  content TEXT NOT NULL,
  checked BOOLEAN NOT NULL DEFAULT false,
  linked_task_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_list_items_list ON public.list_items(list_id, position);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_research_notes_updated BEFORE UPDATE ON public.research_notes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_task_lists_updated BEFORE UPDATE ON public.task_lists
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Enable RLS but allow public access (single-user local app, no auth)
ALTER TABLE public.research_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.note_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.list_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read research_notes" ON public.research_notes FOR SELECT USING (true);
CREATE POLICY "public write research_notes" ON public.research_notes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public read note_blocks" ON public.note_blocks FOR SELECT USING (true);
CREATE POLICY "public write note_blocks" ON public.note_blocks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public read task_lists" ON public.task_lists FOR SELECT USING (true);
CREATE POLICY "public write task_lists" ON public.task_lists FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public read list_items" ON public.list_items FOR SELECT USING (true);
CREATE POLICY "public write list_items" ON public.list_items FOR ALL USING (true) WITH CHECK (true);

-- Storage bucket for research attachments
INSERT INTO storage.buckets (id, name, public) VALUES ('research-files', 'research-files', true);

CREATE POLICY "public read research-files" ON storage.objects FOR SELECT USING (bucket_id = 'research-files');
CREATE POLICY "public upload research-files" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'research-files');
CREATE POLICY "public update research-files" ON storage.objects FOR UPDATE USING (bucket_id = 'research-files');
CREATE POLICY "public delete research-files" ON storage.objects FOR DELETE USING (bucket_id = 'research-files');
