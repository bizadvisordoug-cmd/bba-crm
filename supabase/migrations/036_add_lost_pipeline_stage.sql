-- Add 'Lost' as a pipeline stage so leads that don't convert can be tracked
insert into public.pipeline_stages (name, "order")
values ('Lost', 9)
on conflict (name) do nothing;
