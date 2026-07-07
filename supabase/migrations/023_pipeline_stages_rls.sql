-- ============================================================
-- Migration 023: Enable RLS on pipeline_stages
-- Allows authenticated users to read stages, only admins can edit
-- ============================================================

ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read pipeline stages
CREATE POLICY "Authenticated users can read pipeline stages" ON public.pipeline_stages
  FOR SELECT TO authenticated USING (true);

-- Only admins can insert, update, delete pipeline stages
CREATE POLICY "Admins can manage pipeline stages" ON public.pipeline_stages
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('owner', 'vp_operations')
    )
  );

CREATE POLICY "Admins can update pipeline stages" ON public.pipeline_stages
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('owner', 'vp_operations')
    )
  );

CREATE POLICY "Admins can delete pipeline stages" ON public.pipeline_stages
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('owner', 'vp_operations')
    )
  );
