-- Thema 3 (Maklerpraxis): Der Abschlussvorgang muss vor der Beurkundung warnen koennen,
-- ohne dass die Sachbearbeitung die geldwaescherechtlichen Unterlagen selbst sehen darf.
-- Diese Funktion gibt deshalb ausschliesslich Zaehlstaende und Ja/Nein-Angaben zurueck,
-- keine Personendaten, keine Ausweisdaten und keine Notizen.
create or replace function public.gwg_closing_identification_status(p_closing_id uuid)
returns table(
  has_case boolean,
  case_archived boolean,
  risk_assessed boolean,
  seller_identified integer,
  buyer_identified integer,
  buyer_contact_identified boolean,
  beneficial_owner_documented boolean,
  source_of_funds_documented boolean
)
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_property uuid;
  v_buyer uuid;
  v_case public.gwg_cases%rowtype;
begin
  if not app_private.has_permission('closing.read') then
    raise exception 'CLOSING_READ_REQUIRED' using errcode='42501';
  end if;
  select sc.property_id, sc.buyer_contact_id into v_property, v_buyer
  from public.sale_closings sc where sc.id = p_closing_id;
  if v_property is null then return; end if;

  select * into v_case from public.gwg_cases c
  where c.property_id = v_property and c.archived_at is null
  order by c.created_at desc limit 1;

  has_case := v_case.id is not null;
  case_archived := false;
  risk_assessed := v_case.risk_level is not null;
  source_of_funds_documented := v_case.source_of_funds_documented_on is not null;
  seller_identified := coalesce((
    select count(*)::int from public.gwg_identifications i
    where i.gwg_case_id = v_case.id and i.party_role = 'SELLER' and i.identified_on is not null), 0);
  buyer_identified := coalesce((
    select count(*)::int from public.gwg_identifications i
    where i.gwg_case_id = v_case.id and i.party_role = 'BUYER' and i.identified_on is not null), 0);
  buyer_contact_identified := coalesce((
    select true from public.gwg_identifications i
    where i.gwg_case_id = v_case.id and i.contact_id = v_buyer and i.identified_on is not null limit 1), false);
  beneficial_owner_documented := coalesce((
    select true from public.gwg_identifications i
    where i.gwg_case_id = v_case.id and i.party_role = 'BENEFICIAL_OWNER' limit 1), false);
  return next;
end;
$function$;

comment on function public.gwg_closing_identification_status(uuid) is 'Gibt fuer einen Abschlussvorgang nur den Erfassungsstand der Identifizierung zurueck. Bewusst ohne Personendaten, damit die Warnung auch ohne Leserecht auf die Geldwaescheakte angezeigt werden kann.';

revoke all on function public.gwg_closing_identification_status(uuid) from public;
grant execute on function public.gwg_closing_identification_status(uuid) to authenticated;
