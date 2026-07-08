-- ============================================================
-- Migration 026: POS Systems Reference Table
-- Allows users to manage POS system options from UI
-- ============================================================

CREATE TABLE public.pos_systems (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  display_order int DEFAULT 0,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.pos_systems ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read pos_systems" ON public.pos_systems
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Only admins can manage pos_systems" ON public.pos_systems
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('owner', 'vp_operations')
    )
  );

-- Seed with existing systems
INSERT INTO public.pos_systems (name, display_order) VALUES
  ('Shift4 Dine', 1),
  ('Stackably', 2),
  ('Clover', 3),
  ('Dejavoo', 4),
  ('Spot On', 5),
  ('Basic Terminal', 6);

CREATE INDEX pos_systems_active_order_idx ON public.pos_systems(active, display_order);
