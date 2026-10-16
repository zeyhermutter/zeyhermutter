-- E-Mail-Vorlagen (P2-3, 16.10.2026). Freigabe Sebastian: Tabelle auf BETA.
--
-- Textvorlagen fuer wiederkehrende E-Mails: Antwort auf eine Anfrage,
-- Expose-Versand, Terminbestaetigung, Absage. Die Texte pflegt das Buero
-- selbst unter Verwaltung > E-Mail-Vorlagen; die Tabelle startet leer.
--
-- Das CRM erzeugt keine Rechts-, Belehrungs- oder Provisionstexte und prueft
-- den Inhalt nicht. Es verschickt nichts: eine Vorlage fuellt nur Betreff und
-- Text vor, das Mailprogramm oeffnet der Benutzer, der Versand wird danach
-- bewusst festgehalten.

create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  purpose text not null default 'OTHER',
  name text not null,
  subject text not null default '',
  body text not null default '',
  active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  version bigint not null default 1 check (version > 0),
  constraint email_templates_purpose_check
    check (purpose = any (array['INQUIRY_REPLY','EXPOSE','VIEWING_CONFIRMATION','DECLINE','OTHER'])),
  constraint email_templates_name_check check (btrim(name) <> ''),
  constraint email_templates_name_length check (char_length(name) <= 120),
  constraint email_templates_subject_length check (char_length(subject) <= 300),
  constraint email_templates_body_length check (char_length(body) <= 20000)
);

comment on table public.email_templates is
  'Textvorlagen des Bueros fuer E-Mails. Vom Buero gepflegt, vom CRM nicht inhaltlich geprueft; das CRM verschickt nichts.';

drop trigger if exists email_templates_set_metadata on public.email_templates;
create trigger email_templates_set_metadata
  before update on public.email_templates
  for each row execute function app_private.set_standard_update_metadata();

alter table public.email_templates enable row level security;

-- Lesen darf, wer Kontakte lesen darf -- wer eine E-Mail schreibt, braucht die Vorlage.
drop policy if exists email_templates_select on public.email_templates;
create policy email_templates_select on public.email_templates
  for select using ((select app_private.has_permission('contact.read')));

-- Pflegen nur mit Verwaltungsrecht.
drop policy if exists email_templates_insert on public.email_templates;
create policy email_templates_insert on public.email_templates
  for insert with check ((select app_private.has_permission('settings.manage')));

drop policy if exists email_templates_update on public.email_templates;
create policy email_templates_update on public.email_templates
  for update using ((select app_private.has_permission('settings.manage')))
  with check ((select app_private.has_permission('settings.manage')));

drop policy if exists email_templates_delete on public.email_templates;
create policy email_templates_delete on public.email_templates
  for delete using ((select app_private.has_permission('settings.manage')));

grant select, insert, update, delete on public.email_templates to authenticated;

create index if not exists email_templates_purpose_idx on public.email_templates (purpose, sort_order) where active;
