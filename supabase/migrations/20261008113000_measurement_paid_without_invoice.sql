-- Bezahlt ohne eigene Rechnungsstellung im CRM wieder moeglich machen.
--
-- WAS FALSCH WAR
--
-- Die Uebergangstabelle fuehrt DELIVERED -> PAID mit der Begruendung
-- "Bezahlt, ohne eigene Rechnungsstellung im CRM". Der Pruefungstrigger
-- verlangte aber fuer INVOICED *und* PAID gleichermassen fee_amount und
-- invoiced_on. Der Knopf scheiterte damit in genau dem Fall, den seine
-- Beschreibung benennt -- ein Widerspruch zwischen zwei Stellen derselben
-- Migration vom 08.10.2026, den keine Pruefung vergleicht.
--
-- WAS JETZT GILT
--
--   INVOICED  verlangt Honorar und Rechnungsdatum. Wer abrechnet, hat eine
--             Rechnung; ohne Datum ist "abgerechnet" eine Behauptung.
--   PAID      verlangt Honorar und Zahlungsdatum, aber kein Rechnungsdatum.
--             Das Geld ist da; ob die Rechnung im CRM steht oder beim
--             Steuerberater, entscheidet nicht die Datenbank.
--
-- Das Honorar bleibt fuer PAID verlangt: ein bezahlter Auftrag ohne Betrag
-- ist in keiner Auswertung brauchbar. Die Reihenfolgepruefung
-- measurement_orders_payment_order_check vertraegt ein fehlendes
-- Rechnungsdatum bereits (paid_on is null or invoiced_on is null or ...).

create or replace function app_private.validate_measurement_order()
returns trigger
language plpgsql
set search_path to 'app_private','public','pg_temp'
as $function$
begin
  if tg_op='INSERT' and new.status not in ('DRAFT','REQUESTED') then
    raise exception 'MEASUREMENT_MUST_START_DRAFT_OR_REQUESTED' using errcode='22023';
  end if;

  if tg_op='UPDATE' then
    if old.order_number is distinct from new.order_number then
      raise exception 'MEASUREMENT_NUMBER_IMMUTABLE' using errcode='42501';
    end if;
    if old.status is distinct from new.status and not exists(
      select 1 from public.measurement_order_status_transitions t
      where t.from_status=old.status and t.to_status=new.status
    ) then
      raise exception 'INVALID_MEASUREMENT_STATUS_TRANSITION:%->%',old.status,new.status using errcode='22023';
    end if;
    if old.archived_at is not null and new.archived_at is not null and row(
      new.service_package,new.property_id,new.contact_id,new.object_street,new.object_house_number,
      new.object_postal_code,new.object_city,new.property_type,new.approx_area_sqm,new.floor_count,
      new.requested_on,new.appointment_at,new.measured_on,new.delivered_on,new.area_standard,
      new.measured_living_area_sqm,new.measured_usable_area_sqm,new.fee_amount,new.fee_basis,
      new.invoice_reference,new.invoiced_on,new.paid_on,new.source,new.customer_message,
      new.internal_notes,new.status,new.primary_responsible_user
    ) is distinct from row(
      old.service_package,old.property_id,old.contact_id,old.object_street,old.object_house_number,
      old.object_postal_code,old.object_city,old.property_type,old.approx_area_sqm,old.floor_count,
      old.requested_on,old.appointment_at,old.measured_on,old.delivered_on,old.area_standard,
      old.measured_living_area_sqm,old.measured_usable_area_sqm,old.fee_amount,old.fee_basis,
      old.invoice_reference,old.invoiced_on,old.paid_on,old.source,old.customer_message,
      old.internal_notes,old.status,old.primary_responsible_user
    ) then
      raise exception 'ARCHIVED_MEASUREMENT_IMMUTABLE' using errcode='22023';
    end if;
  end if;

  if new.property_id is not null and not exists(select 1 from public.properties p where p.id=new.property_id) then
    raise exception 'MEASUREMENT_PROPERTY_NOT_FOUND' using errcode='P0002';
  end if;
  if new.contact_id is not null and not exists(select 1 from public.contacts c where c.id=new.contact_id) then
    raise exception 'MEASUREMENT_CONTACT_NOT_FOUND' using errcode='P0002';
  end if;
  if not exists(select 1 from public.profiles p where p.user_id=new.primary_responsible_user and p.status='ACTIVE') then
    raise exception 'MEASUREMENT_RESPONSIBLE_USER_INACTIVE' using errcode='22023';
  end if;

  -- Ein Zustand behauptet etwas ueber die Wirklichkeit. Wer "aufgemessen"
  -- setzt, ohne zu sagen wann, hat den Haken gesetzt und nicht die Arbeit.
  if new.status='MEASURED' and new.measured_on is null then
    raise exception 'MEASUREMENT_MEASURED_DATE_REQUIRED' using errcode='22023';
  end if;
  if new.status in ('DELIVERED','INVOICED','PAID') and new.delivered_on is null then
    raise exception 'MEASUREMENT_DELIVERY_DATE_REQUIRED' using errcode='22023';
  end if;
  if new.status='INVOICED' and (new.fee_amount is null or new.invoiced_on is null) then
    raise exception 'MEASUREMENT_INVOICE_DETAILS_REQUIRED' using errcode='22023';
  end if;
  if new.status='PAID' and new.fee_amount is null then
    raise exception 'MEASUREMENT_FEE_REQUIRED' using errcode='22023';
  end if;
  if new.status='PAID' and new.paid_on is null then
    raise exception 'MEASUREMENT_PAYMENT_DATE_REQUIRED' using errcode='22023';
  end if;

  -- Eine Flaechengrundlage ohne Flaeche ist eine Behauptung ueber nichts.
  if new.area_standard <> 'NONE'
     and new.measured_living_area_sqm is null and new.measured_usable_area_sqm is null then
    raise exception 'MEASUREMENT_AREA_REQUIRED_FOR_STANDARD' using errcode='22023';
  end if;

  return new;
end;
$function$;
revoke all on function app_private.validate_measurement_order() from public, anon, authenticated;
