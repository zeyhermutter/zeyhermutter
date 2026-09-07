-- Thema 14, C-6: Unterlagenmanagement sichtbar machen.
--
-- Entscheidung: Das System zeigt, welche Unterlagen loeschreif sind und wo die
-- Aufbewahrung ueberhaupt nicht bestimmbar ist. Es loescht nichts und legt
-- keine Frist selbst fest. Wie lange eine Unterlage aufzubewahren ist, ist eine
-- rechtliche Frage; die beantwortet die Software nicht.
--
-- Anlass sind zwei Befunde auf BETA:
--   * Von den zehn Dokumentarten, die tatsaechlich vorkommen, hat genau eine
--     eine Aufbewahrungsregel. Fuer die uebrigen kann niemand sagen, wann sie
--     geloescht werden duerfen -- es steht schlicht keine Regel dahinter.
--   * In documents.retention_category stand freier Text ('DEMO'), weil die
--     Spalte keine Bedingung hatte.

-- 1) Aufbewahrungskategorie darf kein freier Text mehr sein -----------------
-- Die sieben Kategorien sind dieselben, die die Regeltabelle und die Oberflaeche
-- kennen. "not valid": vorhandene Zeilen werden nicht rueckwirkend geaendert,
-- sondern bleiben sichtbar und werden auf /compliance als offener Punkt
-- ausgewiesen. Wer sie korrigiert, entscheidet fachlich, nicht diese Migration.

alter table public.documents
  drop constraint if exists documents_retention_category_check;

alter table public.documents
  add constraint documents_retention_category_check
  check (
    retention_category is null
    or retention_category in (
      'GWG_IDENTIFICATION','CONTRACT','EVIDENCE','FINANCIAL',
      'LEGAL_CAPACITY','PROPERTY','TRAINING'
    )
  ) not valid;

comment on constraint documents_retention_category_check on public.documents is
  'Nur die sieben bekannten Aufbewahrungskategorien. Not valid, weil Altbestand mit freiem Text existiert, der fachlich zu klaeren und nicht automatisch umzuschreiben ist.';

-- 2) Ueberblick fuer die Seite "Geldwaesche & Aufbewahrung" -----------------
-- Liefert nur Zahlen und Kategorienamen, keine Dokumentinhalte.
--
-- security definer ist hier notwendig und beabsichtigt: die Funktion vergleicht
-- den Dateibestand in storage.objects mit den Verweisen in der Datenbank, und
-- storage.objects ist fuer authenticated bewusst nicht lesbar. Die Funktion
-- prueft deshalb selbst die Berechtigung und gibt ausschliesslich Zaehlwerte
-- und Pfade heraus -- keine Datei und keinen Inhalt.

create or replace function public.document_retention_overview()
returns table (
  documents_total integer,
  deletion_eligible integer,
  under_legal_hold integer,
  without_retention_date integer,
  missing_rule_categories text[],
  unknown_retention_category integer,
  orphaned_files integer,
  orphaned_examples text[]
)
language plpgsql
security definer
set search_path to 'public','storage','pg_temp'
as $function$
begin
  if not app_private.has_permission('gwg.read') then
    raise exception 'GWG_READ_REQUIRED' using errcode = '42501';
  end if;

  select count(*)::int into documents_total
    from public.documents d where d.archived_at is null;

  select count(*)::int into deletion_eligible
    from public.documents d
   where d.archived_at is null and not d.legal_hold
     and d.deletion_eligible_at is not null
     and d.deletion_eligible_at <= current_date;

  select count(*)::int into under_legal_hold
    from public.documents d where d.archived_at is null and d.legal_hold;

  select count(*)::int into without_retention_date
    from public.documents d
   where d.archived_at is null and d.deletion_eligible_at is null;

  -- Dokumentarten, fuer die keine aktive Regel hinterlegt ist. Genau hier kann
  -- das System nicht sagen, wann geloescht werden darf.
  select coalesce(array_agg(distinct d.category order by d.category), '{}')
    into missing_rule_categories
    from public.documents d
   where d.archived_at is null
     and not exists (
       select 1 from public.document_retention_rules r
        where r.category = d.category and r.active
     );

  select count(*)::int into unknown_retention_category
    from public.documents d
   where d.archived_at is null
     and d.retention_category is not null
     and d.retention_category not in (
       'GWG_IDENTIFICATION','CONTRACT','EVIDENCE','FINANCIAL',
       'LEGAL_CAPACITY','PROPERTY','TRAINING'
     );

  -- Dateien im Speicher, auf die kein Datensatz mehr zeigt. Der oeffentliche
  -- Bucket bleibt aussen vor: dort liegen abgeleitete Kopien unter
  -- media/<id>/v<n>, die nicht ueber storage_path referenziert werden.
  with verwaist as (
    select o.bucket_id || ' · ' || o.name as pfad
      from storage.objects o
     where o.bucket_id in ('zm-private-documents','zm-property-media')
       and not exists (select 1 from public.property_media m
                        where m.storage_bucket = o.bucket_id and m.storage_path = o.name)
       and not exists (select 1 from public.document_versions v
                        where v.storage_bucket = o.bucket_id and v.storage_path = o.name)
       and not exists (select 1 from public.lead_sales_readiness_media l
                        where l.storage_bucket = o.bucket_id and l.storage_object_path = o.name)
       and not exists (select 1 from public.property_exposes e
                        where e.storage_bucket = o.bucket_id and e.storage_path = o.name)
     order by 1
  )
  select count(*)::int, coalesce(array_agg(pfad), '{}')
    into orphaned_files, orphaned_examples
    from (select pfad from verwaist limit 20) s;

  return next;
end;
$function$;

revoke all on function public.document_retention_overview() from public, anon;
grant execute on function public.document_retention_overview() to authenticated;

comment on function public.document_retention_overview() is
  'Zaehlwerte zur Aufbewahrung fuer die Seite Geldwaesche & Aufbewahrung. Loescht nichts, entscheidet nichts, legt keine Frist fest. security definer, weil storage.objects fuer authenticated nicht lesbar ist; die Berechtigung gwg.read wird in der Funktion selbst geprueft.';
