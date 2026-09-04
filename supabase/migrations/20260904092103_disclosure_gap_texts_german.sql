-- Die Lückentexte erscheinen wörtlich in der Oberfläche, in der Objektakte, in
-- der Veröffentlichungsakte und in der Begründung beider Sperren. Sie waren
-- ohne Umlaute geschrieben, weil sie zunächst wie interne Fehlercodes behandelt
-- wurden. Sie sind aber Text, den ein Makler liest.
create or replace function public.property_disclosure_gaps(p_property_id uuid)
returns text[]
language plpgsql
stable
security invoker
set search_path to 'public','pg_temp'
as $function$
declare
  v_property public.properties%rowtype;
  v_energy public.property_energy_data%rowtype;
  v_gaps text[] := '{}'::text[];
  v_residential boolean;
begin
  select * into v_property from public.properties where id = p_property_id;
  if v_property.id is null then
    return array['Die Immobilie wurde nicht gefunden.'];
  end if;

  -- Objekte ohne Gebäude tragen keine Angaben aus dem Energieausweis.
  if v_property.property_type in ('LAND','GARAGE','PARKING_SPACE') then
    return v_gaps;
  end if;

  v_residential := v_property.property_type in
    ('DETACHED_HOUSE','SEMI_DETACHED_HOUSE','TERRACED_HOUSE','APARTMENT_BUILDING','APARTMENT','PENTHOUSE','MAISONETTE');

  select * into v_energy from public.property_energy_data where property_id = p_property_id;

  if v_energy.id is null then
    return array['Zu diesem Objekt sind keine Energieausweisdaten erfasst.'];
  end if;

  if v_energy.exemption_reason is not null then
    if coalesce(btrim(v_energy.exemption_note),'') = '' then
      v_gaps := array_append(v_gaps, 'Die Ausnahme vom Energieausweis ist ohne Begründung erfasst.');
    end if;
    if v_energy.exemption_confirmed_on is null or v_energy.exemption_confirmed_by is null then
      v_gaps := array_append(v_gaps, 'Die Ausnahme vom Energieausweis ist nicht bestätigt; Datum oder Person fehlen.');
    end if;
    return v_gaps;
  end if;

  if not v_energy.certificate_present then
    return array['Es ist weder ein Energieausweis hinterlegt noch eine begründete Ausnahme erfasst.'];
  end if;

  if v_energy.certificate_type is null then
    v_gaps := array_append(v_gaps, 'Die Art des Energieausweises fehlt.');
  elsif v_energy.certificate_type = 'OTHER' then
    v_gaps := array_append(v_gaps, 'Die Art des Energieausweises ist als Sonstige erfasst; für eine Anzeige wird Bedarf oder Verbrauch benötigt.');
  end if;
  if v_energy.energy_value_kwh is null then
    v_gaps := array_append(v_gaps, 'Der Endenergiewert fehlt.');
  end if;
  if coalesce(btrim(v_energy.energy_source),'') = '' then
    v_gaps := array_append(v_gaps, 'Der wesentliche Energieträger der Heizung fehlt.');
  end if;
  if v_energy.building_year is null then
    v_gaps := array_append(v_gaps, 'Das Baujahr laut Energieausweis fehlt.');
  end if;
  if v_residential and v_energy.efficiency_class is null then
    v_gaps := array_append(v_gaps, 'Die Energieeffizienzklasse fehlt.');
  end if;
  if v_energy.valid_until is null then
    v_gaps := array_append(v_gaps, 'Das Gültigkeitsdatum des Energieausweises fehlt.');
  elsif v_energy.valid_until < current_date then
    v_gaps := array_append(v_gaps, 'Der Energieausweis ist am ' || to_char(v_energy.valid_until,'DD.MM.YYYY') || ' abgelaufen.');
  end if;

  return v_gaps;
end;
$function$;

revoke all on function public.property_disclosure_gaps(uuid) from public;
revoke execute on function public.property_disclosure_gaps(uuid) from anon;
grant execute on function public.property_disclosure_gaps(uuid) to authenticated;
