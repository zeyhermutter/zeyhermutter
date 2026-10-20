-- Kleines Paket nach dem onOffice-Abgleich (20.10.2026). Freigabe Sebastian:
-- "Ja ... Exposé-Öffnungen mitzählen, Geburtstage, Herkunft, Kontakt aus
-- Signatur, zuletzt geöffnet, WhatsApp-Knopf und Kalender-Abo." Nur BETA.
--
-- Hier stehen nur die Teile, die die Datenbank brauchen:
--   1. Exposé-Link: Öffnungen zählen (Anzahl, erste, letzte) und beim ersten
--      Öffnen ein Verlaufseintrag "Exposé-Link geöffnet".
--   2. Herkunft am Kontakt (dieselbe Liste wie bei Leads: lead_sources).
--      Die erste Anfrage oder der erste Lead setzt sie, wenn sie leer ist;
--      einmalig für bestehende Kontakte nachgetragen.
--   3. Geburtstage der nächsten Tage (mit den Rechten des Benutzers).
--   4. Kalender-Abo: persönlicher, widerrufbarer Link auf die eigenen Termine.

-- ---------------------------------------------------------------------------
-- 1. Exposé-Link-Öffnungen
-- ---------------------------------------------------------------------------
alter table public.expose_links
  add column if not exists open_count integer not null default 0,
  add column if not exists first_opened_at timestamptz,
  add column if not exists last_opened_at timestamptz;

comment on table public.expose_links is
  'Kurze Exposé-Links (/e/<Kennung>). Gespeichert ist nur der SHA-256 der Kennung; aufgeloest wird sie von der Edge-Funktion expose-link. Seit 20.10.2026 mit Oeffnungszaehler (open_count, first_opened_at, last_opened_at); Oeffnungen angemeldeter CRM-Benutzer zaehlen nicht.';
comment on column public.expose_links.open_count is
  'Wie oft der Link ein Exposé ausgeliefert hat. Sicherheitsfilter mancher Mailprogramme oeffnen Links vorab -- eine Oeffnung heisst nicht sicher, dass ein Mensch gelesen hat.';

-- Nur die Edge-Funktion expose-link (Dienstrolle) ruft das auf.
create or replace function public.expose_link_oeffnung(p_token_hash text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  link record;
begin
  update public.expose_links l
     set open_count = l.open_count + 1,
         first_opened_at = coalesce(l.first_opened_at, now()),
         last_opened_at = now()
   where l.token_hash = p_token_hash and l.revoked_at is null and l.expires_at > now()
  returning l.id, l.open_count, l.contact_id, l.property_id, l.inquiry_id, l.expose_id into link;
  if link.id is null or link.open_count <> 1 then
    return;
  end if;
  insert into public.activity_events (activity_type, title, description, contact_id, property_id, inquiry_id, metadata)
  values ('EXPOSE_OPENED', 'Exposé-Link geöffnet',
          'Der Exposé-Link wurde zum ersten Mal geöffnet.',
          link.contact_id, link.property_id, link.inquiry_id,
          jsonb_build_object('expose_link_id', link.id, 'expose_id', link.expose_id));
end;
$$;

revoke all on function public.expose_link_oeffnung(text) from public, anon, authenticated;
grant execute on function public.expose_link_oeffnung(text) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Herkunft am Kontakt
-- ---------------------------------------------------------------------------
alter table public.contacts
  add column if not exists source_id uuid references public.lead_sources(id),
  add column if not exists source_detail text;

comment on column public.contacts.source_id is
  'Woher der Kontakt kam (Liste lead_sources, wie bei Leads). Wird von der ersten Anfrage bzw. dem ersten Lead gesetzt, solange leer; von Hand aenderbar.';
comment on column public.contacts.source_detail is
  'Genauer, z. B. Portalname oder wer empfohlen hat.';

create index if not exists contacts_source_idx on public.contacts (source_id);

-- Kanal einer Anfrage -> Schluessel in lead_sources.
create or replace function app_private.herkunft_aus_kanal(p_kanal text)
returns uuid
language sql
stable
set search_path = public, pg_temp
as $$
  select s.id from public.lead_sources s
   where s.key = case p_kanal
     when 'WEBSITE' then 'WEBSITE'
     when 'PORTAL' then 'PROPERTY_PORTAL'
     when 'PHONE' then 'PHONE'
     when 'EMAIL' then 'EMAIL'
     when 'REFERRAL' then 'REFERRAL'
     else 'OTHER' end
$$;

-- Erste Anfrage / erster Lead setzt die Herkunft, wenn sie noch leer ist.
-- Laeuft mit den Rechten des Eigentuemers: auch die Website-Anfrage (ohne
-- angemeldeten Benutzer) traegt die Herkunft ein.
create or replace function app_private.kontakt_herkunft_setzen()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  quelle uuid;
  genauer text;
begin
  if new.contact_id is null then
    return null;
  end if;
  if tg_table_name = 'inquiries' then
    quelle := app_private.herkunft_aus_kanal(new.channel);
    genauer := nullif(trim(coalesce(new.source_label, '')), '');
  else
    quelle := new.source_id;
    genauer := nullif(trim(coalesce(new.source_detail, '')), '');
  end if;
  if quelle is null then
    return null;
  end if;
  update public.contacts c
     set source_id = quelle,
         source_detail = coalesce(c.source_detail, genauer)
   where c.id = new.contact_id and c.source_id is null;
  return null;
end;
$$;

revoke all on function app_private.kontakt_herkunft_setzen() from public, anon, authenticated;

create trigger inquiries_80_kontakt_herkunft
  after insert on public.inquiries
  for each row execute function app_private.kontakt_herkunft_setzen();

create trigger leads_80_kontakt_herkunft
  after insert on public.leads
  for each row execute function app_private.kontakt_herkunft_setzen();

-- Einmalig: bestehende Kontakte aus ihrer fruehesten Anfrage bzw. ihrem
-- fruehesten Lead. Ohne Aenderung an "geaendert von/am" und Version.
alter table public.contacts disable trigger user;
with erste as (
  select distinct on (contact_id) contact_id, quelle, genauer
    from (
      select i.contact_id, app_private.herkunft_aus_kanal(i.channel) as quelle, nullif(trim(coalesce(i.source_label, '')), '') as genauer, i.created_at
        from public.inquiries i where i.contact_id is not null
      union all
      select l.contact_id, l.source_id, nullif(trim(coalesce(l.source_detail, '')), ''), l.created_at
        from public.leads l where l.contact_id is not null and l.source_id is not null
    ) alle
   where quelle is not null
   order by contact_id, created_at
)
update public.contacts c
   set source_id = e.quelle, source_detail = coalesce(c.source_detail, e.genauer)
  from erste e
 where c.id = e.contact_id and c.source_id is null;
alter table public.contacts enable trigger user;

-- ---------------------------------------------------------------------------
-- 3. Geburtstage der naechsten Tage (security invoker: es gelten die Rechte
--    des Benutzers auf contacts)
-- ---------------------------------------------------------------------------
create or replace function public.geburtstage_demnaechst(p_tage integer default 7)
returns table (contact_id uuid, contact_number text, name text, birth_date date, naechster date, alter_jahre integer)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with heute as (select (now() at time zone 'Europe/Berlin')::date as tag),
  kandidaten as (
    select c.id, c.contact_number, trim(concat_ws(' ', c.first_name, c.last_name)) as name, c.birth_date,
           extract(year from age(h.tag, c.birth_date))::int as jahre
      from public.contacts c, heute h
     where c.birth_date is not null and c.birth_date <= h.tag and c.archived_at is null and c.anonymized_at is null
  ),
  mit_termin as (
    -- Am Geburtstag selbst ist age() eine glatte Jahreszahl; sonst der
    -- naechste. Ein 29.02. faellt in Nicht-Schaltjahren auf den 28.02.
    select k.*, case when (k.birth_date + make_interval(years => k.jahre))::date = h.tag then h.tag
                     else (k.birth_date + make_interval(years => k.jahre + 1))::date end as naechster
      from kandidaten k, heute h
  )
  select m.id, m.contact_number, m.name, m.birth_date, m.naechster,
         (extract(year from m.naechster)::int - extract(year from m.birth_date)::int) as alter_jahre
    from mit_termin m, heute h
   where m.naechster <= h.tag + greatest(0, least(coalesce(p_tage, 7), 60))
   order by m.naechster, m.name
$$;

revoke all on function public.geburtstage_demnaechst(integer) from public, anon;
grant execute on function public.geburtstage_demnaechst(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Kalender-Abo
-- ---------------------------------------------------------------------------
create table if not exists public.calendar_feeds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  constraint calendar_feeds_token_hash_check check (token_hash ~ '^[0-9a-f]{64}$')
);

comment on table public.calendar_feeds is
  'Persoenliche Kalender-Abos (/kalender/<Kennung>.ics). Nur der SHA-256 der Kennung steht hier. Ein Abo zeigt die eigenen Termine (verantwortlich) von 30 Tagen zurueck bis 180 Tage voraus.';

create unique index if not exists calendar_feeds_ein_aktives_je_nutzer on public.calendar_feeds (user_id) where revoked_at is null;

alter table public.calendar_feeds enable row level security;
create policy calendar_feeds_select_eigene on public.calendar_feeds
  for select using (user_id = (select auth.uid()));
grant select on public.calendar_feeds to authenticated;

create trigger calendar_feeds_audit
  after insert or update on public.calendar_feeds
  for each row execute function app_private.audit_row_change('CALENDAR_FEED', 'id');

-- Neues Abo: ein vorhandenes des Benutzers wird widerrufen.
create or replace function public.kalender_abo_anlegen(p_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  neu uuid;
begin
  if auth.uid() is null or not app_private.ist_aktiv(auth.uid()) then
    raise exception 'CALENDAR_FEED_USER_REQUIRED' using errcode = '42501';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'CALENDAR_FEED_TOKEN_INVALID' using errcode = '22023';
  end if;
  update public.calendar_feeds set revoked_at = now() where user_id = auth.uid() and revoked_at is null;
  insert into public.calendar_feeds (user_id, token_hash) values (auth.uid(), p_token_hash) returning id into neu;
  return neu;
end;
$$;

create or replace function public.kalender_abo_widerrufen()
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  anzahl integer;
begin
  if auth.uid() is null then
    raise exception 'CALENDAR_FEED_USER_REQUIRED' using errcode = '42501';
  end if;
  update public.calendar_feeds set revoked_at = now() where user_id = auth.uid() and revoked_at is null;
  get diagnostics anzahl = row_count;
  return anzahl > 0;
end;
$$;

revoke all on function public.kalender_abo_anlegen(text) from public, anon;
revoke all on function public.kalender_abo_widerrufen() from public, anon;
grant execute on function public.kalender_abo_anlegen(text) to authenticated;
grant execute on function public.kalender_abo_widerrufen() to authenticated;

-- Die Termine eines Abos. Aufgerufen vom Worker ohne Anmeldung (die Kennung
-- ist der Schluessel). Liefert nur Termine, fuer die der Abo-Inhaber
-- verantwortlich ist, und nur aus Kategorien, die er lesen darf.
create or replace function public.kalender_abo_termine(p_token_hash text)
returns table (kind text, id uuid, summary text, description text, location text, starts_at timestamptz, ends_at timestamptz, ganztags boolean, tag date, source_path text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  abo record;
  von timestamptz := now() - interval '30 days';
  bis timestamptz := now() + interval '180 days';
  darf_check boolean;
  darf_aufmass boolean;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return;
  end if;
  select f.id, f.user_id into abo from public.calendar_feeds f where f.token_hash = p_token_hash and f.revoked_at is null;
  if abo.id is null or not app_private.ist_aktiv(abo.user_id) then
    return;
  end if;
  update public.calendar_feeds set last_used_at = now() where calendar_feeds.id = abo.id and (last_used_at is null or last_used_at < now() - interval '1 hour');
  -- Rechte des Abo-Inhabers pruefen (has_permission liest auth.uid()).
  perform set_config('request.jwt.claims', json_build_object('sub', abo.user_id, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', abo.user_id::text, true);
  darf_check := app_private.has_permission('sales_readiness.read');
  darf_aufmass := app_private.has_permission('measurement.read');

  return query
  select 'task'::text, t.id, t.title, concat_ws(' · ', t.task_number, nullif(t.description, '')), null::text, t.due_at, null::timestamptz, false, null::date,
         case when t.viewing_id is not null then '/viewings/' || t.viewing_id
              when t.inquiry_id is not null then '/inquiries/' || t.inquiry_id
              when t.lead_id is not null then '/leads/' || t.lead_id
              when t.property_id is not null then '/properties/' || t.property_id
              when t.search_profile_id is not null then '/search-profiles/' || t.search_profile_id
              else '/crm/tasks' end
    from public.tasks t
   where t.archived_at is null and t.responsible_user = abo.user_id and t.due_at >= von and t.due_at < bis
     and t.status not in ('DONE', 'CANCELLED')
  union all
  select 'viewing', v.id, 'Besichtigung ' || v.viewing_number,
         concat_ws(' · ', nullif(trim(concat_ws(' ', c.first_name, c.last_name)), ''), p.property_number, p.internal_title),
         v.meeting_point, v.starts_at, v.ends_at, false, null, '/viewings/' || v.id
    from public.viewings v
    left join public.contacts c on c.id = v.contact_id
    left join public.properties p on p.id = v.property_id
   where v.archived_at is null and v.primary_responsible_user = abo.user_id and v.starts_at >= von and v.starts_at < bis
     and v.status not in ('CANCELLED', 'NO_SHOW')
  union all
  select 'lead_followup', l.id, 'Wiedervorlage ' || l.lead_number,
         nullif(trim(concat_ws(' ', c.first_name, c.last_name)), ''), null, l.follow_up_at, null, false, null, '/leads/' || l.id
    from public.leads l
    left join public.contacts c on c.id = l.contact_id
   where l.archived_at is null and l.primary_responsible_user = abo.user_id and l.follow_up_at >= von and l.follow_up_at < bis
  union all
  select 'lead_valuation', l.id, 'Eigentümer-/Bewertungstermin ' || l.lead_number,
         nullif(trim(concat_ws(' ', c.first_name, c.last_name)), ''),
         nullif(concat_ws(' ', l.property_street, l.property_house_number, l.property_postal_code, l.property_city), ''),
         l.valuation_appointment_at, null, false, null, '/leads/' || l.id
    from public.leads l
    left join public.contacts c on c.id = l.contact_id
   where l.archived_at is null and l.primary_responsible_user = abo.user_id and l.valuation_appointment_at >= von and l.valuation_appointment_at < bis
  union all
  select 'closing_notary', s.id, 'Notartermin ' || s.closing_number,
         concat_ws(' · ', p.property_number, p.internal_title), null, s.notary_appointment_at, null, false, null, '/closings/' || s.id
    from public.sale_closings s
    left join public.properties p on p.id = s.property_id
   where s.archived_at is null and s.primary_responsible_user = abo.user_id and s.notary_appointment_at >= von and s.notary_appointment_at < bis
  union all
  select 'measurement', m.id, 'Aufmaß ' || m.order_number,
         concat_ws(' · ', p.property_number, nullif(trim(concat_ws(' ', c.first_name, c.last_name)), '')),
         nullif(concat_ws(', ', nullif(concat_ws(' ', m.object_street, m.object_house_number), ''), nullif(concat_ws(' ', m.object_postal_code, m.object_city), '')), ''),
         m.appointment_at, null, false, null, '/measurements/' || m.id
    from public.measurement_orders m
    left join public.contacts c on c.id = m.contact_id
    left join public.properties p on p.id = m.property_id
   where darf_aufmass and m.archived_at is null and m.primary_responsible_user = abo.user_id and m.appointment_at >= von and m.appointment_at < bis
  union all
  select 'project_followup', sp.id, coalesce(nullif(sp.next_step, '') || ' (' || sp.project_number || ')', 'Fälliger Schritt ' || sp.project_number),
         concat_ws(' · ', nullif(trim(concat_ws(' ', c.first_name, c.last_name)), ''), p.property_number), null,
         null, null, true, sp.next_step_due_on, '/projects/' || sp.id
    from public.sale_projects sp
    left join public.contacts c on c.id = sp.contact_id
    left join public.properties p on p.id = sp.property_id
   where sp.archived_at is null
     and (sp.next_step_user = abo.user_id or (sp.next_step_user is null and sp.primary_responsible_user = abo.user_id))
     and sp.next_step_due_on >= (von at time zone 'Europe/Berlin')::date and sp.next_step_due_on < (bis at time zone 'Europe/Berlin')::date
  union all
  select 'readiness_inspection', rc.id, 'Begehung ' || coalesce(l.lead_number, 'Verkaufsstrategie-Check'),
         concat_ws(' · ', nullif(trim(concat_ws(' ', c.first_name, c.last_name)), ''), p.property_number), null,
         rc.inspection_at, null, false, null, '/leads/' || rc.lead_id || '/sales-readiness'
    from public.lead_sales_readiness_checks rc
    left join public.leads l on l.id = rc.lead_id
    left join public.contacts c on c.id = l.contact_id
    left join public.properties p on p.id = rc.property_id
   where darf_check and rc.is_current and rc.responsible_user = abo.user_id and rc.inspection_at >= von and rc.inspection_at < bis
  union all
  select 'handover', h.id, 'Übergabe ' || s.closing_number,
         concat_ws(' · ', p.property_number, p.internal_title), null, h.handover_at, null, false, null, '/closings/' || s.id || '/milestones'
    from public.sale_handover_protocols h
    join public.sale_closings s on s.id = h.sale_closing_id
    left join public.properties p on p.id = s.property_id
   where s.archived_at is null and s.primary_responsible_user = abo.user_id and h.handover_at >= von and h.handover_at < bis;
end;
$$;

revoke all on function public.kalender_abo_termine(text) from public;
grant execute on function public.kalender_abo_termine(text) to anon, authenticated;
