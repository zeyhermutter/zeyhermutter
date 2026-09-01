create index if not exists property_expose_media_created_by_idx
  on public.property_expose_media(created_by)
  where created_by is not null;

create index if not exists property_expose_media_updated_by_idx
  on public.property_expose_media(updated_by)
  where updated_by is not null;
