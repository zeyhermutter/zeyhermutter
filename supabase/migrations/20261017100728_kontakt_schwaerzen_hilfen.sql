-- Datenschutz je Kontakt, Teil B1: Schwaerzen in Protokolleintraegen (P2-6 Teil 2, 17.10.2026).
-- Alle Werte unter den genannten Schluesseln schwaerzen, auch verschachtelt
-- (Protokolleintraege speichern ganze Datensaetze).
create or replace function app_private.schwaerze_alles(j jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  ergebnis jsonb;
  k text;
  v jsonb;
begin
  if j is null or jsonb_typeof(j) = 'null' then return j; end if;
  if jsonb_typeof(j) = 'object' then
    ergebnis := '{}'::jsonb;
    for k, v in select * from jsonb_each(j) loop
      ergebnis := ergebnis || jsonb_build_object(k, app_private.schwaerze_alles(v));
    end loop;
    return ergebnis;
  elsif jsonb_typeof(j) = 'array' then
    return coalesce((select jsonb_agg(app_private.schwaerze_alles(e)) from jsonb_array_elements(j) e), '[]'::jsonb);
  end if;
  return to_jsonb('[anonymisiert]'::text);
end;
$$;

create or replace function app_private.schwaerze_json(j jsonb, schluessel text[])
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  ergebnis jsonb;
  k text;
  v jsonb;
begin
  if j is null then return null; end if;
  if jsonb_typeof(j) = 'object' then
    ergebnis := '{}'::jsonb;
    for k, v in select * from jsonb_each(j) loop
      if k = any(schluessel) then
        ergebnis := ergebnis || jsonb_build_object(k, app_private.schwaerze_alles(v));
      else
        ergebnis := ergebnis || jsonb_build_object(k, app_private.schwaerze_json(v, schluessel));
      end if;
    end loop;
    return ergebnis;
  elsif jsonb_typeof(j) = 'array' then
    return coalesce((select jsonb_agg(app_private.schwaerze_json(e, schluessel)) from jsonb_array_elements(j) e), '[]'::jsonb);
  end if;
  return j;
end;
$$;
