create or replace function public.create_search_profile_from_inquiry(
  p_inquiry_id uuid,
  p_expected_inquiry_version bigint,
  p_contact_id uuid,
  p_title text,
  p_transaction_type text,
  p_property_types text[],
  p_min_price numeric,
  p_max_price numeric,
  p_min_living_area numeric,
  p_max_living_area numeric,
  p_min_plot_area numeric,
  p_min_rooms numeric,
  p_min_construction_year integer,
  p_move_in_from date,
  p_financing_status text,
  p_desired_features text[],
  p_internal_notes text,
  p_primary_responsible_user uuid,
  p_postal_code text,
  p_city text,
  p_district text,
  p_radius_km numeric
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_inquiry public.inquiries%rowtype;
  v_profile_id uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if not app_private.has_permission('inquiry.write') then
    raise exception 'INQUIRY_WRITE_REQUIRED' using errcode = '42501';
  end if;
  if not app_private.has_permission('search_profile.write') then
    raise exception 'SEARCH_PROFILE_WRITE_REQUIRED' using errcode = '42501';
  end if;

  select * into v_inquiry
  from public.inquiries
  where id = p_inquiry_id
  for update;

  if v_inquiry.id is null then
    raise exception 'INQUIRY_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_inquiry.contact_id is distinct from p_contact_id then
    raise exception 'INQUIRY_CONTACT_MISMATCH' using errcode = '22023';
  end if;
  if v_inquiry.archived_at is not null then
    raise exception 'ARCHIVED_INQUIRY_CANNOT_CREATE_SEARCH_PROFILE' using errcode = '22023';
  end if;

  if v_inquiry.search_profile_id is not null then
    raise exception 'INQUIRY_ALREADY_HAS_SEARCH_PROFILE' using errcode = '23505';
  end if;
  if v_inquiry.version is distinct from p_expected_inquiry_version then
    raise exception 'INQUIRY_VERSION_CONFLICT' using errcode = '40001';
  end if;

  v_profile_id := public.create_search_profile(
    p_contact_id, p_title, p_transaction_type, p_property_types,
    p_min_price, p_max_price, p_min_living_area, p_max_living_area,
    p_min_plot_area, p_min_rooms, p_min_construction_year, p_move_in_from,
    p_financing_status, p_desired_features, p_internal_notes,
    p_primary_responsible_user, p_postal_code, p_city, p_district, p_radius_km
  );

  update public.inquiries
  set search_profile_id = v_profile_id
  where id = v_inquiry.id
    and version = p_expected_inquiry_version
    and search_profile_id is null;

  if not found then
    raise exception 'INQUIRY_VERSION_CONFLICT' using errcode = '40001';
  end if;

  return v_profile_id;
end;
$$;

revoke execute on function public.create_search_profile_from_inquiry(uuid,bigint,uuid,text,text,text[],numeric,numeric,numeric,numeric,numeric,numeric,integer,date,text,text[],text,uuid,text,text,text,numeric) from public, anon;
grant execute on function public.create_search_profile_from_inquiry(uuid,bigint,uuid,text,text,text[],numeric,numeric,numeric,numeric,numeric,numeric,integer,date,text,text[],text,uuid,text,text,text,numeric) to authenticated, service_role;
