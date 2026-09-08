-- Die oeffentlichen Formulare muessen vor dem Ausfuellen wissen, ob ihr Weg
-- ueberhaupt offen ist. Sonst fuellt jemand acht Felder aus und erfaehrt erst
-- beim Absenden, dass niemand die Anfrage entgegennimmt.
--
-- Die Zielsteuerungstabelle selbst wird dafuer nicht geoeffnet: sie enthaelt
-- die Zuordnung zu einer konkreten Person. Nach aussen geht nur ein Ja oder
-- Nein.
create or replace function public.public_intake_enabled(p_id text)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select coalesce((
    select c.enabled and c.responsible_user is not null
      from public.sales_readiness_public_intake_config c
     where c.id = p_id
  ), false);
$function$;

revoke all on function public.public_intake_enabled(text) from public;
grant execute on function public.public_intake_enabled(text) to anon, authenticated;

comment on function public.public_intake_enabled(text) is
  'Ja/Nein: nimmt dieser oeffentliche Aufnahmeweg gerade Anfragen entgegen? Gibt weder die verantwortliche Person noch sonst etwas aus der Zielsteuerung preis.';

