-- Besichtigungsfeedback per Link und Eigentümerbericht (27.10.2026).
-- Freigabe Sebastian: "Besichtigungsfeedback und Eigentümerbericht --> Das
-- umsetzen"; Bericht als PDF, das er selbst verschickt; Interessenten im
-- Bericht anonym, Zitate nur ausgewählt; Migration auf BETA: "Ja".
--
--   1. viewing_feedback: "Sehr hoch" war in der Oberfläche wählbar, aber von der
--      Datenbank abgewiesen (nur HIGH/MEDIUM/LOW/NONE) -- jetzt erlaubt. Neu:
--      Preiseinschätzung und Absagegrund (für Bericht und Auswertung).
--   2. viewing_feedback_links: Link für den Interessenten nach der Besichtigung
--      (/f/<Kennung>). Gespeichert ist nur der SHA-256 der Kennung. Der Makler
--      verschickt den Link selbst (E-Mail/WhatsApp); nichts geht automatisch
--      raus. Die Antwort steht am Link, der Makler übernimmt sie bei Bedarf in
--      sein Feedback.
--   3. owner_reports: Eigentümerbericht als festgehaltener Stand (Inhalt als
--      JSON), mit Datum des Versands.
-- Keine Löschpfade, keine Änderung an bestehenden Daten.

-- ---------------------------------------------------------------------------
-- 1. viewing_feedback
-- ---------------------------------------------------------------------------
alter table public.viewing_feedback drop constraint if exists viewing_feedback_interest_level_check;
alter table public.viewing_feedback add constraint viewing_feedback_interest_level_check
  check (interest_level in ('VERY_HIGH', 'HIGH', 'MEDIUM', 'LOW', 'NONE'));

alter table public.viewing_feedback
  add column if not exists price_perception text,
  add column if not exists decline_reason text;

alter table public.viewing_feedback drop constraint if exists viewing_feedback_price_perception_check;
alter table public.viewing_feedback add constraint viewing_feedback_price_perception_check
  check (price_perception is null or price_perception in ('FAIR', 'HIGH', 'TOO_HIGH'));
alter table public.viewing_feedback drop constraint if exists viewing_feedback_decline_reason_check;
alter table public.viewing_feedback add constraint viewing_feedback_decline_reason_check
  check (decline_reason is null or decline_reason in ('LOCATION', 'PRICE', 'SIZE_LAYOUT', 'CONDITION', 'EQUIPMENT', 'FINANCING', 'OTHER_PROPERTY', 'OTHER'));

comment on column public.viewing_feedback.price_perception is
  'Wie der Interessent den Preis empfindet: FAIR angemessen, HIGH eher hoch, TOO_HIGH zu hoch.';
comment on column public.viewing_feedback.decline_reason is
  'Hauptgrund, wenn kein Interesse besteht -- für Eigentümerbericht und Auswertung.';

-- ---------------------------------------------------------------------------
-- 2. Feedback-Link für den Interessenten
-- ---------------------------------------------------------------------------
create table if not exists public.viewing_feedback_links (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  viewing_id uuid not null references public.viewings(id),
  property_id uuid not null references public.properties(id),
  contact_id uuid not null references public.contacts(id),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by uuid,
  opened_at timestamptz,
  submitted_at timestamptz,
  interest_level text,
  liked text,
  concerns text,
  price_perception text,
  wish text,
  decline_reason text,
  comment text,
  taken_over_at timestamptz,
  taken_over_by uuid,
  constraint viewing_feedback_links_token_hash_check check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint viewing_feedback_links_laufzeit_check check (expires_at > created_at and expires_at <= created_at + interval '30 days'),
  constraint viewing_feedback_links_zurueckgezogen_check check ((revoked_at is null) = (revoked_by is null)),
  constraint viewing_feedback_links_interest_check check (interest_level is null or interest_level in ('VERY_HIGH', 'HIGH', 'MEDIUM', 'LOW', 'NONE')),
  constraint viewing_feedback_links_price_check check (price_perception is null or price_perception in ('FAIR', 'HIGH', 'TOO_HIGH')),
  constraint viewing_feedback_links_wish_check check (wish is null or wish in ('OFFER', 'SECOND_VIEWING', 'DOCUMENTS', 'THINKING', 'NO_INTEREST')),
  constraint viewing_feedback_links_reason_check check (decline_reason is null or decline_reason in ('LOCATION', 'PRICE', 'SIZE_LAYOUT', 'CONDITION', 'EQUIPMENT', 'FINANCING', 'OTHER_PROPERTY', 'OTHER')),
  constraint viewing_feedback_links_laengen_check check (
    coalesce(length(liked), 0) <= 2000 and coalesce(length(concerns), 0) <= 2000 and coalesce(length(comment), 0) <= 2000),
  constraint viewing_feedback_links_antwort_check check (submitted_at is null or interest_level is not null)
);

comment on table public.viewing_feedback_links is
  'Feedback-Link nach einer Besichtigung (/f/<Kennung>). Nur der SHA-256 der Kennung ist gespeichert. Der Makler verschickt den Link selbst. Die Antwort des Interessenten steht hier und wird nur auf Klick ins Feedback (viewing_feedback) übernommen.';

create index if not exists viewing_feedback_links_viewing_idx on public.viewing_feedback_links (viewing_id, created_at desc);
create index if not exists viewing_feedback_links_property_idx on public.viewing_feedback_links (property_id, submitted_at desc);

alter table public.viewing_feedback_links enable row level security;
drop policy if exists viewing_feedback_links_select on public.viewing_feedback_links;
create policy viewing_feedback_links_select on public.viewing_feedback_links
  for select using ((select app_private.has_permission('viewing.read')));
-- Übernommen-Vermerk setzt der Makler; alles andere nur über die Funktionen.
drop policy if exists viewing_feedback_links_update on public.viewing_feedback_links;
create policy viewing_feedback_links_update on public.viewing_feedback_links
  for update using ((select app_private.has_permission('viewing.write')))
  with check ((select app_private.has_permission('viewing.write')));
grant select on public.viewing_feedback_links to authenticated;
grant update (taken_over_at, taken_over_by) on public.viewing_feedback_links to authenticated;

drop trigger if exists viewing_feedback_links_audit on public.viewing_feedback_links;
create trigger viewing_feedback_links_audit
  after insert or update on public.viewing_feedback_links
  for each row execute function app_private.audit_row_change('VIEWING_FEEDBACK_LINK', 'id');

create or replace function public.besichtigung_feedback_link_anlegen(p_viewing_id uuid, p_token_hash text)
returns table (id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  termin record;
  neu_id uuid;
  neu_bis timestamptz;
begin
  if not app_private.has_permission('viewing.write') then
    raise exception 'FEEDBACK_LINK_PERMISSION_REQUIRED' using errcode = '42501';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'FEEDBACK_LINK_TOKEN_INVALID' using errcode = '22023';
  end if;
  select v.id, v.property_id, v.contact_id, v.status into termin
    from public.viewings v where v.id = p_viewing_id and v.archived_at is null;
  if termin.id is null then
    raise exception 'FEEDBACK_LINK_VIEWING_INVALID' using errcode = '22023';
  end if;
  if termin.status <> 'COMPLETED' then
    raise exception 'FEEDBACK_LINK_VIEWING_NOT_COMPLETED' using errcode = '22023';
  end if;
  insert into public.viewing_feedback_links (token_hash, viewing_id, property_id, contact_id, expires_at)
  values (p_token_hash, termin.id, termin.property_id, termin.contact_id, now() + interval '14 days')
  returning viewing_feedback_links.id, viewing_feedback_links.expires_at into neu_id, neu_bis;
  return query select neu_id, neu_bis;
end;
$$;

create or replace function public.besichtigung_feedback_link_zurueckziehen(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  geaendert uuid;
begin
  if not app_private.has_permission('viewing.write') then
    raise exception 'FEEDBACK_LINK_PERMISSION_REQUIRED' using errcode = '42501';
  end if;
  update public.viewing_feedback_links l
     set revoked_at = now(), revoked_by = auth.uid()
   where l.id = p_id and l.revoked_at is null and l.submitted_at is null
  returning l.id into geaendert;
  return geaendert is not null;
end;
$$;

-- Für die öffentliche Seite /f/<Kennung> (ohne Anmeldung): Zustand des Links und
-- nur das, was der Interessent ohnehin kennt -- Objektart, Zimmer, Fläche, Ort,
-- Datum der Besichtigung, Name der Firma. Keine Namen, keine Adresse.
create or replace function public.besichtigung_feedback_formular(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  l record;
  firma text;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('zustand', 'unbekannt');
  end if;
  select k.id, k.revoked_at, k.expires_at, k.submitted_at, v.starts_at,
         p.property_type, p.transaction_type, p.rooms, p.living_area_sqm, a.postal_code, a.city
    into l
    from public.viewing_feedback_links k
    join public.viewings v on v.id = k.viewing_id
    join public.properties p on p.id = k.property_id
    left join public.property_addresses a on a.property_id = p.id
   where k.token_hash = p_token_hash
   limit 1;
  if l.id is null then
    return jsonb_build_object('zustand', 'unbekannt');
  end if;
  select coalesce(nullif(c.brand_name, ''), c.legal_name) into firma from public.company_profile c limit 1;
  if l.submitted_at is not null then
    return jsonb_build_object('zustand', 'beantwortet', 'firma', firma);
  end if;
  if l.revoked_at is not null or l.expires_at <= now() then
    return jsonb_build_object('zustand', 'abgelaufen', 'firma', firma);
  end if;
  update public.viewing_feedback_links set opened_at = now() where id = l.id and opened_at is null;
  return jsonb_build_object(
    'zustand', 'offen',
    'firma', firma,
    'termin', l.starts_at,
    'objektart', l.property_type,
    'vermarktung', l.transaction_type,
    'zimmer', l.rooms,
    'flaeche', l.living_area_sqm,
    'ort', nullif(trim(coalesce(l.postal_code, '') || ' ' || coalesce(l.city, '')), ''));
end;
$$;

-- Antwort des Interessenten. Einmal möglich; Werte werden gegen die Listen
-- geprüft, Texte gekürzt. Danach ein Verlaufseintrag und eine Benachrichtigung
-- an den Verantwortlichen der Besichtigung.
create or replace function public.besichtigung_feedback_abgeben(p_token_hash text, p_antwort jsonb)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  l record;
  v_interesse text := p_antwort ->> 'interesse';
  v_preis text := nullif(p_antwort ->> 'preis', '');
  v_wunsch text := nullif(p_antwort ->> 'wunsch', '');
  v_grund text := nullif(p_antwort ->> 'grund', '');
  v_gefallen text := nullif(left(trim(coalesce(p_antwort ->> 'gefallen', '')), 2000), '');
  v_bedenken text := nullif(left(trim(coalesce(p_antwort ->> 'bedenken', '')), 2000), '');
  v_anmerkung text := nullif(left(trim(coalesce(p_antwort ->> 'anmerkung', '')), 2000), '');
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return 'unbekannt';
  end if;
  if v_interesse is null or v_interesse not in ('VERY_HIGH', 'HIGH', 'MEDIUM', 'LOW', 'NONE') then
    return 'ungueltig';
  end if;
  if v_preis is not null and v_preis not in ('FAIR', 'HIGH', 'TOO_HIGH') then v_preis := null; end if;
  if v_wunsch is not null and v_wunsch not in ('OFFER', 'SECOND_VIEWING', 'DOCUMENTS', 'THINKING', 'NO_INTEREST') then v_wunsch := null; end if;
  if v_grund is not null and v_grund not in ('LOCATION', 'PRICE', 'SIZE_LAYOUT', 'CONDITION', 'EQUIPMENT', 'FINANCING', 'OTHER_PROPERTY', 'OTHER') then v_grund := null; end if;

  update public.viewing_feedback_links k
     set submitted_at = now(), opened_at = coalesce(k.opened_at, now()),
         interest_level = v_interesse, liked = v_gefallen, concerns = v_bedenken,
         price_perception = v_preis, wish = v_wunsch, decline_reason = v_grund, comment = v_anmerkung
   where k.token_hash = p_token_hash and k.submitted_at is null and k.revoked_at is null and k.expires_at > now()
  returning k.id, k.viewing_id, k.property_id, k.contact_id into l;
  if l.id is null then
    if exists (select 1 from public.viewing_feedback_links k where k.token_hash = p_token_hash and k.submitted_at is not null) then
      return 'beantwortet';
    end if;
    return 'abgelaufen';
  end if;

  insert into public.activity_events (activity_type, title, description, contact_id, property_id, viewing_id, metadata)
  values ('VIEWING_FEEDBACK_RECEIVED', 'Rückmeldung zur Besichtigung eingegangen',
          'Der Interessent hat den Feedback-Link beantwortet.',
          l.contact_id, l.property_id, l.viewing_id,
          jsonb_build_object('feedback_link_id', l.id, 'interesse', v_interesse, 'wunsch', v_wunsch));

  insert into public.notifications (user_id, type, title, message, entity_type, entity_id)
  select v.primary_responsible_user, 'FEEDBACK', 'Rückmeldung zur Besichtigung ' || v.viewing_number,
         'Der Interessent hat den Feedback-Link beantwortet.', 'VIEWING', v.id
    from public.viewings v
   where v.id = l.viewing_id and v.primary_responsible_user is not null;
  return 'ok';
end;
$$;

revoke all on function public.besichtigung_feedback_link_anlegen(uuid, text) from public, anon;
revoke all on function public.besichtigung_feedback_link_zurueckziehen(uuid) from public, anon;
revoke all on function public.besichtigung_feedback_formular(text) from public;
revoke all on function public.besichtigung_feedback_abgeben(text, jsonb) from public;
grant execute on function public.besichtigung_feedback_link_anlegen(uuid, text) to authenticated;
grant execute on function public.besichtigung_feedback_link_zurueckziehen(uuid) to authenticated;
grant execute on function public.besichtigung_feedback_formular(text) to anon, authenticated;
grant execute on function public.besichtigung_feedback_abgeben(text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Eigentümerbericht
-- ---------------------------------------------------------------------------
create sequence if not exists public.owner_report_number_seq;

create table if not exists public.owner_reports (
  id uuid primary key default gen_random_uuid(),
  report_number text not null unique default ('ZM-EB-' || lpad(nextval('public.owner_report_number_seq')::text, 6, '0')),
  property_id uuid not null references public.properties(id),
  period_from date not null,
  period_to date not null,
  content jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  sent_at timestamptz,
  sent_by uuid,
  constraint owner_reports_zeitraum_check check (period_to >= period_from),
  constraint owner_reports_versand_check check ((sent_at is null) = (sent_by is null))
);

comment on table public.owner_reports is
  'Eigentümerbericht als festgehaltener Stand (content: Kennzahlen, Rückmeldungen ohne Namen, Text des Maklers). Der Makler druckt ihn als PDF und verschickt ihn selbst; sent_at vermerkt den Versand.';

create index if not exists owner_reports_property_idx on public.owner_reports (property_id, created_at desc);

alter table public.owner_reports enable row level security;
drop policy if exists owner_reports_select on public.owner_reports;
create policy owner_reports_select on public.owner_reports
  for select using ((select app_private.has_permission('property.read')));
drop policy if exists owner_reports_insert on public.owner_reports;
create policy owner_reports_insert on public.owner_reports
  for insert with check ((select app_private.has_permission('property.write')) and created_by = (select auth.uid()));
drop policy if exists owner_reports_update on public.owner_reports;
create policy owner_reports_update on public.owner_reports
  for update using ((select app_private.has_permission('property.write')))
  with check ((select app_private.has_permission('property.write')));
grant select, insert on public.owner_reports to authenticated;
grant update (sent_at, sent_by) on public.owner_reports to authenticated;
grant usage on sequence public.owner_report_number_seq to authenticated;

drop trigger if exists owner_reports_audit on public.owner_reports;
create trigger owner_reports_audit
  after insert or update on public.owner_reports
  for each row execute function app_private.audit_row_change('OWNER_REPORT', 'report_number');
