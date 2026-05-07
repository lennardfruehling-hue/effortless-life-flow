
-- Restrict public tables to authenticated users only
-- These tables hold shared household data; auth is now in place

-- research_notes
DROP POLICY IF EXISTS "public read research_notes" ON public.research_notes;
DROP POLICY IF EXISTS "public insert research_notes" ON public.research_notes;
DROP POLICY IF EXISTS "public update research_notes" ON public.research_notes;
CREATE POLICY "auth read research_notes" ON public.research_notes FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert research_notes" ON public.research_notes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update research_notes" ON public.research_notes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete research_notes" ON public.research_notes FOR DELETE TO authenticated USING (true);

-- note_blocks
DROP POLICY IF EXISTS "public read note_blocks" ON public.note_blocks;
DROP POLICY IF EXISTS "public insert note_blocks" ON public.note_blocks;
DROP POLICY IF EXISTS "public update note_blocks" ON public.note_blocks;
DROP POLICY IF EXISTS "public delete note_blocks" ON public.note_blocks;
CREATE POLICY "auth read note_blocks" ON public.note_blocks FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert note_blocks" ON public.note_blocks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update note_blocks" ON public.note_blocks FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete note_blocks" ON public.note_blocks FOR DELETE TO authenticated USING (true);

-- task_lists
DROP POLICY IF EXISTS "public read task_lists" ON public.task_lists;
DROP POLICY IF EXISTS "public insert task_lists" ON public.task_lists;
DROP POLICY IF EXISTS "public update task_lists" ON public.task_lists;
CREATE POLICY "auth read task_lists" ON public.task_lists FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert task_lists" ON public.task_lists FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update task_lists" ON public.task_lists FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete task_lists" ON public.task_lists FOR DELETE TO authenticated USING (true);

-- list_items
DROP POLICY IF EXISTS "public read list_items" ON public.list_items;
DROP POLICY IF EXISTS "public insert list_items" ON public.list_items;
DROP POLICY IF EXISTS "public update list_items" ON public.list_items;
DROP POLICY IF EXISTS "public delete list_items" ON public.list_items;
CREATE POLICY "auth read list_items" ON public.list_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert list_items" ON public.list_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update list_items" ON public.list_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete list_items" ON public.list_items FOR DELETE TO authenticated USING (true);

-- tags
DROP POLICY IF EXISTS "public read tags" ON public.tags;
DROP POLICY IF EXISTS "public insert tags" ON public.tags;
DROP POLICY IF EXISTS "public update tags" ON public.tags;
DROP POLICY IF EXISTS "public delete tags" ON public.tags;
CREATE POLICY "auth read tags" ON public.tags FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert tags" ON public.tags FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update tags" ON public.tags FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete tags" ON public.tags FOR DELETE TO authenticated USING (true);

-- note_tags
DROP POLICY IF EXISTS "public read note_tags" ON public.note_tags;
DROP POLICY IF EXISTS "public insert note_tags" ON public.note_tags;
DROP POLICY IF EXISTS "public delete note_tags" ON public.note_tags;
CREATE POLICY "auth read note_tags" ON public.note_tags FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert note_tags" ON public.note_tags FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth delete note_tags" ON public.note_tags FOR DELETE TO authenticated USING (true);

-- list_tags
DROP POLICY IF EXISTS "public read list_tags" ON public.list_tags;
DROP POLICY IF EXISTS "public insert list_tags" ON public.list_tags;
DROP POLICY IF EXISTS "public delete list_tags" ON public.list_tags;
CREATE POLICY "auth read list_tags" ON public.list_tags FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert list_tags" ON public.list_tags FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth delete list_tags" ON public.list_tags FOR DELETE TO authenticated USING (true);

-- Storage bucket: research-files (currently private bucket but with public-role policies)
DROP POLICY IF EXISTS "insert research-files" ON storage.objects;
DROP POLICY IF EXISTS "read research-files" ON storage.objects;
CREATE POLICY "auth read research-files" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'research-files');
CREATE POLICY "auth insert research-files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'research-files');
CREATE POLICY "auth update research-files" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'research-files') WITH CHECK (bucket_id = 'research-files');
CREATE POLICY "auth delete research-files" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'research-files');
