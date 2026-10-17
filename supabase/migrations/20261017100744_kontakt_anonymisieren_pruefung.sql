-- Datenschutz je Kontakt, Teil B2: Was einer Anonymisierung entgegensteht (P2-6 Teil 2, 17.10.2026).
-- Liest mit den Rechten des Aufrufers. Gesperrt, solange Dokumente,
-- Geldwaesche-Identifizierungen oder umgewandelte Leads am Kontakt haengen --
-- deren Dateien, Fristen und Schreibschutz kann die Anonymisierung nicht
-- aufloesen. Welche Fristen gelten, entscheidet das Buero, nicht das CRM.
create or replace function public.contact_anonymization_check(p_contact_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  gruende text[] := array[]::text[];
  n integer;
begin
  select count(*) into n from public.documents d
   where d.contact_id = p_contact_id and (coalesce(d.legal_hold, false) or (d.retention_until is not null and d.retention_until >= current_date));
  if n > 0 then gruende := gruende || format('%s Dokument(e) mit Sperrvermerk oder laufender Aufbewahrungsfrist', n); end if;

  select count(*) into n from public.documents d
   where d.contact_id = p_contact_id and not (coalesce(d.legal_hold, false) or (d.retention_until is not null and d.retention_until >= current_date));
  if n > 0 then gruende := gruende || format('%s weitere(s) Dokument(e) mit Datei - Dateien kann die Anonymisierung nicht entfernen', n); end if;

  select count(*) into n from public.gwg_identifications g
   where g.contact_id = p_contact_id or g.represents_contact_id = p_contact_id;
  if n > 0 then gruende := gruende || format('%s Geldwäsche-Identifizierung(en) - zuerst unter "Geldwäsche & Aufbewahrung" bearbeiten', n); end if;

  -- Umgewandelte Leads sind schreibgeschuetzt (Trigger guard_converted_lead_business_data).
  select count(*) into n from public.leads l
   where l.contact_id = p_contact_id and l.converted_property_id is not null;
  if n > 0 then gruende := gruende || format('%s in eine Immobilie umgewandelte(r) Lead(s) - deren Angaben sind schreibgeschützt', n); end if;

  if exists(select 1 from public.contacts c where c.id = p_contact_id and c.anonymized_at is not null) then
    gruende := gruende || 'Der Kontakt ist bereits anonymisiert'::text;
  end if;

  return jsonb_build_object('moeglich', coalesce(array_length(gruende, 1), 0) = 0, 'gruende', to_jsonb(gruende));
end;
$$;

grant execute on function public.contact_anonymization_check(uuid) to authenticated;
