-- Migration 011: header image width on campaign_steps
-- Allows per-step control of the email header image display width (in px).
-- Run in Supabase SQL Editor after 010_commission_notifications.sql.

ALTER TABLE public.campaign_steps
  ADD COLUMN IF NOT EXISTS header_image_width integer DEFAULT NULL;

NOTIFY pgrst, 'reload schema';
