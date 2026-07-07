-- ============================================================
-- Migration 024: Pipeline Stage Triggers/Automation
-- Allows configuring automated actions (emails) when leads move to stages
-- ============================================================

CREATE TABLE public.pipeline_stage_triggers (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  stage_name text NOT NULL,
  trigger_type text NOT NULL DEFAULT 'email' CHECK (trigger_type IN ('email')),
  recipient_type text NOT NULL CHECK (recipient_type IN ('assigned_rep', 'lead_owner')),
  email_subject text NOT NULL,
  email_body text NOT NULL,
  enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(stage_name, trigger_type, recipient_type)
);

ALTER TABLE public.pipeline_stage_triggers ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read triggers
CREATE POLICY "Authenticated users can read triggers" ON public.pipeline_stage_triggers
  FOR SELECT TO authenticated USING (true);

-- Only admins can manage triggers
CREATE POLICY "Admins can insert triggers" ON public.pipeline_stage_triggers
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('owner', 'vp_operations')
    )
  );

CREATE POLICY "Admins can update triggers" ON public.pipeline_stage_triggers
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('owner', 'vp_operations')
    )
  );

CREATE POLICY "Admins can delete triggers" ON public.pipeline_stage_triggers
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('owner', 'vp_operations')
    )
  );

CREATE INDEX pipeline_stage_triggers_stage_idx ON public.pipeline_stage_triggers(stage_name);
