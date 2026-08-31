alter table public.property_publications
  add column if not exists subtitle text,
  add column if not exists features_description text,
  add column if not exists content_review_confirmed_at timestamptz,
  add column if not exists content_review_confirmed_by uuid references auth.users(id) on delete set null;
create index if not exists property_publications_reviewed_by_idx on public.property_publications(content_review_confirmed_by);

create or replace function app_private.property_publication_review_guard()
returns trigger
language plpgsql
security definer
set search_path=app_private,public,pg_temp
as $$
declare
  v_content_changed boolean;
begin
  v_content_changed := row(new.slug,new.public_title,new.subtitle,new.teaser,new.description,new.location_description,new.features_description,new.public_highlights,new.seo_title,new.seo_description)
    is distinct from row(old.slug,old.public_title,old.subtitle,old.teaser,old.description,old.location_description,old.features_description,old.public_highlights,old.seo_title,old.seo_description);

  if v_content_changed then
    new.content_review_confirmed_at:=null;
    new.content_review_confirmed_by:=null;
  elsif new.content_review_confirmed_at is distinct from old.content_review_confirmed_at
     or new.content_review_confirmed_by is distinct from old.content_review_confirmed_by then
    if not app_private.has_permission('property.publish') then
      raise exception 'PROPERTY_PUBLISH_REQUIRED' using errcode='42501';
    end if;
    if new.content_review_confirmed_at is null then
      new.content_review_confirmed_by:=null;
    else
      new.content_review_confirmed_at:=now();
      new.content_review_confirmed_by:=auth.uid();
    end if;
  end if;
  return new;
end;
$$;
revoke all on function app_private.property_publication_review_guard() from public,anon,authenticated;

drop trigger if exists property_publications_review_guard on public.property_publications;
create trigger property_publications_review_guard
before update on public.property_publications
for each row execute function app_private.property_publication_review_guard();

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
  v_media_count integer;
begin
  select * into v_property from public.properties where id=p_publication.property_id;
  if v_property.id is null then raise exception 'PROPERTY_NOT_FOUND' using errcode='P0002'; end if;
  if v_property.status not in ('PREPARATION','MARKETING','RESERVED') then raise exception 'PROPERTY_NOT_READY_FOR_PUBLICATION' using errcode='22023'; end if;
  if nullif(trim(p_publication.public_title),'') is null then raise exception 'PUBLIC_TITLE_REQUIRED' using errcode='22023'; end if;
  if length(trim(coalesce(p_publication.teaser,''))) < 20 then raise exception 'PUBLIC_TEASER_TOO_SHORT' using errcode='22023'; end if;
  if length(trim(coalesce(p_publication.description,''))) < 40 then raise exception 'PUBLIC_DESCRIPTION_TOO_SHORT' using errcode='22023'; end if;
  if p_publication.content_review_confirmed_at is null or p_publication.content_review_confirmed_by is null then raise exception 'PUBLIC_CONTENT_REVIEW_REQUIRED' using errcode='22023'; end if;
  if v_property.transaction_type='SALE' and coalesce(v_property.purchase_price,0)<=0 then raise exception 'PUBLIC_PRICE_REQUIRED' using errcode='22023'; end if;
  if v_property.transaction_type='RENT' and coalesce(v_property.rent_cold,0)<=0 then raise exception 'PUBLIC_RENT_REQUIRED' using errcode='22023'; end if;
  if v_property.property_type in ('DETACHED_HOUSE','SEMI_DETACHED_HOUSE','TERRACED_HOUSE','APARTMENT_BUILDING','APARTMENT','PENTHOUSE','MAISONETTE') and coalesce(v_property.living_area_sqm,0)<=0 then raise exception 'PUBLIC_LIVING_AREA_REQUIRED' using errcode='22023'; end if;
  if v_property.property_type='LAND' and coalesce(v_property.plot_area_sqm,0)<=0 then raise exception 'PUBLIC_PLOT_AREA_REQUIRED' using errcode='22023'; end if;

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

  select count(*)::integer,
         coalesce(jsonb_agg(jsonb_build_object(
           'id',m.id,'source_version',m.version,'type',m.media_type,'title',m.title,'alt_text',m.alt_text,'sort_order',m.sort_order
         ) order by m.sort_order,m.created_at),'[]'::jsonb)
  into v_media_count,v_media
  from public.property_media m
  where m.property_id=v_property.id and m.archived_at is null and m.public_approved=true and m.media_type='IMAGE';
  if v_media_count<1 then raise exception 'PUBLIC_IMAGE_REQUIRED' using errcode='22023'; end if;

  return jsonb_build_object(
    'schema_version',3,
    'property_id',v_property.id,
    'property_number',v_property.property_number,
    'slug',p_publication.slug,
    'title',trim(p_publication.public_title),
    'subtitle',nullif(trim(coalesce(p_publication.subtitle,'')),''),
    'teaser',trim(p_publication.teaser),
    'description',trim(p_publication.description),
    'location_description',nullif(trim(coalesce(p_publication.location_description,'')),''),
    'features_description',nullif(trim(coalesce(p_publication.features_description,'')),''),
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
