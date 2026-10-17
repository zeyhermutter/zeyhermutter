-- Datenschutz je Kontakt, Teil A: Felder und Recht (P2-6 Teil 2, 17.10.2026).
-- Freigabe Sebastian: "beides". Die Auswahl der Rechtsgrundlage trifft das
-- Buero; das CRM bewertet sie nicht.

alter table public.contacts
  add column if not exists legal_basis text,
  add column if not exists legal_basis_note text,
  add column if not exists marketing_objection_at timestamptz,
  add column if not exists anonymized_at timestamptz,
  add column if not exists anonymized_by uuid references auth.users(id) on delete set null;

alter table public.contacts drop constraint if exists contacts_legal_basis_check;
alter table public.contacts add constraint contacts_legal_basis_check
  check (legal_basis is null or legal_basis = any (array['CONTRACT','CONSENT','LEGITIMATE_INTEREST','OTHER']));
alter table public.contacts drop constraint if exists contacts_legal_basis_note_length;
alter table public.contacts add constraint contacts_legal_basis_note_length
  check (legal_basis_note is null or char_length(legal_basis_note) <= 500);

comment on column public.contacts.legal_basis is 'Vom Buero gewaehlte Rechtsgrundlage der Verarbeitung; das CRM bewertet sie nicht.';
comment on column public.contacts.marketing_objection_at is 'Zeitpunkt des Werbewiderspruchs; gesetzt, wenn die Person keiner Werbung mehr zustimmt.';
comment on column public.contacts.anonymized_at is 'Zeitpunkt der Anonymisierung auf Antrag (nicht umkehrbar).';

insert into public.permissions(key, description) values
  ('contact.anonymize', 'Kontakte auf Antrag anonymisieren (nicht umkehrbar)')
on conflict (key) do update set description = excluded.description;

insert into public.role_permissions(role_id, permission_id)
select r.id, p.id from public.roles r
join public.permissions p on p.key = 'contact.anonymize'
where r.key in ('admin', 'managing_director')
on conflict do nothing;
