-- Thema 9 (Maklerpraxis): Pflichtangaben und Nachweise vor Veroeffentlichung.
-- Die Vermarktungsreife-Pruefung kannte die Energieangaben bisher nur als
-- groben Checklistenpunkt. Ab hier sind sie eine harte Bedingung: ohne
-- vollstaendige Angaben oder eine ausdruecklich begruendete Ausnahme laesst
-- sich ein Objekt weder in die Vermarktung ueberfuehren noch veroeffentlichen.
-- Das System prueft die Vollstaendigkeit der Erfassung. Es beurteilt nicht, ob
-- eine Ausnahme tatsaechlich vorliegt.

-- ---------------------------------------------------------------------------
-- Energieausweis: Ausstellung und begruendete Ausnahme
-- ---------------------------------------------------------------------------
alter table public.property_energy_data
  add column if not exists certificate_issued_on date,
  add column if not exists certificate_registration_number text,
  add column if not exists exemption_reason text,
  add column if not exists exemption_note text,
  add column if not exists exemption_confirmed_on date,
  add column if not exists exemption_confirmed_by uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='property_energy_data_exemption_confirmed_by_fkey') then
    alter table public.property_energy_data
      add constraint property_energy_data_exemption_confirmed_by_fkey
      foreign key (exemption_confirmed_by) references public.profiles(user_id);
  end if;
  if not exists (select 1 from pg_constraint where conname='property_energy_data_exemption_reason_check') then
    alter table public.property_energy_data
      add constraint property_energy_data_exemption_reason_check check (
        exemption_reason is null or exemption_reason in
          ('MONUMENT_PROTECTION','SMALL_BUILDING','NOT_REGULARLY_HEATED','DEMOLITION_PLANNED','OTHER')
      );
  end if;
  if not exists (select 1 from pg_constraint where conname='property_energy_data_exemption_documented_check') then
    alter table public.property_energy_data
      add constraint property_energy_data_exemption_documented_check check (
        exemption_reason is null
        or (coalesce(btrim(exemption_note),'') <> '' and exemption_confirmed_on is not null and exemption_confirmed_by is not null)
      );
  end if;
  if not exists (select 1 from pg_constraint where conname='property_energy_data_exemption_exclusive_check') then
    alter table public.property_energy_data
      add constraint property_energy_data_exemption_exclusive_check check (
        exemption_reason is null or certificate_present = false
      );
  end if;
  if not exists (select 1 from pg_constraint where conname='property_energy_data_issue_before_validity_check') then
    alter table public.property_energy_data
      add constraint property_energy_data_issue_before_validity_check check (
        certificate_issued_on is null or valid_until is null or valid_until >= certificate_issued_on
      );
  end if;
end
$$;

comment on column public.property_energy_data.exemption_reason is 'Ausnahmegrund, warum kein Energieausweis vorliegt. Reine Erfassung; ob die Ausnahme tatsaechlich greift, entscheidet nicht das System.';
comment on column public.property_energy_data.exemption_note is 'Begruendung im Klartext. Ohne sie wird die Ausnahme nicht akzeptiert.';

create index if not exists property_energy_data_exemption_confirmed_by_idx on public.property_energy_data(exemption_confirmed_by);

-- ---------------------------------------------------------------------------
-- Nachweis: Vorlage und Uebergabe des Energieausweises
-- ---------------------------------------------------------------------------
create table if not exists public.energy_certificate_presentations (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null constraint energy_certificate_presentations_property_id_fkey references public.properties(id) on delete cascade,
  contact_id uuid not null constraint energy_certificate_presentations_contact_id_fkey references public.contacts(id) on delete restrict,
  viewing_id uuid constraint energy_certificate_presentations_viewing_id_fkey references public.viewings(id) on delete set null,
  closing_id uuid constraint energy_certificate_presentations_closing_id_fkey references public.sale_closings(id) on delete set null,

  occasion text not null check (occasion in ('VIEWING','CONTRACT_CONCLUSION','OTHER')),
  presented_on date not null,
  presentation_form text not null check (presentation_form in ('IN_PERSON','COPY_HANDED','EMAIL','PORTAL','EXPOSE','OTHER')),
  handed_over boolean not null default false,
  note text,

  created_at timestamptz not null default now(),
  created_by uuid constraint energy_certificate_presentations_created_by_fkey references public.profiles(user_id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid constraint energy_certificate_presentations_updated_by_fkey references public.profiles(user_id) default auth.uid(),
  version bigint not null default 1 check (version > 0),

  constraint energy_certificate_presentations_handover_required_check check (
    occasion <> 'CONTRACT_CONCLUSION' or handed_over
  ),
  constraint energy_certificate_presentations_viewing_required_check check (
    occasion <> 'VIEWING' or viewing_id is not null
  )
);

comment on table public.energy_certificate_presentations is 'Nachweis, wann und in welcher Form der Energieausweis einem Interessenten vorgelegt und wann er uebergeben wurde. Reine Dokumentation; das System bewertet nicht, ob damit eine Pflicht erfuellt ist.';

create index if not exists energy_certificate_presentations_property_idx on public.energy_certificate_presentations(property_id, occasion);
create index if not exists energy_certificate_presentations_contact_idx on public.energy_certificate_presentations(contact_id);
create index if not exists energy_certificate_presentations_viewing_idx on public.energy_certificate_presentations(viewing_id);
create index if not exists energy_certificate_presentations_closing_idx on public.energy_certificate_presentations(closing_id);
create index if not exists energy_certificate_presentations_created_by_idx on public.energy_certificate_presentations(created_by);
create index if not exists energy_certificate_presentations_updated_by_idx on public.energy_certificate_presentations(updated_by);

create or replace function app_private.validate_energy_certificate_presentation()
returns trigger
language plpgsql
set search_path to 'app_private','public','pg_temp'
as $function$
begin
  if not exists (select 1 from public.properties p where p.id = new.property_id) then
    raise exception 'PRESENTATION_PROPERTY_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.contacts c where c.id = new.contact_id) then
    raise exception 'PRESENTATION_CONTACT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if new.presented_on > current_date then
    raise exception 'PRESENTATION_DATE_IN_FUTURE' using errcode = '22023';
  end if;
  if new.viewing_id is not null
     and not exists (select 1 from public.viewings v where v.id = new.viewing_id and v.property_id = new.property_id) then
    raise exception 'PRESENTATION_VIEWING_MISMATCH' using errcode = '22023';
  end if;
  if new.closing_id is not null
     and not exists (select 1 from public.sale_closings s where s.id = new.closing_id and s.property_id = new.property_id) then
    raise exception 'PRESENTATION_CLOSING_MISMATCH' using errcode = '22023';
  end if;
  if new.occasion = 'CONTRACT_CONCLUSION' and new.closing_id is null then
    raise exception 'PRESENTATION_CLOSING_REQUIRED' using errcode = '22023';
  end if;
  return new;
end;
$function$;

create or replace function app_private.audit_energy_certificate_presentation()
returns trigger
language plpgsql
security definer
set search_path to 'app_private','public','pg_temp'
as $function$
declare
  v_row public.energy_certificate_presentations;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;
  insert into public.audit_events(entity_type, entity_id, action, actor_user_id, actor_display_name_snapshot, metadata)
  select 'PROPERTY', v_row.property_id, 'UPDATE', auth.uid(),
         coalesce((select display_name from public.profiles where user_id = auth.uid()), 'System'),
         jsonb_build_object('change_type','ENERGY_CERTIFICATE_PRESENTATION','operation',tg_op);
  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

alter table public.energy_certificate_presentations enable row level security;

drop policy if exists energy_certificate_presentations_select on public.energy_certificate_presentations;
create policy energy_certificate_presentations_select on public.energy_certificate_presentations for select to authenticated
using ((select app_private.has_permission('property.read')));

drop policy if exists energy_certificate_presentations_insert on public.energy_certificate_presentations;
create policy energy_certificate_presentations_insert on public.energy_certificate_presentations for insert to authenticated
with check ((select app_private.has_permission('property.write')) and created_by = (select auth.uid()));

drop policy if exists energy_certificate_presentations_update on public.energy_certificate_presentations;
create policy energy_certificate_presentations_update on public.energy_certificate_presentations for update to authenticated
using ((select app_private.has_permission('property.write')))
with check ((select app_private.has_permission('property.write')));

drop trigger if exists energy_certificate_presentations_10_validate on public.energy_certificate_presentations;
create trigger energy_certificate_presentations_10_validate before insert or update on public.energy_certificate_presentations
for each row execute function app_private.validate_energy_certificate_presentation();

drop trigger if exists energy_certificate_presentations_40_metadata on public.energy_certificate_presentations;
create trigger energy_certificate_presentations_40_metadata before update on public.energy_certificate_presentations
for each row execute function app_private.set_standard_update_metadata();

drop trigger if exists energy_certificate_presentations_90_audit on public.energy_certificate_presentations;
create trigger energy_certificate_presentations_90_audit after insert or update or delete on public.energy_certificate_presentations
for each row execute function app_private.audit_energy_certificate_presentation();

grant select, insert, update on public.energy_certificate_presentations to authenticated;

-- ---------------------------------------------------------------------------
-- Die Luecken in den Pflichtangaben, einmal formuliert und ueberall verwendet
-- ---------------------------------------------------------------------------
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

  -- Objekte ohne Gebaeude tragen keine Angaben aus dem Energieausweis.
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
      v_gaps := array_append(v_gaps, 'Die Ausnahme vom Energieausweis ist ohne Begruendung erfasst.');
    end if;
    if v_energy.exemption_confirmed_on is null or v_energy.exemption_confirmed_by is null then
      v_gaps := array_append(v_gaps, 'Die Ausnahme vom Energieausweis ist nicht bestaetigt; Datum oder Person fehlen.');
    end if;
    return v_gaps;
  end if;

  if not v_energy.certificate_present then
    return array['Es ist weder ein Energieausweis hinterlegt noch eine begruendete Ausnahme erfasst.'];
  end if;

  if v_energy.certificate_type is null then
    v_gaps := array_append(v_gaps, 'Die Art des Energieausweises fehlt.');
  elsif v_energy.certificate_type = 'OTHER' then
    v_gaps := array_append(v_gaps, 'Die Art des Energieausweises ist als Sonstige erfasst; fuer eine Anzeige wird Bedarf oder Verbrauch benoetigt.');
  end if;
  if v_energy.energy_value_kwh is null then
    v_gaps := array_append(v_gaps, 'Der Endenergiewert fehlt.');
  end if;
  if coalesce(btrim(v_energy.energy_source),'') = '' then
    v_gaps := array_append(v_gaps, 'Der wesentliche Energietraeger der Heizung fehlt.');
  end if;
  if v_energy.building_year is null then
    v_gaps := array_append(v_gaps, 'Das Baujahr laut Energieausweis fehlt.');
  end if;
  if v_residential and v_energy.efficiency_class is null then
    v_gaps := array_append(v_gaps, 'Die Energieeffizienzklasse fehlt.');
  end if;
  if v_energy.valid_until is null then
    v_gaps := array_append(v_gaps, 'Das Gueltigkeitsdatum des Energieausweises fehlt.');
  elsif v_energy.valid_until < current_date then
    v_gaps := array_append(v_gaps, 'Der Energieausweis ist am ' || to_char(v_energy.valid_until,'DD.MM.YYYY') || ' abgelaufen.');
  end if;

  return v_gaps;
end;
$function$;

comment on function public.property_disclosure_gaps(uuid) is 'Liefert die fehlenden Pflichtangaben eines Objekts im Klartext. Leeres Array bedeutet vollstaendig erfasst, nicht rechtlich geprueft.';

revoke all on function public.property_disclosure_gaps(uuid) from public;
revoke execute on function public.property_disclosure_gaps(uuid) from anon;
grant execute on function public.property_disclosure_gaps(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Sperre 1: Uebergang PREPARATION -> MARKETING
-- ---------------------------------------------------------------------------
create or replace function app_private.enforce_property_sensitive_permissions()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
declare
  v_missing text[] := '{}'::text[];
  v_open_checklist text;
  v_disclosure_gaps text[];
begin
  if old.primary_responsible_user is distinct from new.primary_responsible_user
     and not app_private.has_permission('property.assign') then
    raise exception 'PROPERTY_ASSIGN_REQUIRED' using errcode = '42501';
  end if;

  if (new.status = 'ARCHIVED' or old.status = 'ARCHIVED')
     and old.status is distinct from new.status
     and not app_private.has_permission('property.archive') then
    raise exception 'PROPERTY_ARCHIVE_REQUIRED' using errcode = '42501';
  end if;

  if old.status = 'PREPARATION' and new.status = 'MARKETING' then
    if not app_private.has_permission('property.publish') then
      raise exception 'PROPERTY_PUBLISH_REQUIRED' using errcode = '42501';
    end if;

    if new.primary_responsible_user is null then
      v_missing := array_append(v_missing, 'verantwortlicher Benutzer');
    end if;

    if not exists (
      select 1
      from public.property_owners owner
      where owner.property_id = new.id
        and coalesce(owner.valid_from, current_date) <= current_date
        and (owner.valid_until is null or owner.valid_until >= current_date)
    ) then
      v_missing := array_append(v_missing, 'aktiver Eigentümer');
    end if;

    if not exists (
      select 1
      from public.property_addresses address
      where address.property_id = new.id
        and nullif(trim(address.street), '') is not null
        and nullif(trim(address.house_number), '') is not null
        and nullif(trim(address.postal_code), '') is not null
        and nullif(trim(address.city), '') is not null
    ) then
      v_missing := array_append(v_missing, 'vollständige Objektadresse');
    end if;

    if new.transaction_type = 'SALE' and coalesce(new.purchase_price, 0) <= 0 then
      v_missing := array_append(v_missing, 'positiver Kaufpreis');
    elsif new.transaction_type = 'RENT' and coalesce(new.rent_cold, 0) <= 0 then
      v_missing := array_append(v_missing, 'positive Kaltmiete');
    end if;

    select string_agg(item.title, ', ' order by item.category, item.title)
      into v_open_checklist
    from public.property_marketing_checklist_items item
    where item.property_id = new.id
      and item.required
      and item.status not in ('DONE', 'WAIVED');

    if v_open_checklist is not null then
      v_missing := array_append(v_missing, 'offene Pflicht-Checkliste: ' || v_open_checklist);
    end if;

    v_disclosure_gaps := public.property_disclosure_gaps(new.id);
    if cardinality(v_disclosure_gaps) > 0 then
      v_missing := array_append(v_missing, 'Pflichtangaben: ' || array_to_string(v_disclosure_gaps, ' '));
    end if;

    if cardinality(v_missing) > 0 then
      raise exception 'PROPERTY_MARKETING_NOT_READY'
        using errcode = '22023', detail = array_to_string(v_missing, '; ');
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function app_private.enforce_property_sensitive_permissions() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Sperre 2: Veroeffentlichung. Der Snapshot fuehrt die Pflichtangaben mit.
-- ---------------------------------------------------------------------------
create or replace function app_private.build_property_publication_snapshot(p_publication public.property_publications)
returns jsonb
language plpgsql
security definer
set search_path = app_private, public, pg_temp
as $function$
declare
  v_property public.properties%rowtype;
  v_address public.property_addresses%rowtype;
  v_energy public.property_energy_data%rowtype;
  v_address_json jsonb;
  v_features jsonb;
  v_media jsonb;
  v_media_count integer;
  v_gaps text[];
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

  -- Pflichtangaben. Ohne sie entsteht keine Veroeffentlichungsversion.
  v_gaps := public.property_disclosure_gaps(v_property.id);
  if cardinality(v_gaps) > 0 then
    raise exception 'PUBLIC_MANDATORY_DISCLOSURES_MISSING'
      using errcode='22023', detail = array_to_string(v_gaps, ' ');
  end if;

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
    'schema_version',4,
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
    'energy',case when v_energy.id is null then null else jsonb_build_object(
      'certificate_present',v_energy.certificate_present,
      'certificate_type',v_energy.certificate_type,
      'energy_value_kwh',v_energy.energy_value_kwh,
      'efficiency_class',v_energy.efficiency_class,
      'energy_source',v_energy.energy_source,
      'building_year',v_energy.building_year,
      'valid_until',v_energy.valid_until,
      'issued_on',v_energy.certificate_issued_on,
      'registration_number',v_energy.certificate_registration_number,
      'exemption_reason',v_energy.exemption_reason,
      'exemption_note',v_energy.exemption_note
    ) end,
    'media',v_media,
    'generated_at',now()
  );
end;
$function$;
revoke all on function app_private.build_property_publication_snapshot(public.property_publications) from public,anon,authenticated;
