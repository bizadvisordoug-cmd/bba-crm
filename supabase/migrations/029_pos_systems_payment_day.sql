-- ============================================================
-- Migration 029: Add payment_day to POS Systems
-- Allows configuring when each POS system pays for reminders
-- ============================================================

ALTER TABLE public.pos_systems
ADD COLUMN IF NOT EXISTS payment_day int CHECK (payment_day >= 1 AND payment_day <= 31),
ADD COLUMN IF NOT EXISTS notes text;

-- Default payment days for common systems
UPDATE public.pos_systems SET payment_day = 15 WHERE payment_day IS NULL;
UPDATE public.pos_systems SET payment_day = 15 WHERE name IN ('Shift4 Dine', 'Stackably', 'Clover', 'Dejavoo', 'Spot On', 'Basic Terminal');
