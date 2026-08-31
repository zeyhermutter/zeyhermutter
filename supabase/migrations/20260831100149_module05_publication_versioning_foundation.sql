create table public.property_publications (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null unique references public.properties(id) on delete cascade,
  slug text not null unique,
  public_title text not null,
  teaser text,
  description text,
  location_description text,
  public_highlights text[] not null default '{}',
  seo_title text,
  seo_description text,
  status text not null default 'DRAFT' check (status in ('DRAFT','READY','PUBLISHED','UNPUBLISHED')),
  candidate_version integer,
  published_version integer,
  has_unpublished_changes boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  version bigint not null default 1 check (version > 0),
  check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create table public.property_publication_versions (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references public.property_publications(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  public_slug text not null,
  public_title text not null,
  teaser text,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  published_by uuid references auth.users(id) on delete set null,
  is_current_public boolean not null default false,
  unique(publication_id,version_number),
  check ((published_at is null and published_by is null) or (published_at is not null and published_by is not null)),
  check ((approved_at is null and approved_by is null) or (approved_at is not null and approved_by is not null))
);

create unique index property_publication_versions_current_idx on public.property_publication_versions(publication_id) where is_current_public;
create index property_publication_versions_slug_idx on public.property_publication_versions(public_slug) where is_current_public;
create index property_publication_versions_created_by_idx on public.property_publication_versions(created_by);
create index property_publications_updated_by_idx on public.property_publications(updated_by);

alter table public.property_publications enable row level security;
alter table public.property_publication_versions enable row level security;

create policy property_publications_select on public.property_publications
for select to authenticated using (app_private.has_permission('property.read'));
create policy property_publications_insert on public.property_publications
for insert to authenticated with check (app_private.has_permission('property.write') and created_by=(select auth.uid()));
create policy property_publications_update on public.property_publications
for update to authenticated using (app_private.has_permission('property.write')) with check (app_private.has_permission('property.write'));

create policy property_publication_versions_authenticated_select on public.property_publication_versions
for select to authenticated using (app_private.has_permission('property.read'));
create policy property_publication_versions_public_select on public.property_publication_versions
for select to anon using (is_current_public and published_at is not null);

grant select,insert,update on public.property_publications to authenticated;
grant select on public.property_publication_versions to authenticated,anon;

create or replace function app_private.build_property_publication_snapshot(p_publication public.property_publications)
returns jsonb
language plpgsql
security definer
set search_path = app_private, public, pg_temp
as $$
declare
  v_property public.properties%rowtype;
  v_address public.property_addresses%rowtype;
  v_energy public.property_energy_data%rowtype;
  v_address_json jsonb;
  v_features jsonb;
  v_media jsonb;
begin
  select * into v_property from public.properties where id=p_publication.property_id;
  if v_property.id is null then raise exception 'PROPERTY_NOT_FOUND' using errcode='P0002'; end if;
  if v_property.status not in ('PREPARATION','MARKETING','RESERVED') then
    raise exception 'PROPERTY_NOT_READY_FOR_PUBLICATION' using errcode='22023';
  end if;
  if nullif(trim(p_publication.public_title),'') is null then raise exception 'PUBLIC_TITLE_REQUIRED' using errcode='22023'; end if;
  if length(trim(coalesce(p_publication.description,''))) < 40 then raise exception 'PUBLIC_DESCRIPTION_TOO_SHORT' using errcode='22023'; end if;
  if v_property.transaction_type='SALE' and coalesce(v_property.purchase_price,0)<=0 then raise exception 'PUBLIC_PRICE_REQUIRED' using errcode='22023'; end if;
  if v_property.transaction_type='RENT' and coalesce(v_property.rent_cold,0)<=0 then raise exception 'PUBLIC_RENT_REQUIRED' using errcode='22023'; end if;

  select * into v_address from public.property_addresses where property_id=v_property.id;
  if v_address.id is null then raise exception 'PROPERTY_ADDRESS_REQUIRED' using errcode='22023'; end if;
  select * into v_energy from public.property_energy_data where property_id=v_property.id;

  v_address_json := case v_address.public_address_mode
    when 'FULL' then jsonb_build_object('street',v_address.street,'house_number',v_address.house_number,'postal_code',v_address.postal_code,'city',v_address.city,'district',v_address.district,'country',v_address.country)
    when 'STREET_ONLY' then jsonb_build_object('street',v_address.street,'city',v_address.city,'district',v_address.district,'country',v_address.country)
    when 'DISTRICT_ONLY' then jsonb_build_object('city',v_address.city,'district',v_address.district,'country',v_address.country)
    when 'CITY_ONLY' then jsonb_build_object('city',v_address.city,'country',v_address.country)
    else null
  end;

  select coalesce(jsonb_agg(jsonb_build_object(
    'key',f.feature_key,'label',f.label,'type',f.value_type,
    'value',case f.value_type when 'BOOLEAN' then to_jsonb(f.boolean_value) when 'TEXT' then to_jsonb(f.text_value) else to_jsonb(f.number_value) end,
    'unit',f.unit
  ) order by f.label),'[]'::jsonb) into v_features
  from public.property_features f where f.property_id=v_property.id;

  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'type',m.media_type,'title',m.title,'alt_text',m.alt_text,'sort_order',m.sort_order) order by m.sort_order,m.created_at),'[]'::jsonb) into v_media
  from public.property_media m where m.property_id=v_property.id and m.archived_at is null and m.public_approved=true;

  return jsonb_build_object(
    'schema_version',1,
    'property_id',v_property.id,
    'property_number',v_property.property_number,
    'slug',p_publication.slug,
    'title',trim(p_publication.public_title),
    'teaser',nullif(trim(coalesce(p_publication.teaser,'')),''),
    'description',trim(p_publication.description),
    'location_description',nullif(trim(coalesce(p_publication.location_description,'')),''),
    'highlights',to_jsonb(coalesce(p_publication.public_highlights,'{}'::text[])),
    'seo',jsonb_build_object('title',nullif(trim(coalesce(p_publication.seo_title,'')),''),'description',nullif(trim(coalesce(p_publication.seo_description,'')),'')),
    'property_type',v_property.property_type,
    'transaction_type',v_property.transaction_type,
    'price',case when v_property.transaction_type='SALE' then v_property.purchase_price else v_property.rent_cold end,
    'additional_costs',v_property.additional_costs,
    'hoa_fee',v_property.hoa_fee,
    'living_area_sqm',v_property.living_area_sqm,
    'usable_area_sqm',v_property.usable_area_sqm,
    'plot_area_sqm',v_property.plot_area_sqm,
    'rooms',v_property.rooms,
    'bedrooms',v_property.bedrooms,
    'bathrooms',v_property.bathrooms,
    'floor',v_property.floor,
    'year_built',v_property.year_built,
    'modernization_year',v_property.modernization_year,
    'condition',v_property.condition,
    'available_from',v_property.available_from,
    'parking_spaces',v_property.parking_spaces,
    'address_mode',v_address.public_address_mode,
    'address',v_address_json,
    'features',v_features,
    'energy',case when v_energy.id is null then null else jsonb_build_object('certificate_present',v_energy.certificate_present,'certificate_type',v_energy.certificate_type,'energy_value_kwh',v_energy.energy_value_kwh,'efficiency_class',v_energy.efficiency_class,'energy_source',v_energy.energy_source,'building_year',v_energy.building_year,'valid_until',v_energy.valid_until) end,
    'media',v_media,
    'generated_at',now()
  );
end;
$$;
revoke all on function app_private.build_property_publication_snapshot(public.property_publications) from public,anon,authenticated;

create or replace function app_private.property_publication_workflow()
returns trigger
language plpgsql
security definer
set search_path = app_private, public, pg_temp
as $$
declare
  v_content_changed boolean := false;
  v_next_version integer;
  v_snapshot jsonb;
  v_property_status text;
  v_rows integer;
begin
  if tg_op='INSERT' then
    if not app_private.has_permission('property.write') then raise exception 'PROPERTY_WRITE_REQUIRED' using errcode='42501'; end if;
    new.slug := lower(trim(new.slug));
    new.public_title := trim(new.public_title);
    new.teaser := nullif(trim(coalesce(new.teaser,'')),'');
    new.description := nullif(trim(coalesce(new.description,'')),'');
    new.location_description := nullif(trim(coalesce(new.location_description,'')),'');
    new.seo_title := nullif(trim(coalesce(new.seo_title,'')),'');
    new.seo_description := nullif(trim(coalesce(new.seo_description,'')),'');
    new.status := 'DRAFT'; new.candidate_version:=null; new.published_version:=null; new.has_unpublished_changes:=true;
    return new;
  end if;

  if new.property_id is distinct from old.property_id or new.created_at is distinct from old.created_at or new.created_by is distinct from old.created_by then
    raise exception 'PUBLICATION_SYSTEM_FIELDS_PROTECTED' using errcode='42501';
  end if;
  if new.candidate_version is distinct from old.candidate_version or new.published_version is distinct from old.published_version or new.has_unpublished_changes is distinct from old.has_unpublished_changes then
    raise exception 'PUBLICATION_WORKFLOW_FIELDS_PROTECTED' using errcode='42501';
  end if;

  new.slug := lower(trim(new.slug));
  new.public_title := trim(new.public_title);
  new.teaser := nullif(trim(coalesce(new.teaser,'')),'');
  new.description := nullif(trim(coalesce(new.description,'')),'');
  new.location_description := nullif(trim(coalesce(new.location_description,'')),'');
  new.seo_title := nullif(trim(coalesce(new.seo_title,'')),'');
  new.seo_description := nullif(trim(coalesce(new.seo_description,'')),'');

  v_content_changed := row(new.slug,new.public_title,new.teaser,new.description,new.location_description,new.public_highlights,new.seo_title,new.seo_description)
    is distinct from row(old.slug,old.public_title,old.teaser,old.description,old.location_description,old.public_highlights,old.seo_title,old.seo_description);

  if v_content_changed then
    new.candidate_version:=null;
    new.has_unpublished_changes:=true;
    if new.status=old.status and old.status in ('READY','PUBLISHED') then new.status:='DRAFT'; end if;
    if new.status='PUBLISHED' then raise exception 'PREPARE_VERSION_BEFORE_PUBLISH' using errcode='22023'; end if;
  end if;

  if new.status is distinct from old.status then
    if not (
      (old.status='DRAFT' and new.status in ('READY','UNPUBLISHED')) or
      (old.status='READY' and new.status in ('DRAFT','PUBLISHED','UNPUBLISHED')) or
      (old.status='PUBLISHED' and new.status in ('DRAFT','UNPUBLISHED')) or
      (old.status='UNPUBLISHED' and new.status in ('DRAFT','READY'))
    ) then raise exception 'INVALID_PUBLICATION_STATUS_TRANSITION' using errcode='22023'; end if;

    if old.status='PUBLISHED' and new.status='DRAFT' and not v_content_changed then
      raise exception 'PUBLISHED_TO_DRAFT_REQUIRES_CONTENT_CHANGE' using errcode='22023';
    end if;

    if new.status='READY' then
      if not app_private.has_permission('property.write') then raise exception 'PROPERTY_WRITE_REQUIRED' using errcode='42501'; end if;
      v_snapshot:=app_private.build_property_publication_snapshot(new);
      select coalesce(max(version_number),0)+1 into v_next_version from public.property_publication_versions where publication_id=old.id;
      insert into public.property_publication_versions(publication_id,version_number,public_slug,public_title,teaser,snapshot,created_by)
      values(old.id,v_next_version,new.slug,new.public_title,new.teaser,v_snapshot,auth.uid());
      new.candidate_version:=v_next_version;
      new.has_unpublished_changes:=false;
    elsif new.status='PUBLISHED' then
      if not app_private.has_permission('property.publish') then raise exception 'PROPERTY_PUBLISH_REQUIRED' using errcode='42501'; end if;
      if old.status<>'READY' or old.candidate_version is null or old.has_unpublished_changes then raise exception 'PUBLICATION_VERSION_NOT_READY' using errcode='22023'; end if;
      select status into v_property_status from public.properties where id=old.property_id;
      if v_property_status not in ('MARKETING','RESERVED') then raise exception 'PROPERTY_NOT_IN_MARKETING' using errcode='22023'; end if;
      update public.property_publication_versions set is_current_public=false where publication_id=old.id and is_current_public;
      update public.property_publication_versions
        set approved_at=coalesce(approved_at,now()),approved_by=coalesce(approved_by,auth.uid()),published_at=now(),published_by=auth.uid(),is_current_public=true
        where publication_id=old.id and version_number=old.candidate_version and published_at is null;
      get diagnostics v_rows=row_count;
      if v_rows<>1 then raise exception 'PUBLICATION_CANDIDATE_NOT_FOUND' using errcode='22023'; end if;
      new.candidate_version:=old.candidate_version;
      new.published_version:=old.candidate_version;
      new.has_unpublished_changes:=false;
    elsif new.status='UNPUBLISHED' then
      if not app_private.has_permission('property.publish') then raise exception 'PROPERTY_PUBLISH_REQUIRED' using errcode='42501'; end if;
      if old.published_version is null then raise exception 'NO_PUBLISHED_VERSION' using errcode='22023'; end if;
      update public.property_publication_versions set is_current_public=false where publication_id=old.id and is_current_public;
      new.candidate_version:=null;
      new.has_unpublished_changes:=true;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function app_private.property_publication_workflow() from public,anon,authenticated;

create trigger property_publications_workflow before insert or update on public.property_publications
for each row execute function app_private.property_publication_workflow();
create trigger property_publications_set_metadata before update on public.property_publications
for each row execute function app_private.set_standard_update_metadata();
create trigger property_publications_audit after insert or update or delete on public.property_publications
for each row execute function app_private.audit_row_change('PROPERTY_PUBLICATION','slug');

create or replace function public.public_property_listings()
returns table(public_slug text,public_title text,teaser text,snapshot jsonb,published_at timestamptz)
language sql
stable
security invoker
set search_path=public,pg_temp
as $$
  select v.public_slug,v.public_title,v.teaser,v.snapshot,v.published_at
  from public.property_publication_versions v
  where v.is_current_public and v.published_at is not null
  order by v.published_at desc;
$$;
revoke all on function public.public_property_listings() from public;
grant execute on function public.public_property_listings() to anon,authenticated;

create or replace function public.public_property_by_slug(p_slug text)
returns table(public_slug text,public_title text,teaser text,snapshot jsonb,published_at timestamptz)
language sql
stable
security invoker
set search_path=public,pg_temp
as $$
  select v.public_slug,v.public_title,v.teaser,v.snapshot,v.published_at
  from public.property_publication_versions v
  where v.is_current_public and v.published_at is not null and v.public_slug=lower(trim(p_slug))
  limit 1;
$$;
revoke all on function public.public_property_by_slug(text) from public;
grant execute on function public.public_property_by_slug(text) to anon,authenticated;
