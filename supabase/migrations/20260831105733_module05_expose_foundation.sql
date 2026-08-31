insert into public.permissions(key,description) values
 ('expose.read','Exposés lesen'),
 ('expose.write','Exposés erzeugen und bearbeiten'),
 ('expose.approve','Exposés freigeben'),
 ('expose.archive','Exposés archivieren')
on conflict(key) do update set description=excluded.description;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id
from public.roles r cross join public.permissions p
where r.key in ('admin','managing_director') and p.key in ('expose.read','expose.write','expose.approve','expose.archive')
on conflict do nothing;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id
from public.roles r cross join public.permissions p
where r.key='marketing' and p.key in ('expose.read','expose.write')
on conflict do nothing;

create sequence if not exists public.expose_number_seq start 1;

create table public.property_exposes (
  id uuid primary key default gen_random_uuid(),
  expose_number text not null unique default ('ZM-E-'||lpad(nextval('public.expose_number_seq')::text,6,'0')),
  property_id uuid not null references public.properties(id) on delete cascade,
  publication_version_id uuid not null references public.property_publication_versions(id) on delete restrict,
  generator_version integer not null default 1 check (generator_version>0),
  version_number integer not null check (version_number>0),
  status text not null default 'GENERATED' check (status in ('GENERATED','APPROVED','RELEASED','ARCHIVED')),
  storage_bucket text not null,
  storage_path text not null,
  original_filename text not null,
  mime_type text not null default 'application/pdf' check (mime_type='application/pdf'),
  file_size_bytes bigint not null check (file_size_bytes>0),
  sha256 text not null check (sha256 ~ '^[a-fA-F0-9]{64}$'),
  generated_at timestamptz not null default now(),
  generated_by uuid references auth.users(id) on delete set null default auth.uid(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  released_at timestamptz,
  released_by uuid references auth.users(id) on delete set null,
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  version bigint not null default 1 check (version>0),
  unique(property_id,version_number),
  unique(publication_version_id,generator_version),
  unique(storage_bucket,storage_path),
  check ((approved_at is null and approved_by is null) or (approved_at is not null and approved_by is not null)),
  check ((released_at is null and released_by is null) or (released_at is not null and released_by is not null)),
  check ((archived_at is null and archived_by is null) or (archived_at is not null and archived_by is not null))
);

create index property_exposes_property_idx on public.property_exposes(property_id);
create index property_exposes_publication_version_idx on public.property_exposes(publication_version_id);
create index property_exposes_generated_by_idx on public.property_exposes(generated_by);
create index property_exposes_approved_by_idx on public.property_exposes(approved_by);
create index property_exposes_released_by_idx on public.property_exposes(released_by);
create index property_exposes_archived_by_idx on public.property_exposes(archived_by);
create index property_exposes_updated_by_idx on public.property_exposes(updated_by);

alter table public.property_exposes enable row level security;
create policy property_exposes_select on public.property_exposes for select to authenticated using (app_private.has_permission('expose.read'));
create policy property_exposes_insert on public.property_exposes for insert to authenticated with check (app_private.has_permission('expose.write') and generated_by=(select auth.uid()));
create policy property_exposes_update on public.property_exposes for update to authenticated using (app_private.has_permission('expose.write')) with check (app_private.has_permission('expose.write'));
grant select,insert,update on public.property_exposes to authenticated;

create or replace function app_private.property_expose_before_insert()
returns trigger
language plpgsql
security definer
set search_path=app_private,public,pg_temp
as $$
declare
 v_publication_property uuid;
begin
 if not app_private.has_permission('expose.write') then raise exception 'EXPOSE_WRITE_REQUIRED' using errcode='42501'; end if;
 perform 1 from public.properties where id=new.property_id for update;
 if not found then raise exception 'PROPERTY_NOT_FOUND' using errcode='P0002'; end if;
 select p.property_id into v_publication_property
 from public.property_publication_versions v join public.property_publications p on p.id=v.publication_id
 where v.id=new.publication_version_id;
 if v_publication_property is null or v_publication_property<>new.property_id then raise exception 'EXPOSE_PUBLICATION_VERSION_MISMATCH' using errcode='22023'; end if;
 new.version_number:=coalesce((select max(e.version_number) from public.property_exposes e where e.property_id=new.property_id),0)+1;
 new.status:='GENERATED';
 new.approved_at:=null;new.approved_by:=null;new.released_at:=null;new.released_by:=null;new.archived_at:=null;new.archived_by:=null;
 new.generated_at:=coalesce(new.generated_at,now());new.generated_by:=auth.uid();new.updated_at:=now();new.updated_by:=auth.uid();new.version:=1;
 return new;
end;
$$;
revoke all on function app_private.property_expose_before_insert() from public,anon,authenticated;

create or replace function app_private.property_expose_before_update()
returns trigger
language plpgsql
security definer
set search_path=app_private,public,pg_temp
as $$
declare
 v_pub_approved timestamptz;
begin
 if row(new.property_id,new.publication_version_id,new.generator_version,new.version_number,new.expose_number,new.storage_bucket,new.storage_path,new.original_filename,new.mime_type,new.file_size_bytes,new.sha256,new.generated_at,new.generated_by,new.created_at)
    is distinct from row(old.property_id,old.publication_version_id,old.generator_version,old.version_number,old.expose_number,old.storage_bucket,old.storage_path,old.original_filename,old.mime_type,old.file_size_bytes,old.sha256,old.generated_at,old.generated_by,old.created_at) then
   raise exception 'EXPOSE_ARTIFACT_FIELDS_IMMUTABLE' using errcode='42501';
 end if;
 if new.status is distinct from old.status then
   if old.status='GENERATED' and new.status='APPROVED' then
     if not app_private.has_permission('expose.approve') then raise exception 'EXPOSE_APPROVE_REQUIRED' using errcode='42501'; end if;
     select approved_at into v_pub_approved from public.property_publication_versions where id=old.publication_version_id;
     if v_pub_approved is null then raise exception 'PUBLICATION_VERSION_NOT_APPROVED' using errcode='22023'; end if;
     new.approved_at:=now();new.approved_by:=auth.uid();
   elsif old.status='APPROVED' and new.status='RELEASED' then
     if not app_private.has_permission('expose.approve') then raise exception 'EXPOSE_APPROVE_REQUIRED' using errcode='42501'; end if;
     new.released_at:=now();new.released_by:=auth.uid();
   elsif old.status in ('GENERATED','APPROVED','RELEASED') and new.status='ARCHIVED' then
     if not app_private.has_permission('expose.archive') then raise exception 'EXPOSE_ARCHIVE_REQUIRED' using errcode='42501'; end if;
     new.archived_at:=now();new.archived_by:=auth.uid();
   else
     raise exception 'INVALID_EXPOSE_STATUS_TRANSITION:%->%',old.status,new.status using errcode='22023';
   end if;
 else
   if row(new.approved_at,new.approved_by,new.released_at,new.released_by,new.archived_at,new.archived_by)
      is distinct from row(old.approved_at,old.approved_by,old.released_at,old.released_by,old.archived_at,old.archived_by) then
     raise exception 'EXPOSE_WORKFLOW_FIELDS_PROTECTED' using errcode='42501';
   end if;
 end if;
 new.updated_at:=now();new.updated_by:=auth.uid();new.version:=old.version+1;
 return new;
end;
$$;
revoke all on function app_private.property_expose_before_update() from public,anon,authenticated;

create trigger property_exposes_before_insert before insert on public.property_exposes for each row execute function app_private.property_expose_before_insert();
create trigger property_exposes_before_update before update on public.property_exposes for each row execute function app_private.property_expose_before_update();
create trigger property_exposes_audit after insert or update or delete on public.property_exposes for each row execute function app_private.audit_row_change('PROPERTY_EXPOSE','expose_number');

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('zm-private-exposes','zm-private-exposes',false,31457280,array['application/pdf'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create or replace function app_private.storage_object_is_registered(p_bucket text,p_path text)
returns boolean
language sql
stable
security definer
set search_path='pg_catalog','public','pg_temp'
as $$
 select exists(select 1 from public.document_versions dv where dv.storage_bucket=p_bucket and dv.storage_path=p_path)
 or exists(select 1 from public.property_media pm where pm.storage_bucket=p_bucket and pm.storage_path=p_path)
 or exists(select 1 from public.property_exposes pe where pe.storage_bucket=p_bucket and pe.storage_path=p_path);
$$;
revoke all on function app_private.storage_object_is_registered(text,text) from public;

drop policy if exists zm_exposes_read on storage.objects;
create policy zm_exposes_read on storage.objects for select to authenticated
using (bucket_id='zm-private-exposes' and app_private.has_permission('expose.read') and app_private.storage_object_is_registered(bucket_id,name));
drop policy if exists zm_exposes_upload on storage.objects;
create policy zm_exposes_upload on storage.objects for insert to authenticated
with check (bucket_id='zm-private-exposes' and app_private.has_permission('expose.write') and name like 'properties/%/exposes/%');
drop policy if exists zm_exposes_delete_orphan_only on storage.objects;
create policy zm_exposes_delete_orphan_only on storage.objects for delete to authenticated
using (bucket_id='zm-private-exposes' and app_private.has_permission('expose.write') and not app_private.storage_object_is_registered(bucket_id,name));
