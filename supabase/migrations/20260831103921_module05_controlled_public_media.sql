insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('zm-public-media','zm-public-media',false,104857600,array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create or replace function app_private.public_media_object_is_accessible(p_name text)
returns boolean
language sql
stable
security definer
set search_path=app_private,public,pg_temp
as $$
  select exists (
    select 1
    from public.property_media m
    join public.property_publications p on p.property_id=m.property_id
    join public.property_publication_versions v on v.publication_id=p.id and v.is_current_public and v.published_at is not null
    cross join lateral jsonb_array_elements(coalesce(v.snapshot->'media','[]'::jsonb)) media_entry
    where m.archived_at is null
      and m.public_approved=true
      and m.media_type='IMAGE'
      and media_entry->>'id'=m.id::text
      and p_name=('media/'||m.id::text||'/v'||coalesce(media_entry->>'source_version',''))
  );
$$;
revoke all on function app_private.public_media_object_is_accessible(text) from public;
grant execute on function app_private.public_media_object_is_accessible(text) to anon,authenticated;

drop policy if exists zm_public_media_authenticated_read on storage.objects;
create policy zm_public_media_authenticated_read on storage.objects
for select to authenticated
using (bucket_id='zm-public-media' and app_private.has_permission('property.read'));

drop policy if exists zm_public_media_authenticated_upload on storage.objects;
create policy zm_public_media_authenticated_upload on storage.objects
for insert to authenticated
with check (bucket_id='zm-public-media' and app_private.has_permission('property.write') and name like 'media/%');

drop policy if exists zm_public_media_anon_read on storage.objects;
create policy zm_public_media_anon_read on storage.objects
for select to anon
using (bucket_id='zm-public-media' and app_private.public_media_object_is_accessible(name));

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

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',m.id,
    'source_version',m.version,
    'type',m.media_type,
    'title',m.title,
    'alt_text',m.alt_text,
    'sort_order',m.sort_order
  ) order by m.sort_order,m.created_at),'[]'::jsonb) into v_media
  from public.property_media m
  where m.property_id=v_property.id and m.archived_at is null and m.public_approved=true and m.media_type='IMAGE';

  return jsonb_build_object(
    'schema_version',2,
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
