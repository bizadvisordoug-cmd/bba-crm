-- Add visibility column to campaigns table
ALTER TABLE public.campaigns ADD COLUMN is_shared boolean DEFAULT false;

-- Create index for faster queries
CREATE INDEX campaigns_is_shared_idx ON public.campaigns(is_shared);
