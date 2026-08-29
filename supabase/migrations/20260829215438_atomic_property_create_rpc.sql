create or replace function public.create_property_with_address(
  p_internal_title text,
  p_property_type text,
  p_transaction_type text,
  p_purchase_price numeric default null,
  p_rent_cold numeric default null,
  p_living_area_sqm numeric default null,
  p_rooms numeric default null,
  p_street text default null,
  p_house_number text default null,
  p_postal_code text default null,
  p_city text default null,
  p_district text default null,
  p_public_address_mode text default 'CITY_ONLY'
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_property_id uuid;
  v_any_address boolean;
  v_full_address boolean;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if nullif(trim(coalesce(p_internal_title,'')),'') is null then raise exception 'internal title is required'; end if;
  v_any_address := nullif(trim(coalesce(p_street,'')),'') is not null or nullif(trim(coalesce(p_house_number,'')),'') is not null or nullif(trim(coalesce(p_postal_code,'')),'') is not null or nullif(trim(coalesce(p_city,'')),'') is not null;
  v_full_address := nullif(trim(coalesce(p_street,'')),'') is not null and nullif(trim(coalesce(p_house_number,'')),'') is not null and nullif(trim(coalesce(p_postal_code,'')),'') is not null and nullif(trim(coalesce(p_city,'')),'') is not null;
  if v_any_address and not v_full_address then raise exception 'address must be complete when supplied'; end if;

  insert into public.properties(internal_title,property_type,transaction_type,purchase_price,rent_cold,living_area_sqm,rooms,primary_responsible_user,created_by,updated_by)
  values(trim(p_internal_title),p_property_type,p_transaction_type,p_purchase_price,p_rent_cold,p_living_area_sqm,p_rooms,v_user,v_user,v_user)
  returning id into v_property_id;

  if v_full_address then
    insert into public.property_addresses(property_id,street,house_number,postal_code,city,district,public_address_mode,created_by,updated_by)
    values(v_property_id,trim(p_street),trim(p_house_number),trim(p_postal_code),trim(p_city),nullif(trim(coalesce(p_district,'')),''),p_public_address_mode,v_user,v_user);
  end if;
  return v_property_id;
end;
$$;
revoke all on function public.create_property_with_address(text,text,text,numeric,numeric,numeric,numeric,text,text,text,text,text,text) from public, anon;
grant execute on function public.create_property_with_address(text,text,text,numeric,numeric,numeric,numeric,text,text,text,text,text,text) to authenticated;