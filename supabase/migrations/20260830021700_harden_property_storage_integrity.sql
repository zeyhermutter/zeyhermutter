create unique index if not exists document_versions_storage_object_uidx
  on public.document_versions(storage_bucket, storage_path);

create unique index if not exists property_media_storage_object_uidx
  on public.property_media(storage_bucket, storage_path);

create or replace function app_private.enforce_document_version_storage_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, storage, pg_temp
as $$
declare
  v_property_id uuid;
begin
  select d.property_id into v_property_id
  from public.documents d
  where d.id = new.document_id;

  if v_property_id is null then
    raise exception 'property document required';
  end if;
  if new.storage_bucket <> 'zm-private-documents' then
    raise exception 'invalid document storage bucket';
  end if;
  if new.storage_path not like ('properties/' || v_property_id::text || '/documents/%') then
    raise exception 'document storage path does not belong to property';
  end if;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = new.storage_bucket
      and o.name = new.storage_path
  ) then
    raise exception 'document storage object does not exist';
  end if;
  return new;
end;
$$;
revoke all on function app_private.enforce_document_version_storage_integrity() from public;

drop trigger if exists document_versions_enforce_storage_integrity on public.document_versions;
create trigger document_versions_enforce_storage_integrity
before insert on public.document_versions
for each row execute function app_private.enforce_document_version_storage_integrity();

create or replace function app_private.enforce_property_media_storage_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, storage, pg_temp
as $$
begin
  if new.storage_bucket <> 'zm-property-media' then
    raise exception 'invalid property media storage bucket';
  end if;
  if new.storage_path not like ('properties/' || new.property_id::text || '/media/%') then
    raise exception 'media storage path does not belong to property';
  end if;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = new.storage_bucket
      and o.name = new.storage_path
  ) then
    raise exception 'property media storage object does not exist';
  end if;
  return new;
end;
$$;
revoke all on function app_private.enforce_property_media_storage_integrity() from public;

drop trigger if exists property_media_enforce_storage_integrity on public.property_media;
create trigger property_media_enforce_storage_integrity
before insert or update of property_id, storage_bucket, storage_path on public.property_media
for each row execute function app_private.enforce_property_media_storage_integrity();

drop policy if exists "zm_documents_delete" on storage.objects;
create policy "zm_documents_delete_orphan_only" on storage.objects
for delete to authenticated
using (
  bucket_id = 'zm-private-documents'
  and app_private.has_permission('document.write')
  and not exists (
    select 1 from public.document_versions dv
    where dv.storage_bucket = storage.objects.bucket_id
      and dv.storage_path = storage.objects.name
  )
);

drop policy if exists "zm_property_media_update" on storage.objects;
drop policy if exists "zm_property_media_delete" on storage.objects;
create policy "zm_property_media_delete_orphan_only" on storage.objects
for delete to authenticated
using (
  bucket_id = 'zm-property-media'
  and app_private.has_permission('property.write')
  and not exists (
    select 1 from public.property_media pm
    where pm.storage_bucket = storage.objects.bucket_id
      and pm.storage_path = storage.objects.name
  )
);
