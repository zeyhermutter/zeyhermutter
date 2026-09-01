create or replace function app_private.set_sales_readiness_media_update_metadata()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  new.id := old.id;
  new.check_id := old.check_id;
  new.created_at := old.created_at;
  new.created_by := old.created_by;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), old.updated_by);
  new.version := old.version + 1;
  return new;
end;
$function$;

drop trigger if exists lead_sales_readiness_media_40_metadata on public.lead_sales_readiness_media;
create trigger lead_sales_readiness_media_40_metadata
before update on public.lead_sales_readiness_media
for each row execute function app_private.set_sales_readiness_media_update_metadata();
