alter table public.leads
  add column valuation_appointment_at timestamptz,
  add column estimated_market_value numeric(14,2),
  add column valuation_notes text,
  add column offer_created_at timestamptz,
  add column offered_commission_percent numeric(6,3),
  add column offered_terms text,
  add column internal_notes text;

alter table public.leads
  add constraint leads_estimated_market_value_check check (estimated_market_value is null or estimated_market_value >= 0),
  add constraint leads_offered_commission_percent_check check (offered_commission_percent is null or (offered_commission_percent >= 0 and offered_commission_percent <= 100));

create index leads_valuation_appointment_idx on public.leads(valuation_appointment_at) where archived_at is null and valuation_appointment_at is not null;

create or replace function public.convert_lead_to_property(
  p_lead_id uuid,
  p_expected_version bigint,
  p_internal_title text default null
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_lead public.leads%rowtype;
  v_property_id uuid;
  v_contact_name text;
  v_any_address boolean;
  v_full_address boolean;
  v_title text;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;
  if not app_private.has_permission('lead.convert') then
    raise exception 'LEAD_CONVERT_REQUIRED' using errcode='42501';
  end if;
  if not app_private.has_permission('property.write') then
    raise exception 'PROPERTY_WRITE_REQUIRED' using errcode='42501';
  end if;

  select * into v_lead
  from public.leads
  where id = p_lead_id
  for update;

  if v_lead.id is null then
    raise exception 'LEAD_NOT_FOUND' using errcode='P0002';
  end if;

  if v_lead.converted_property_id is not null then
    return v_lead.converted_property_id;
  end if;

  if v_lead.version <> p_expected_version then
    raise exception 'LEAD_VERSION_CONFLICT' using errcode='40001';
  end if;
  if v_lead.archived_at is not null then
    raise exception 'ARCHIVED_LEAD_CANNOT_CONVERT' using errcode='22023';
  end if;
  if v_lead.status <> 'WON' then
    raise exception 'LEAD_MUST_BE_WON' using errcode='22023';
  end if;
  if v_lead.property_type is null then
    raise exception 'PROPERTY_TYPE_REQUIRED' using errcode='22023';
  end if;
  if v_lead.primary_responsible_user is distinct from v_user
     and not app_private.has_permission('property.assign') then
    raise exception 'PROPERTY_ASSIGN_REQUIRED' using errcode='42501';
  end if;

  v_any_address := nullif(trim(coalesce(v_lead.property_street,'')),'') is not null
    or nullif(trim(coalesce(v_lead.property_house_number,'')),'') is not null
    or nullif(trim(coalesce(v_lead.property_postal_code,'')),'') is not null
    or nullif(trim(coalesce(v_lead.property_city,'')),'') is not null;
  v_full_address := nullif(trim(coalesce(v_lead.property_street,'')),'') is not null
    and nullif(trim(coalesce(v_lead.property_house_number,'')),'') is not null
    and nullif(trim(coalesce(v_lead.property_postal_code,'')),'') is not null
    and nullif(trim(coalesce(v_lead.property_city,'')),'') is not null;

  if v_any_address and not v_full_address then
    raise exception 'LEAD_ADDRESS_INCOMPLETE' using errcode='22023';
  end if;

  select trim(c.first_name || ' ' || c.last_name)
  into v_contact_name
  from public.contacts c
  where c.id = v_lead.contact_id and c.archived_at is null;

  if v_contact_name is null then
    raise exception 'LEAD_CONTACT_NOT_AVAILABLE' using errcode='22023';
  end if;

  v_title := nullif(trim(coalesce(p_internal_title,'')),'');
  if v_title is null then
    v_title := concat('Verkäufer ', v_contact_name,
      case when nullif(trim(coalesce(v_lead.property_city,'')),'') is not null then ' · ' || trim(v_lead.property_city) else '' end,
      ' · ', v_lead.lead_number);
  end if;

  insert into public.properties(
    internal_title, property_type, transaction_type, purchase_price,
    living_area_sqm, plot_area_sqm, rooms, year_built, condition, tenancy_status,
    internal_notes, primary_responsible_user, created_by, updated_by
  ) values (
    v_title, v_lead.property_type, 'SALE', v_lead.price_expectation,
    v_lead.living_area_sqm, v_lead.plot_area_sqm, v_lead.rooms, v_lead.year_built,
    v_lead.property_condition,
    case when v_lead.occupancy_status in ('VACANT','OWNER_OCCUPIED','RENTED','PARTIALLY_RENTED','UNKNOWN') then v_lead.occupancy_status else null end,
    concat_ws(E'\n',
      nullif(v_lead.internal_notes,''),
      case when v_lead.estimated_market_value is not null then 'Bewerteter Marktwert aus Lead: ' || v_lead.estimated_market_value::text || ' EUR' end,
      case when v_lead.message is not null then 'Lead-Hintergrund: ' || v_lead.message end,
      'Konvertiert aus ' || v_lead.lead_number
    ),
    v_lead.primary_responsible_user, v_user, v_user
  ) returning id into v_property_id;

  if v_full_address then
    insert into public.property_addresses(
      property_id, street, house_number, postal_code, city, district, country,
      public_address_mode, created_by, updated_by
    ) values (
      v_property_id, trim(v_lead.property_street), trim(v_lead.property_house_number),
      trim(v_lead.property_postal_code), trim(v_lead.property_city),
      nullif(trim(coalesce(v_lead.property_district,'')),''), v_lead.property_country,
      'CITY_ONLY', v_user, v_user
    );
  end if;

  insert into public.property_owners(
    property_id, contact_id, ownership_percentage, ownership_type, primary_contact,
    valid_from, created_by, updated_by
  ) values (
    v_property_id, v_lead.contact_id, 100.00, 'SOLE_OWNER', true,
    current_date, v_user, v_user
  );

  perform set_config('app.lead_conversion','1',true);
  update public.leads
  set converted_property_id = v_property_id,
      converted_at = now(),
      converted_by = v_user
  where id = v_lead.id and version = p_expected_version;

  if not found then
    raise exception 'LEAD_VERSION_CONFLICT' using errcode='40001';
  end if;

  insert into public.activity_events(
    activity_type,title,description,actor_user_id,contact_id,property_id,lead_id,metadata
  ) values (
    'LEAD_CONVERTED',
    'Verkäufer-Lead in Immobilie übernommen',
    v_lead.lead_number || ' wurde in eine neue Immobilie überführt.',
    v_user,v_lead.contact_id,v_property_id,v_lead.id,
    jsonb_build_object('lead_number',v_lead.lead_number,'property_id',v_property_id)
  );

  return v_property_id;
end;
$$;

grant execute on function public.convert_lead_to_property(uuid,bigint,text) to authenticated;

create or replace function public.crm_global_search(p_query text, p_include_archived boolean default false)
returns table(entity_type text, entity_id uuid, reference text, title text, subtitle text, status text, updated_at timestamptz, archived boolean, version bigint)
language sql
stable
set search_path = public, pg_temp
as $$
  with term as (
    select '%' || trim(coalesce(p_query,'')) || '%' as pattern
  )
  select 'CONTACT'::text, c.id, c.contact_number,
         trim(c.first_name || ' ' || c.last_name),
         coalesce(c.email, c.mobile, c.phone, '—'),
         c.status, c.updated_at, (c.archived_at is not null), c.version
  from public.contacts c, term t
  where trim(coalesce(p_query,'')) <> ''
    and (p_include_archived or c.archived_at is null)
    and (
      c.contact_number ilike t.pattern or
      trim(c.first_name || ' ' || c.last_name) ilike t.pattern or
      trim(c.last_name || ' ' || c.first_name) ilike t.pattern or
      c.first_name ilike t.pattern or c.last_name ilike t.pattern or
      coalesce(c.email,'') ilike t.pattern or coalesce(c.mobile,'') ilike t.pattern or coalesce(c.phone,'') ilike t.pattern or
      exists (
        select 1 from public.contact_addresses a
        where a.contact_id=c.id and (p_include_archived or a.archived_at is null)
          and (trim(a.street || ' ' || coalesce(a.house_number,'')) ilike t.pattern or trim(a.postal_code || ' ' || a.city) ilike t.pattern or a.street ilike t.pattern or a.postal_code ilike t.pattern or a.city ilike t.pattern)
      )
    )
  union all
  select 'ORGANIZATION'::text, o.id, o.organization_number, o.name,
         coalesce(nullif(trim(coalesce(o.legal_form,'') || case when o.city is not null then ' · ' || o.city else '' end),''),coalesce(o.email,'—')),
         o.status, o.updated_at, (o.archived_at is not null), o.version
  from public.organizations o, term t
  where trim(coalesce(p_query,'')) <> ''
    and (p_include_archived or o.archived_at is null)
    and (o.organization_number ilike t.pattern or o.name ilike t.pattern or coalesce(o.email,'') ilike t.pattern or coalesce(o.phone,'') ilike t.pattern or coalesce(o.city,'') ilike t.pattern)
  union all
  select 'TASK'::text, ta.id, ta.task_number, ta.title,
         coalesce(ta.description,'—'), ta.status, ta.updated_at, (ta.archived_at is not null), ta.version
  from public.tasks ta, term t
  where trim(coalesce(p_query,'')) <> ''
    and (p_include_archived or ta.archived_at is null)
    and (ta.task_number ilike t.pattern or ta.title ilike t.pattern or coalesce(ta.description,'') ilike t.pattern)
  union all
  select 'PROPERTY'::text, p.id, p.property_number, p.internal_title,
         coalesce(
           (select trim(pa.postal_code || ' ' || pa.city || case when pa.district is not null then ' · ' || pa.district else '' end) from public.property_addresses pa where pa.property_id=p.id),
           case when p.transaction_type='SALE' then 'Verkauf' else 'Vermietung' end
         ),
         p.status, p.updated_at, (p.status='ARCHIVED'), p.version
  from public.properties p, term t
  where trim(coalesce(p_query,'')) <> ''
    and (p_include_archived or p.status <> 'ARCHIVED')
    and (
      p.property_number ilike t.pattern or p.internal_title ilike t.pattern or p.property_type ilike t.pattern or p.status ilike t.pattern or
      exists (
        select 1 from public.property_addresses pa
        where pa.property_id=p.id
          and (trim(pa.street || ' ' || pa.house_number) ilike t.pattern or trim(pa.postal_code || ' ' || pa.city) ilike t.pattern or coalesce(pa.district,'') ilike t.pattern)
      )
    )
  union all
  select 'LEAD'::text, l.id, l.lead_number,
         trim(c.first_name || ' ' || c.last_name),
         coalesce(nullif(trim(coalesce(l.property_postal_code,'') || ' ' || coalesce(l.property_city,'')),''), s.label, 'Verkäufer-Lead'),
         l.status, l.updated_at, (l.archived_at is not null), l.version
  from public.leads l
  join public.contacts c on c.id=l.contact_id
  left join public.lead_sources s on s.id=l.source_id
  cross join term t
  where trim(coalesce(p_query,'')) <> ''
    and (p_include_archived or l.archived_at is null)
    and (
      l.lead_number ilike t.pattern or
      trim(c.first_name || ' ' || c.last_name) ilike t.pattern or
      coalesce(c.email,'') ilike t.pattern or coalesce(c.phone,'') ilike t.pattern or coalesce(c.mobile,'') ilike t.pattern or
      coalesce(l.property_street,'') ilike t.pattern or coalesce(l.property_house_number,'') ilike t.pattern or
      coalesce(l.property_postal_code,'') ilike t.pattern or coalesce(l.property_city,'') ilike t.pattern or
      trim(coalesce(l.property_street,'') || ' ' || coalesce(l.property_house_number,'')) ilike t.pattern or
      trim(coalesce(l.property_postal_code,'') || ' ' || coalesce(l.property_city,'')) ilike t.pattern
    )
  order by updated_at desc
  limit 100;
$$;