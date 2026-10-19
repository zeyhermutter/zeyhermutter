-- Kurzer Exposé-Link (A7, 19.10.2026). Freigabe Sebastian: "JA", nur BETA.
--
-- Bisher stand im Text der E-Mail eine signierte Speicheradresse mit
-- eingebautem Zugangsschluessel, 14 Tage gueltig, nicht zurueckzuholen -- und
-- mit "Gesendet – festhalten" stand derselbe Schluessel im Verlauf.
--
-- Jetzt: der Link lautet <Adresse des CRM>/e/<Kennung>. Die Kennung erzeugt
-- der Worker zufaellig (128 Bit); in dieser Tabelle steht nur ihr SHA-256.
-- Wer die Tabelle liest, kann damit nichts oeffnen. Die Edge-Funktion
-- expose-link loest die Kennung auf und gibt fuer eine Minute eine
-- Download-Adresse heraus -- nur solange der Link nicht abgelaufen, nicht
-- zurueckgezogen und das Exposé weiter zur Verwendung freigegeben ist.
--
-- Es wird nicht gezaehlt, ob oder wie oft ein Link geoeffnet wurde.

create table if not exists public.expose_links (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  expose_id uuid not null references public.property_exposes(id),
  property_id uuid not null references public.properties(id),
  inquiry_id uuid references public.inquiries(id),
  contact_id uuid references public.contacts(id),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by uuid,
  constraint expose_links_token_hash_check check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint expose_links_laufzeit_check check (expires_at > created_at and expires_at <= created_at + interval '30 days'),
  constraint expose_links_zurueckgezogen_check check ((revoked_at is null) = (revoked_by is null))
);

comment on table public.expose_links is
  'Kurze Exposé-Links (/e/<Kennung>). Gespeichert ist nur der SHA-256 der Kennung; aufgeloest wird sie von der Edge-Funktion expose-link. Kein Oeffnungszaehler.';
comment on column public.expose_links.token_hash is
  'SHA-256 (hex) der Kennung aus dem Link. Die Kennung selbst steht nirgends in der Datenbank.';

create index if not exists expose_links_inquiry_idx on public.expose_links (inquiry_id, created_at desc);
create index if not exists expose_links_expose_idx on public.expose_links (expose_id, created_at desc);

alter table public.expose_links enable row level security;

create policy expose_links_select on public.expose_links
  for select using ((select app_private.has_permission('expose.read')));

-- Anlegen und Zurueckziehen nur ueber die beiden Funktionen unten.
grant select on public.expose_links to authenticated;

create trigger expose_links_audit
  after insert or update on public.expose_links
  for each row execute function app_private.audit_row_change('EXPOSE_LINK', 'id');

create or replace function public.expose_link_anlegen(p_inquiry_id uuid, p_expose_id uuid, p_token_hash text)
returns table (id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  anfrage record;
  expose record;
  neu_id uuid;
  neu_bis timestamptz;
begin
  if not app_private.has_permission('expose.read') or not app_private.has_permission('inquiry.read') then
    raise exception 'EXPOSE_LINK_PERMISSION_REQUIRED' using errcode = '42501';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'EXPOSE_LINK_TOKEN_INVALID' using errcode = '22023';
  end if;
  select i.id, i.property_id, i.contact_id into anfrage from public.inquiries i where i.id = p_inquiry_id;
  if anfrage.id is null or anfrage.property_id is null then
    raise exception 'EXPOSE_LINK_INQUIRY_INVALID' using errcode = '22023';
  end if;
  select x.id, x.property_id into expose
    from public.property_exposes x
   where x.id = p_expose_id and x.status = 'RELEASED' and x.archived_at is null and x.storage_path is not null;
  if expose.id is null or expose.property_id is distinct from anfrage.property_id then
    raise exception 'EXPOSE_LINK_EXPOSE_NOT_RELEASED' using errcode = '22023';
  end if;
  insert into public.expose_links (token_hash, expose_id, property_id, inquiry_id, contact_id, expires_at)
  values (p_token_hash, expose.id, expose.property_id, anfrage.id, anfrage.contact_id, now() + interval '14 days')
  returning expose_links.id, expose_links.expires_at into neu_id, neu_bis;
  return query select neu_id, neu_bis;
end;
$$;

create or replace function public.expose_link_zurueckziehen(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  geaendert uuid;
begin
  if not app_private.has_permission('expose.read') then
    raise exception 'EXPOSE_LINK_PERMISSION_REQUIRED' using errcode = '42501';
  end if;
  update public.expose_links
     set revoked_at = now(), revoked_by = auth.uid()
   where expose_links.id = p_id and revoked_at is null
  returning expose_links.id into geaendert;
  return geaendert is not null;
end;
$$;

revoke all on function public.expose_link_anlegen(uuid, uuid, text) from public, anon;
revoke all on function public.expose_link_zurueckziehen(uuid) from public, anon;
grant execute on function public.expose_link_anlegen(uuid, uuid, text) to authenticated;
grant execute on function public.expose_link_zurueckziehen(uuid) to authenticated;
