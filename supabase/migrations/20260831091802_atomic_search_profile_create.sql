create or replace function public.create_search_profile(
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
) returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_profile_id uuid;
begin
  if not app_private.has_permission('search_profile.write') then
    raise exception 'missing permission: search_profile.write';
  end if;
  if p_contact_id is null then raise exception 'contact required'; end if;
  if nullif(btrim(p_title),'') is null then raise exception 'title required'; end if;

  insert into public.search_profiles(
    contact_id,title,status,transaction_type,property_types,min_price,max_price,min_living_area,max_living_area,
    min_plot_area,min_rooms,min_construction_year,move_in_from,financing_status,desired_features,internal_notes,
    primary_responsible_user,created_by,updated_by
  ) values (
    p_contact_id,btrim(p_title),'ACTIVE',coalesce(nullif(p_transaction_type,''),'BUY'),coalesce(p_property_types,'{}'),
    p_min_price,p_max_price,p_min_living_area,p_max_living_area,p_min_plot_area,p_min_rooms,p_min_construction_year,
    p_move_in_from,nullif(p_financing_status,''),coalesce(p_desired_features,'{}'),nullif(btrim(p_internal_notes),''),
    coalesce(p_primary_responsible_user,auth.uid()),auth.uid(),auth.uid()
  ) returning id into v_profile_id;

  if nullif(btrim(p_city),'') is not null then
    insert into public.search_profile_locations(search_profile_id,postal_code,city,district,radius_km,created_by)
    values(v_profile_id,nullif(btrim(p_postal_code),''),btrim(p_city),nullif(btrim(p_district),''),p_radius_km,auth.uid());
  end if;

  return v_profile_id;
end;
$$;

grant execute on function public.create_search_profile(uuid,text,text,text[],numeric,numeric,numeric,numeric,numeric,numeric,integer,date,text,text[],text,uuid,text,text,text,numeric) to authenticated;