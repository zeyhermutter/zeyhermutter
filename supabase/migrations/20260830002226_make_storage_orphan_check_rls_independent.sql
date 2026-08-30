create or replace function app_private.storage_object_is_registered(p_bucket text, p_path text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select exists (
    select 1
    from public.document_versions dv
    where dv.storage_bucket = p_bucket
      and dv.storage_path = p_path
  ) or exists (
    select 1
    from public.property_media pm
    where pm.storage_bucket = p_bucket
      and pm.storage_path = p_path
  );
$$;
revoke all on function app_private.storage_object_is_registered(text,text) from public;
grant execute on function app_private.storage_object_is_registered(text,text) to authenticated;

drop policy if exists "zm_documents_delete_orphan_only" on storage.objects;
create policy "zm_documents_delete_orphan_only" on storage.objects
for delete to authenticated
using (
  bucket_id = 'zm-private-documents'
  and app_private.has_permission('document.write')
  and not app_private.storage_object_is_registered(storage.objects.bucket_id, storage.objects.name)
);

drop policy if exists "zm_property_media_delete_orphan_only" on storage.objects;
create policy "zm_property_media_delete_orphan_only" on storage.objects
for delete to authenticated
using (
  bucket_id = 'zm-property-media'
  and app_private.has_permission('property.write')
  and not app_private.storage_object_is_registered(storage.objects.bucket_id, storage.objects.name)
);
