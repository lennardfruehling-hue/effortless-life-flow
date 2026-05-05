CREATE TABLE public.user_data (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key text NOT NULL,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

ALTER TABLE public.user_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own data" ON public.user_data FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own data" ON public.user_data FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own data" ON public.user_data FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own data" ON public.user_data FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER user_data_touch BEFORE UPDATE ON public.user_data
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();