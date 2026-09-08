-- Zwei weitere Wege von der Webseite ins CRM: die Bewertungsanfrage und der
-- Suchauftrag.
--
-- Beide folgen dem Muster, das der Verkaufsstrategie-Check schon benutzt:
-- die Edge-Funktion website-inquiry nimmt die Eingabe mit der Dienstrolle
-- entgegen, prueft Honigtopf, Rate-Limit und Dubletten, und ruft dann eine
-- SECURITY-DEFINER-Funktion, die genau einen Datensatz anlegt. Die Webseite
-- selbst hat keinen Schreibzugriff auf die Fachtabellen.

-- 1. Die Lead-Funktion war auf den Verkaufsstrategie-Check festgelegt: sie
--    schrieb 'Verkaufsfertig-Check · Website' fest in source_detail. Die
--    Bewertungsanfrage ist derselbe Vorgang mit anderer Herkunft, deshalb
--    wird die Herkunft jetzt uebergeben statt eingebaut. Der Aufrufer ist
--    ausschliesslich die Edge-Funktion, die im selben Zug umgestellt wird.
drop function if exists public.create_public_seller_check_lead(uuid, uuid, text, text, text, text, text, text, text, text, text);

create function public.create_public_seller_check_lead(
  p_contact_id uuid,
  p_responsible_user uuid,
  p_submission_key text,
  p_source_url text,
  p_message text,
  p_property_postal_code text,
  p_property_city text,
  p_property_type text,
  p_property_condition text,
  p_desired_sale_horizon text,
  p_consent_text_version text,
  p_source_detail text
)
returns table(out_lead_id uuid, out_lead_number text, out_deduplicated boolean)
language plpgsql
security definer
set search_path to 'public', 'app_private', 'pg_temp'
as $function$
declare
  v_source_id uuid;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if p_contact_id is null
     or p_responsible_user is null
     or length(trim(coalesce(p_submission_key, ''))) < 16
     or nullif(trim(coalesce(p_message, '')), '') is null
     or nullif(trim(coalesce(p_consent_text_version, '')), '') is null
     or nullif(trim(coalesce(p_source_detail, '')), '') is null then
    raise exception 'INVALID_SELLER_CHECK_INTAKE' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.user_id = p_responsible_user and p.status = 'ACTIVE'
  ) then
    raise exception 'RESPONSIBLE_USER_NOT_ACTIVE' using errcode = '22023';
  end if;
  return query
  select l.id, l.lead_number, true
  from public.leads l where l.website_submission_key = p_submission_key;
  if found then return; end if;

  select id into v_source_id from public.lead_sources where key = 'WEBSITE' and active;
  if v_source_id is null then
    raise exception 'WEBSITE_LEAD_SOURCE_NOT_AVAILABLE' using errcode = 'P0002';
  end if;
  perform set_config('app.website_seller_check_intake', '1', true);
  return query
  insert into public.leads(
    contact_id, status, source_id, source_detail, primary_responsible_user,
    property_postal_code, property_city, property_type, property_condition,
    desired_sale_horizon, message, consent_given, consent_at,
    consent_text_version, website_submission_key, public_source_url,
    created_by, updated_by
  ) values (
    p_contact_id, 'NEW', v_source_id, trim(p_source_detail), p_responsible_user,
    nullif(trim(p_property_postal_code), ''), nullif(trim(p_property_city), ''),
    nullif(trim(p_property_type), ''), nullif(trim(p_property_condition), ''),
    nullif(trim(p_desired_sale_horizon), ''), trim(p_message), true, now(),
    p_consent_text_version, trim(p_submission_key), nullif(trim(p_source_url), ''),
    null, null
  )
  returning id, lead_number, false;
exception
  when unique_violation then
    return query
    select l.id, l.lead_number, true
    from public.leads l where l.website_submission_key = p_submission_key;
end;
$function$;

revoke all on function public.create_public_seller_check_lead(uuid, uuid, text, text, text, text, text, text, text, text, text, text) from public, anon, authenticated;

-- 2. Suchprofile aus der Webseite brauchen dasselbe, was Leads und Anfragen
--    schon haben: einen Schluessel gegen Doppeleinsendungen, die Herkunft und
--    den Nachweis der Einwilligung. Ohne den Schluessel legt ein zweiter Klick
--    auf "Absenden" ein zweites Suchprofil an.
alter table public.search_profiles
  add column if not exists website_submission_key text,
  add column if not exists public_source_url text,
  add column if not exists consent_given_at timestamptz,
  add column if not exists consent_text_version text;

create unique index if not exists search_profiles_website_submission_key_idx
  on public.search_profiles (website_submission_key)
  where website_submission_key is not null;

comment on column public.search_profiles.website_submission_key is
  'Schluessel der Website-Einsendung. Verhindert, dass ein zweiter Klick ein zweites Suchprofil anlegt.';

-- 3. Die Aufnahme selbst.
--
--    search_profiles traegt einen aufgeschobenen Auslöser, der zu jedem neuen
--    Suchprofil mindestens eine Ortsangabe verlangt. Das Formular muss also
--    Postleitzahl oder Ort abfragen -- hier wird beides mitgegeben und der Ort
--    im selben Vorgang angelegt, sonst schlaegt der Commit fehl.
create or replace function public.create_public_search_profile(
  p_contact_id uuid,
  p_responsible_user uuid,
  p_submission_key text,
  p_source_url text,
  p_transaction_type text,
  p_property_types text[],
  p_max_price numeric,
  p_min_rooms numeric,
  p_min_living_area numeric,
  p_postal_code text,
  p_city text,
  p_message text,
  p_consent_text_version text
)
returns table(out_profile_id uuid, out_profile_number text, out_deduplicated boolean)
language plpgsql
security definer
set search_path to 'public', 'app_private', 'pg_temp'
as $function$
declare
  v_id uuid;
  v_nummer text;
  v_titel text;
  v_notiz text;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if p_contact_id is null
     or p_responsible_user is null
     or length(trim(coalesce(p_submission_key, ''))) < 16
     or p_transaction_type not in ('BUY', 'RENT')
     or coalesce(array_length(p_property_types, 1), 0) = 0
     or nullif(trim(coalesce(p_consent_text_version, '')), '') is null
     or (nullif(trim(coalesce(p_postal_code, '')), '') is null
         and nullif(trim(coalesce(p_city, '')), '') is null) then
    raise exception 'INVALID_SEARCH_PROFILE_INTAKE' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.user_id = p_responsible_user and p.status = 'ACTIVE'
  ) then
    raise exception 'RESPONSIBLE_USER_NOT_ACTIVE' using errcode = '22023';
  end if;

  select sp.id, sp.search_profile_number into v_id, v_nummer
    from public.search_profiles sp
   where sp.website_submission_key = trim(p_submission_key);
  if v_id is not null then
    out_profile_id := v_id; out_profile_number := v_nummer; out_deduplicated := true;
    return next; return;
  end if;

  v_titel := 'Suchauftrag über die Webseite · '
          || coalesce(nullif(trim(p_city), ''), nullif(trim(p_postal_code), ''), 'ohne Ortsangabe');

  -- Die Nachricht der suchenden Person landet sichtbar gekennzeichnet in den
  -- internen Notizen. Ein eigenes Feld dafuer gibt es nicht, und eine Nachricht
  -- ohne Kennzeichnung liesse sich spaeter nicht mehr von einer internen Notiz
  -- unterscheiden.
  v_notiz := nullif(trim(coalesce(p_message, '')), '');
  if v_notiz is not null then
    v_notiz := 'Nachricht aus dem Suchauftrag auf der Webseite:' || chr(10) || v_notiz;
  end if;

  insert into public.search_profiles(
    contact_id, title, status, transaction_type, property_types,
    max_price, min_rooms, min_living_area, internal_notes,
    primary_responsible_user, website_submission_key, public_source_url,
    consent_given_at, consent_text_version, created_by, updated_by
  ) values (
    p_contact_id, v_titel, 'ACTIVE', p_transaction_type, p_property_types,
    p_max_price, p_min_rooms, p_min_living_area, v_notiz,
    p_responsible_user, trim(p_submission_key), nullif(trim(p_source_url), ''),
    now(), p_consent_text_version, null, null
  )
  returning id, search_profile_number into v_id, v_nummer;

  insert into public.search_profile_locations(search_profile_id, postal_code, city, created_by)
  values (v_id, nullif(trim(p_postal_code), ''), nullif(trim(p_city), ''), null);

  out_profile_id := v_id; out_profile_number := v_nummer; out_deduplicated := false;
  return next;
exception
  when unique_violation then
    select sp.id, sp.search_profile_number into v_id, v_nummer
      from public.search_profiles sp
     where sp.website_submission_key = trim(p_submission_key);
    out_profile_id := v_id; out_profile_number := v_nummer; out_deduplicated := true;
    return next;
end;
$function$;

revoke all on function public.create_public_search_profile(uuid, uuid, text, text, text, text[], numeric, numeric, numeric, text, text, text, text) from public, anon, authenticated;

-- 4. Die Zielsteuerung. Die Tabelle war per Check-Constraint auf die eine Zeile
--    SELLER_CHECK festgenagelt; sie steuert jetzt drei oeffentliche Wege.
--    Beide neuen Wege sind zunaechst ausgeschaltet und ohne verantwortliche
--    Person: sie werden erst taetig, wenn jemand sie bewusst einschaltet und
--    zuordnet. Ein Formular ohne Empfaenger nimmt sonst Anfragen entgegen, die
--    niemandem auffallen.
alter table public.sales_readiness_public_intake_config
  drop constraint if exists sales_readiness_public_intake_config_id_check;
alter table public.sales_readiness_public_intake_config
  add constraint sales_readiness_public_intake_config_id_check
  check (id in ('SELLER_CHECK', 'VALUATION', 'SEARCH_PROFILE'));

comment on table public.sales_readiness_public_intake_config is
  'Zielsteuerung fuer alle oeffentlichen Aufnahmewege (SELLER_CHECK, VALUATION, SEARCH_PROFILE). Der Name stammt aus der Zeit, als es nur den Verkaufsstrategie-Check gab.';

insert into public.sales_readiness_public_intake_config (id, enabled, responsible_user)
values ('VALUATION', false, null), ('SEARCH_PROFILE', false, null)
on conflict (id) do nothing;

