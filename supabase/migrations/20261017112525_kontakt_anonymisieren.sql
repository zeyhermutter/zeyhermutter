-- Datenschutz je Kontakt, Teil B3: Anonymisieren auf Antrag (P2-6 Teil 2, 17.10.2026).
-- Freigabe Sebastian: "beides". Ueberschreibt die Angaben zur Person, behaelt
-- die Vorgaenge ohne Personenbezug. Nur mit dem Recht contact.anonymize, nur
-- mit Grund, protokolliert, nur wenn contact_anonymization_check nichts
-- einwendet. Nicht umkehrbar.

create or replace function public.anonymize_contact(p_contact_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  k public.contacts%rowtype;
  pruefung jsonb;
  ersatz constant text := '[anonymisiert]';
  werte text[];
  w text;
  persoenlich constant text[] := array['first_name','last_name','email','phone','mobile','birth_date','salutation','title',
    'internal_notes','legal_basis_note','street','house_number','postal_code','city','state','message','body','description',
    -- Anschriften stehen im Protokoll als ganzes Objekt unter "address" (audit_contact_address).
    'address'];
  anzahl jsonb := '{}'::jsonb;
  n integer;
begin
  if not app_private.has_permission('contact.anonymize') then
    raise exception 'ANONYMIZE_PERMISSION_MISSING' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'ANONYMIZE_REASON_REQUIRED' using errcode = '22023';
  end if;

  select * into k from public.contacts where id = p_contact_id for update;
  if k.id is null then raise exception 'CONTACT_NOT_FOUND' using errcode = 'P0002'; end if;

  -- Dieselbe Pruefung wie in der Oberflaeche, hier mit vollem Blick (security definer).
  pruefung := public.contact_anonymization_check(p_contact_id);
  if not (pruefung->>'moeglich')::boolean then
    raise exception 'ANONYMIZE_BLOCKED: %', array_to_string(array(select jsonb_array_elements_text(pruefung->'gruende')), '; ') using errcode = '22023';
  end if;

  -- Die Werte, die in Freitexten anderer Datensaetze stehen koennen.
  werte := array_remove(array[k.first_name, k.last_name, k.email, k.phone, k.mobile,
    nullif(btrim(coalesce(k.first_name,'') || ' ' || coalesce(k.last_name,'')), '')], null);
  werte := array(select x from unnest(werte) x where char_length(x) >= 3 order by char_length(x) desc);

  -- Freitexte an verknuepften Vorgaengen
  update public.inquiries set message = ersatz where contact_id = p_contact_id and message is not null;
  get diagnostics n = row_count; anzahl := anzahl || jsonb_build_object('anfragen', n);
  update public.leads set message = ersatz, internal_notes = null where contact_id = p_contact_id and converted_property_id is null and (message is not null or internal_notes is not null);
  get diagnostics n = row_count; anzahl := anzahl || jsonb_build_object('leads', n);
  update public.search_profiles set internal_notes = null where contact_id = p_contact_id and internal_notes is not null;
  update public.comments set body = ersatz where entity_type = 'CONTACT' and entity_id = p_contact_id;
  get diagnostics n = row_count; anzahl := anzahl || jsonb_build_object('kommentare', n);
  update public.activity_events set description = null where contact_id = p_contact_id and description is not null;
  get diagnostics n = row_count; anzahl := anzahl || jsonb_build_object('verlauf', n);
  foreach w in array werte loop
    update public.activity_events set title = replace(title, w, ersatz) where contact_id = p_contact_id and title like '%' || w || '%';
    update public.tasks set title = replace(title, w, ersatz), description = replace(description, w, ersatz)
      where contact_id = p_contact_id and (title like '%' || w || '%' or description like '%' || w || '%');
    update public.search_profiles set title = replace(title, w, ersatz) where contact_id = p_contact_id and title like '%' || w || '%';
  end loop;

  -- Anschriften: reine Personendaten, ohne Bezug von anderer Stelle.
  delete from public.contact_addresses where contact_id = p_contact_id;
  get diagnostics n = row_count; anzahl := anzahl || jsonb_build_object('anschriften', n);

  -- Der Kontakt selbst. archived_at setzt die Funktion mit; das Archivrecht
  -- prueft der Trigger mit den Rechten des Aufrufers.
  update public.contacts set
    salutation = null, title = null, first_name = 'Anonymisiert', last_name = k.contact_number,
    -- Eine Erreichbarkeit ist Pflicht (contacts_check): ein Platzhalter ohne Personenbezug.
    email = lower(k.contact_number) || '@anonymisiert.invalid', phone = null, mobile = null, birth_date = null, preferred_channel = null,
    internal_notes = null, legal_basis_note = null,
    anonymized_at = now(), anonymized_by = auth.uid(),
    archived_at = coalesce(archived_at, now()), archived_by = coalesce(archived_by, auth.uid())
  where id = p_contact_id;

  -- Protokoll (zuletzt, damit auch die Eintraege dieser Aenderungen erfasst sind):
  -- personenbezogene Werte geschwaerzt; dass etwas geaendert wurde, bleibt sichtbar.
  update public.audit_events set field_changes = app_private.schwaerze_json(field_changes, persoenlich),
         description = case when description is null then null else ersatz end
   where entity_id = p_contact_id
      or entity_id in (select id from public.inquiries where contact_id = p_contact_id)
      or entity_id in (select id from public.leads where contact_id = p_contact_id)
      or entity_id in (select id from public.tasks where contact_id = p_contact_id)
      or entity_id in (select id from public.search_profiles where contact_id = p_contact_id)
      or entity_id in (select id from public.comments where entity_type = 'CONTACT' and entity_id = p_contact_id);
  get diagnostics n = row_count; anzahl := anzahl || jsonb_build_object('protokoll', n);

  insert into public.audit_events(actor_type, actor_user_id, entity_type, entity_id, entity_reference, action, field_changes, description, source)
  values ('USER', auth.uid(), 'CONTACT', p_contact_id, k.contact_number, 'ANONYMIZE',
          jsonb_build_object('grund', btrim(p_reason), 'umfang', anzahl), 'Kontakt auf Antrag anonymisiert', 'USER');

  return jsonb_build_object('ok', true, 'umfang', anzahl);
end;
$$;

revoke all on function public.anonymize_contact(uuid, text) from public, anon;
grant execute on function public.anonymize_contact(uuid, text) to authenticated;
