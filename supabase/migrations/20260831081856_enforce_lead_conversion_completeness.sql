create or replace function app_private.validate_lead_business_rules()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'NEW' then
      raise exception 'new lead must start in NEW';
    end if;
    if new.archived_at is not null or new.archived_by is not null then
      raise exception 'new lead cannot start archived';
    end if;
    if new.converted_property_id is not null or new.converted_at is not null or new.converted_by is not null then
      raise exception 'new lead cannot start converted';
    end if;
  else
    if old.lead_number is distinct from new.lead_number then
      raise exception 'lead number is system managed and immutable';
    end if;
    if old.status is distinct from new.status and not exists (
      select 1 from public.lead_status_transitions t
      where t.from_status = old.status and t.to_status = new.status
    ) then
      raise exception 'invalid lead status transition: % -> %', old.status, new.status;
    end if;
  end if;

  if new.status = 'LOST' and nullif(trim(coalesce(new.lost_reason,'')),'') is null then
    raise exception 'lost reason required for LOST lead';
  end if;

  if new.converted_property_id is null
     and new.status in ('QUALIFIED','APPOINTMENT','VALUATION','OFFER','WON')
     and new.source_id is null then
    raise exception 'LEAD_SOURCE_REQUIRED_FROM_QUALIFIED' using errcode='22023';
  end if;

  if new.consent_given and new.consent_at is null then
    raise exception 'consent timestamp required when consent is given';
  end if;
  return new;
end;
$function$;

create or replace function public.convert_lead_to_property(p_lead_id uuid, p_expected_version bigint, p_internal_title text default null::text)
returns uuid
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user uuid := auth.uid();
  v_lead public.leads%rowtype;
  v_property_id uuid;
  v_contact_name text;
  v_title text;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if not app_private.has_permission('lead.convert') then raise exception 'LEAD_CONVERT_REQUIRED' using errcode='42501'; end if;
  if not app_private.has_permission('property.write') then raise exception 'PROPERTY_WRITE_REQUIRED' using errcode='42501'; end if;

  select * into v_lead from public.leads where id = p_lead_id for update;
  if v_lead.id is null then raise exception 'LEAD_NOT_FOUND' using errcode='P0002'; end if;
  if v_lead.converted_property_id is not null then return v_lead.converted_property_id; end if;
  if v_lead.version <> p_expected_version then raise exception 'LEAD_VERSION_CONFLICT' using errcode='40001'; end if;
  if v_lead.archived_at is not null then raise exception 'ARCHIVED_LEAD_CANNOT_CONVERT' using errcode='22023'; end if;
  if v_lead.status <> 'WON' then raise exception 'LEAD_MUST_BE_WON' using errcode='22023'; end if;
  if v_lead.source_id is null then raise exception 'LEAD_SOURCE_REQUIRED' using errcode='22023'; end if;
  if v_lead.property_type is null then raise exception 'PROPERTY_TYPE_REQUIRED' using errcode='22023'; end if;
  if nullif(trim(coalesce(v_lead.property_street,'')),'') is null
     or nullif(trim(coalesce(v_lead.property_house_number,'')),'') is null
     or nullif(trim(coalesce(v_lead.property_postal_code,'')),'') is null
     or nullif(trim(coalesce(v_lead.property_city,'')),'') is null then
    raise exception 'LEAD_ADDRESS_REQUIRED' using errcode='22023';
  end if;
  if v_lead.occupancy_status is null or v_lead.occupancy_status = 'UNKNOWN' then raise exception 'LEAD_OCCUPANCY_REQUIRED' using errcode='22023'; end if;
  if nullif(trim(coalesce(v_lead.desired_sale_horizon,'')),'') is null then raise exception 'LEAD_SALE_HORIZON_REQUIRED' using errcode='22023'; end if;

  if v_lead.property_type in ('APARTMENT','PENTHOUSE','MAISONETTE') then
    if coalesce(v_lead.living_area_sqm,0) <= 0 then raise exception 'LEAD_LIVING_AREA_REQUIRED' using errcode='22023'; end if;
    if coalesce(v_lead.rooms,0) <= 0 then raise exception 'LEAD_ROOMS_REQUIRED' using errcode='22023'; end if;
  elsif v_lead.property_type in ('DETACHED_HOUSE','SEMI_DETACHED_HOUSE','TERRACED_HOUSE') then
    if coalesce(v_lead.living_area_sqm,0) <= 0 then raise exception 'LEAD_LIVING_AREA_REQUIRED' using errcode='22023'; end if;
    if coalesce(v_lead.plot_area_sqm,0) <= 0 then raise exception 'LEAD_PLOT_AREA_REQUIRED' using errcode='22023'; end if;
    if coalesce(v_lead.rooms,0) <= 0 then raise exception 'LEAD_ROOMS_REQUIRED' using errcode='22023'; end if;
  elsif v_lead.property_type = 'APARTMENT_BUILDING' then
    if coalesce(v_lead.living_area_sqm,0) <= 0 then raise exception 'LEAD_LIVING_AREA_REQUIRED' using errcode='22023'; end if;
    if coalesce(v_lead.plot_area_sqm,0) <= 0 then raise exception 'LEAD_PLOT_AREA_REQUIRED' using errcode='22023'; end if;
  elsif v_lead.property_type = 'LAND' then
    if coalesce(v_lead.plot_area_sqm,0) <= 0 then raise exception 'LEAD_PLOT_AREA_REQUIRED' using errcode='22023'; end if;
  elsif v_lead.property_type in ('COMMERCIAL','OFFICE','RETAIL') then
    if coalesce(v_lead.living_area_sqm,0) <= 0 then raise exception 'LEAD_USABLE_AREA_REQUIRED' using errcode='22023'; end if;
  elsif v_lead.property_type = 'OTHER' then
    if coalesce(v_lead.living_area_sqm,0) <= 0 and coalesce(v_lead.plot_area_sqm,0) <= 0 and coalesce(v_lead.rooms,0) <= 0 then raise exception 'LEAD_SIZE_INFORMATION_REQUIRED' using errcode='22023'; end if;
  end if;

  if v_lead.price_expectation is null and v_lead.estimated_market_value is null then raise exception 'LEAD_PRICE_OR_MARKET_VALUE_REQUIRED' using errcode='22023'; end if;
  if v_lead.primary_responsible_user is distinct from v_user and not app_private.has_permission('property.assign') then raise exception 'PROPERTY_ASSIGN_REQUIRED' using errcode='42501'; end if;

  select trim(c.first_name || ' ' || c.last_name) into v_contact_name from public.contacts c where c.id = v_lead.contact_id and c.archived_at is null;
  if v_contact_name is null then raise exception 'LEAD_CONTACT_NOT_AVAILABLE' using errcode='22023'; end if;

  v_title := nullif(trim(coalesce(p_internal_title,'')),'');
  if v_title is null then v_title := concat('Verkäufer ', v_contact_name, ' · ', trim(v_lead.property_city), ' · ', v_lead.lead_number); end if;

  insert into public.properties(
    internal_title, property_type, transaction_type, purchase_price,
    living_area_sqm, plot_area_sqm, rooms, year_built, condition, tenancy_status,
    internal_notes, primary_responsible_user, created_by, updated_by
  ) values (
    v_title, v_lead.property_type, 'SALE', v_lead.price_expectation,
    v_lead.living_area_sqm, v_lead.plot_area_sqm, v_lead.rooms, v_lead.year_built,
    v_lead.property_condition, v_lead.occupancy_status,
    concat_ws(E'\n',
      nullif(v_lead.internal_notes,''),
      case when v_lead.estimated_market_value is not null then 'Bewerteter Marktwert aus Lead: ' || v_lead.estimated_market_value::text || ' EUR' end,
      case when v_lead.message is not null then 'Lead-Hintergrund: ' || v_lead.message end,
      'Verkaufshorizont aus Lead: ' || v_lead.desired_sale_horizon,
      'Konvertiert aus ' || v_lead.lead_number
    ),
    v_lead.primary_responsible_user, v_user, v_user
  ) returning id into v_property_id;

  insert into public.property_addresses(
    property_id, street, house_number, postal_code, city, district, country,
    public_address_mode, created_by, updated_by
  ) values (
    v_property_id, trim(v_lead.property_street), trim(v_lead.property_house_number),
    trim(v_lead.property_postal_code), trim(v_lead.property_city),
    nullif(trim(coalesce(v_lead.property_district,'')),''), v_lead.property_country,
    'CITY_ONLY', v_user, v_user
  );

  insert into public.property_owners(
    property_id, contact_id, ownership_percentage, ownership_type, primary_contact,
    valid_from, created_by, updated_by
  ) values (
    v_property_id, v_lead.contact_id, 100.00, 'SOLE_OWNER', true,
    current_date, v_user, v_user
  );

  perform set_config('app.lead_conversion','1',true);
  update public.leads
  set converted_property_id = v_property_id, converted_at = now(), converted_by = v_user
  where id = v_lead.id and version = p_expected_version;
  if not found then raise exception 'LEAD_VERSION_CONFLICT' using errcode='40001'; end if;

  insert into public.activity_events(activity_type,title,description,actor_user_id,contact_id,property_id,lead_id,metadata)
  values ('LEAD_CONVERTED','Verkäufer-Lead in Immobilie übernommen',v_lead.lead_number || ' wurde in eine neue Immobilie überführt.',v_user,v_lead.contact_id,v_property_id,v_lead.id,jsonb_build_object('lead_number',v_lead.lead_number,'property_id',v_property_id));

  return v_property_id;
end;
$function$;
