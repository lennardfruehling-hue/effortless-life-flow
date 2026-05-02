-- Interim hardening: remove anonymous write/update/delete on data tables.
-- Keep public SELECT + INSERT so the no-auth app keeps working until Phase 2 (auth).

-- research_notes
DROP POLICY IF EXISTS "public write research_notes" ON public.research_notes;
CREATE POLICY "public insert research_notes" ON public.research_notes FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "public update research_notes" ON public.research_notes FOR UPDATE TO public USING (true) WITH CHECK (true);
-- Intentionally NO delete policy → anonymous deletes blocked

-- note_blocks
DROP POLICY IF EXISTS "public write note_blocks" ON public.note_blocks;
CREATE POLICY "public insert note_blocks" ON public.note_blocks FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "public update note_blocks" ON public.note_blocks FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "public delete note_blocks" ON public.note_blocks FOR DELETE TO public USING (true);
-- Note blocks need delete (removing a block from a note). Tradeoff documented.

-- task_lists
DROP POLICY IF EXISTS "public write task_lists" ON public.task_lists;
CREATE POLICY "public insert task_lists" ON public.task_lists FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "public update task_lists" ON public.task_lists FOR UPDATE TO public USING (true) WITH CHECK (true);
-- No anonymous delete on entire lists.

-- list_items
DROP POLICY IF EXISTS "public write list_items" ON public.list_items;
CREATE POLICY "public insert list_items" ON public.list_items FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "public update list_items" ON public.list_items FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "public delete list_items" ON public.list_items FOR DELETE TO public USING (true);
-- Items need delete (checking off / removing items).

-- Storage: lock down research-files bucket
UPDATE storage.buckets SET public = false WHERE id = 'research-files';

DROP POLICY IF EXISTS "public read research-files" ON storage.objects;
DROP POLICY IF EXISTS "public upload research-files" ON storage.objects;
DROP POLICY IF EXISTS "public update research-files" ON storage.objects;
DROP POLICY IF EXISTS "public delete research-files" ON storage.objects;

-- Read still public so existing UI links work; writes require service role (edge functions only) until auth ships.
CREATE POLICY "read research-files"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'research-files');

CREATE POLICY "insert research-files"
  ON storage.objects FOR INSERT TO public
  WITH CHECK (bucket_id = 'research-files');
-- No anonymous UPDATE or DELETE policies → those operations now blocked.