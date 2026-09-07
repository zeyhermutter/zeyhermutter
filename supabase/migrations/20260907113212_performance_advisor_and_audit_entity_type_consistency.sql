-- Thema 14, B-4: Hinweise des Performance-Advisors auf BETA abarbeiten.
--
-- Behandelt werden die sechs Hinweise, die eine echte Ursache im Schema haben.
-- Die 249 Hinweise "unused_index" bleiben unangetastet: BETA traegt kaum Daten,
-- dort ist praktisch jeder Index ungenutzt. Sie zu loeschen wuerde die
-- Zugriffspfade der Produktivdaten entfernen, ohne dass hier je gemessen wurde.
--
-- Keine Fachlogik, keine Rechte werden erweitert. Die Rollenmatrix wurde
-- geprueft: keine Rolle besitzt ein *.write ohne das zugehoerige *.read, das
-- Aufteilen der ALL-Policies nimmt also niemandem eine Leseberechtigung.

-- 1) auth_rls_initplan ------------------------------------------------------
-- Vier INSERT-Policies werteten app_private.has_permission und auth.uid() je
-- Zeile neu aus. In (select ...) gewickelt wertet Postgres sie einmal aus.
-- Die Bedingung selbst bleibt Zeichen fuer Zeichen dieselbe.

alter policy lead_sales_readiness_checks_insert on public.lead_sales_readiness_checks
  with check (
    (select app_private.has_permission('sales_readiness.write'))
    and created_by = (select auth.uid())
    and updated_by = (select auth.uid())
    and status = 'DRAFT'
  );

alter policy lead_sales_readiness_scenarios_insert on public.lead_sales_readiness_scenarios
  with check (
    (select app_private.has_permission('sales_readiness.write'))
    and created_by = (select auth.uid())
    and updated_by = (select auth.uid())
  );

alter policy lead_sales_readiness_measures_insert on public.lead_sales_readiness_measures
  with check (
    (select app_private.has_permission('sales_readiness.write'))
    and created_by = (select auth.uid())
    and updated_by = (select auth.uid())
  );

alter policy lead_sales_readiness_media_insert on public.lead_sales_readiness_media
  with check (
    (select app_private.has_permission('sales_readiness.write'))
    and created_by = (select auth.uid())
    and updated_by = (select auth.uid())
  );

-- 2) duplicate_index --------------------------------------------------------
-- 20260901071409 legte lead_sales_readiness_one_recommendation_idx an, ohne zu
-- bemerken, dass 20260901054830 mit lead_sales_readiness_scenarios_recommended_idx
-- bereits denselben Index hatte: beide unique auf (check_id) where is_recommended.
-- Der spaeter angelegte faellt weg, die Regel "hoechstens eine Empfehlung je
-- Check" bleibt durch den frueheren Index unveraendert bestehen.

drop index if exists public.lead_sales_readiness_one_recommendation_idx;

-- 3) multiple_permissive_policies -------------------------------------------
-- Sieben Tabellen hatten neben ihrer SELECT-Policy eine zweite Policy "for all".
-- "for all" schliesst SELECT ein, also wurden bei jedem Lesen beide geprueft,
-- und wer nur *.write besass, durfte lesen, ohne *.read zu haben. Alle uebrigen
-- 258 Policies im Schema sind bereits nach Befehl getrennt; diese sieben waren
-- die letzten Ausnahmen. Sie werden auf INSERT, UPDATE und DELETE aufgeteilt —
-- derselbe Berechtigungsschluessel, nur ohne das ungewollte SELECT.

do $$
declare
  v record;
begin
  for v in
    select * from (values
      ('acquisition_waves','acquisition.write'),
      ('partner_referral_fees','organization.write'),
      ('property_hoa_special_levies','property.write'),
      ('property_valuation_adjustments','valuation.write'),
      ('property_valuation_comparables','valuation.write'),
      ('sale_handover_keys','closing.write'),
      ('sale_handover_meters','closing.write')
    ) as t(tbl, perm)
  loop
    execute format('drop policy if exists %I on public.%I', v.tbl || '_write', v.tbl);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select app_private.has_permission(%L)))',
      v.tbl || '_insert', v.tbl, v.perm);
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select app_private.has_permission(%L))) with check ((select app_private.has_permission(%L)))',
      v.tbl || '_update', v.tbl, v.perm, v.perm);
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select app_private.has_permission(%L)))',
      v.tbl || '_delete', v.tbl, v.perm);
  end loop;
end;
$$;

-- 4) unindexed_foreign_keys -------------------------------------------------
-- Neun Fremdschluessel auf Benutzer standen ohne deckenden Index. Ohne ihn muss
-- Postgres beim Loeschen oder Aendern eines Benutzers jede dieser Tabellen
-- vollstaendig lesen. Die uebrigen Tabellen des Schemas indizieren created_by
-- und updated_by bereits; diese neun waren die verbliebenen Luecken.

create index if not exists after_sales_step_templates_created_by_idx on public.after_sales_step_templates (created_by);
create index if not exists after_sales_step_templates_updated_by_idx on public.after_sales_step_templates (updated_by);
create index if not exists lead_sales_readiness_media_marketing_approved_by_idx on public.lead_sales_readiness_media (marketing_approved_by);
create index if not exists sales_readiness_public_intake_config_responsible_user_idx on public.sales_readiness_public_intake_config (responsible_user);
create index if not exists training_settings_updated_by_idx on public.training_settings (updated_by);
create index if not exists website_page_versions_created_by_idx on public.website_page_versions (created_by);
create index if not exists website_page_versions_published_by_idx on public.website_page_versions (published_by);
create index if not exists website_pages_created_by_idx on public.website_pages (created_by);
create index if not exists website_pages_updated_by_idx on public.website_pages (updated_by);

-- 5) Einheitliche Bereichsbezeichnung in der Systemhistorie ------------------
-- In audit_events steht ein einzelner Eintrag aus der Ersteinrichtung mit dem
-- Bereich 'profile' in Kleinbuchstaben; alle spaeteren Eintraege desselben
-- Vorgangs nutzen 'USER'. Die Systemhistorie ist append-only — der Altbestand
-- wird deshalb nicht umgeschrieben. Stattdessen verhindert eine Bedingung, dass
-- neue Eintraege wieder in Kleinschreibung entstehen. Sie wird bewusst als
-- "not valid" angelegt: sie gilt ab jetzt, ruehrt aber die vorhandene Zeile
-- nicht an.

alter table public.audit_events
  drop constraint if exists audit_events_entity_type_upper_check;

alter table public.audit_events
  add constraint audit_events_entity_type_upper_check
  check (entity_type = upper(entity_type)) not valid;

comment on constraint audit_events_entity_type_upper_check on public.audit_events is
  'Bereiche werden durchgaengig in Grossbuchstaben gefuehrt. Not valid, weil ein Eintrag aus der Ersteinrichtung ("profile") in einer append-only-Historie steht und nicht rueckwirkend geaendert wird.';
