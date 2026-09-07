drop trigger if exists property_expose_media_set_metadata on public.property_expose_media;
create trigger property_expose_media_set_metadata before update on public.property_expose_media for each row execute function app_private.set_standard_update_metadata();
