-- Thema 2: Randfälle im Abschlusslebenszyklus härten.

create or replace function app_private.validate_sale_closing()
returns trigger
language plpgsql
set search_path to 'app_private','public','pg_temp'
as $function$
declare
  v_offer public.purchase_offers%rowtype;
begin
  if tg_op='INSERT' and new.status<>'PREPARATION' then
    raise exception 'CLOSING_MUST_START_PREPARATION' using errcode='22023';
  end if;

  select * into v_offer from public.purchase_offers po where po.id=new.accepted_offer_id;
  if not found then raise exception 'CLOSING_ACCEPTED_OFFER_NOT_FOUND' using errcode='P0002'; end if;
  if new.status='CANCELLED' then
    if v_offer.status not in ('ACCEPTED','FAILED') then raise exception 'CANCELLED_CLOSING_REQUIRES_ACCEPTED_OR_FAILED_OFFER' using errcode='22023'; end if;
  elsif v_offer.status<>'ACCEPTED' then
    raise exception 'CLOSING_REQUIRES_ACCEPTED_OFFER' using errcode='22023';
  end if;
  if v_offer.property_id<>new.property_id or v_offer.contact_id<>new.buyer_contact_id then
    raise exception 'CLOSING_OFFER_CONTEXT_MISMATCH' using errcode='22023';
  end if;
  if v_offer.amount<>new.agreed_purchase_price then
    raise exception 'CLOSING_AGREED_PRICE_MUST_MATCH_OFFER' using errcode='22023';
  end if;
  if not exists(select 1 from public.properties p where p.id=new.property_id and p.transaction_type='SALE') then
    raise exception 'CLOSING_SALE_PROPERTY_REQUIRED' using errcode='22023';
  end if;
  if not exists(select 1 from public.contacts c where c.id=new.buyer_contact_id and c.archived_at is null) then
    raise exception 'CLOSING_BUYER_NOT_AVAILABLE' using errcode='22023';
  end if;
  if not exists(select 1 from public.profiles p where p.user_id=new.primary_responsible_user and p.status='ACTIVE') then
    raise exception 'CLOSING_RESPONSIBLE_USER_INACTIVE' using errcode='22023';
  end if;
  if new.notary_organization_id is not null and not exists(select 1 from public.organizations o where o.id=new.notary_organization_id and o.archived_at is null) then
    raise exception 'CLOSING_NOTARY_ORGANIZATION_NOT_AVAILABLE' using errcode='22023';
  end if;
  if new.notary_contact_id is not null and not exists(select 1 from public.contacts c where c.id=new.notary_contact_id and c.archived_at is null) then
    raise exception 'CLOSING_NOTARY_CONTACT_NOT_AVAILABLE' using errcode='22023';
  end if;

  if tg_op='UPDATE' then
    if old.closing_number is distinct from new.closing_number then raise exception 'CLOSING_NUMBER_IMMUTABLE' using errcode='42501'; end if;
    if row(old.property_id,old.accepted_offer_id,old.buyer_contact_id,old.agreed_purchase_price) is distinct from row(new.property_id,new.accepted_offer_id,new.buyer_contact_id,new.agreed_purchase_price) then
      raise exception 'CLOSING_SOURCE_IMMUTABLE' using errcode='22023';
    end if;
    if old.status is distinct from new.status and not exists(
      select 1 from public.sale_closing_status_transitions t where t.from_status=old.status and t.to_status=new.status
    ) then
      raise exception 'INVALID_CLOSING_STATUS_TRANSITION:%->%',old.status,new.status using errcode='22023';
    end if;
    if old.archived_at is not null and new.archived_at is not null and row(
      new.notarial_purchase_price,new.status,new.notary_organization_id,new.notary_contact_id,new.notary_reference,
      new.notary_instruction_date,new.draft_received_date,new.notary_appointment_at,new.notarized_date,
      new.purchase_price_due_date,new.purchase_price_paid_date,new.handover_date,new.completed_date,
      new.cancellation_reason,new.primary_responsible_user,new.internal_notes
    ) is distinct from row(
      old.notarial_purchase_price,old.status,old.notary_organization_id,old.notary_contact_id,old.notary_reference,
      old.notary_instruction_date,old.draft_received_date,old.notary_appointment_at,old.notarized_date,
      old.purchase_price_due_date,old.purchase_price_paid_date,old.handover_date,old.completed_date,
      old.cancellation_reason,old.primary_responsible_user,old.internal_notes
    ) then
      raise exception 'ARCHIVED_CLOSING_IMMUTABLE' using errcode='22023';
    end if;
    if old.archived_at is distinct from new.archived_at and new.archived_at is not null and new.status not in ('COMPLETED','CANCELLED') then
      raise exception 'CLOSING_ONLY_TERMINAL_ARCHIVABLE' using errcode='22023';
    end if;
  end if;

  if new.status in ('NOTARY_INSTRUCTED','DRAFT_RECEIVED','APPOINTMENT_SCHEDULED','NOTARIZED','PURCHASE_PRICE_DUE','PURCHASE_PRICE_PAID','HANDOVER_COMPLETED','COMPLETED') then
    if new.notary_organization_id is null and new.notary_contact_id is null then raise exception 'CLOSING_NOTARY_REQUIRED' using errcode='22023'; end if;
    if new.notary_instruction_date is null then raise exception 'CLOSING_NOTARY_INSTRUCTION_DATE_REQUIRED' using errcode='22023'; end if;
  end if;
  if new.status in ('DRAFT_RECEIVED','APPOINTMENT_SCHEDULED','NOTARIZED','PURCHASE_PRICE_DUE','PURCHASE_PRICE_PAID','HANDOVER_COMPLETED','COMPLETED') and new.draft_received_date is null then
    raise exception 'CLOSING_DRAFT_RECEIVED_DATE_REQUIRED' using errcode='22023';
  end if;
  if new.status in ('APPOINTMENT_SCHEDULED','NOTARIZED','PURCHASE_PRICE_DUE','PURCHASE_PRICE_PAID','HANDOVER_COMPLETED','COMPLETED') and new.notary_appointment_at is null then
    raise exception 'CLOSING_NOTARY_APPOINTMENT_REQUIRED' using errcode='22023';
  end if;
  if new.status in ('NOTARIZED','PURCHASE_PRICE_DUE','PURCHASE_PRICE_PAID','HANDOVER_COMPLETED','COMPLETED') and new.notarized_date is null then
    raise exception 'CLOSING_NOTARIZED_DATE_REQUIRED' using errcode='22023';
  end if;
  if new.status in ('PURCHASE_PRICE_DUE','PURCHASE_PRICE_PAID','HANDOVER_COMPLETED','COMPLETED') and new.purchase_price_due_date is null then
    raise exception 'CLOSING_PURCHASE_PRICE_DUE_DATE_REQUIRED' using errcode='22023';
  end if;
  if new.status in ('PURCHASE_PRICE_PAID','HANDOVER_COMPLETED','COMPLETED') and new.purchase_price_paid_date is null then
    raise exception 'CLOSING_PURCHASE_PRICE_PAID_DATE_REQUIRED' using errcode='22023';
  end if;
  if new.status in ('HANDOVER_COMPLETED','COMPLETED') and new.handover_date is null then
    raise exception 'CLOSING_HANDOVER_DATE_REQUIRED' using errcode='22023';
  end if;
  if new.status='COMPLETED' and new.completed_date is null then
    raise exception 'CLOSING_COMPLETED_DATE_REQUIRED' using errcode='22023';
  end if;
  if new.status='CANCELLED' and nullif(trim(coalesce(new.cancellation_reason,'')),'') is null then
    raise exception 'CLOSING_CANCELLATION_REASON_REQUIRED' using errcode='22023';
  end if;

  return new;
end;
$function$;
revoke all on function app_private.validate_sale_closing() from public;

create or replace function app_private.protect_offer_with_closing()
returns trigger
language plpgsql
set search_path to 'app_private','public','pg_temp'
as $function$
begin
  if tg_op='UPDATE' and old.archived_at is distinct from new.archived_at and new.archived_at is not null and exists(
    select 1 from public.sale_closings sc
    where sc.accepted_offer_id=old.id and sc.archived_at is null
  ) then
    raise exception 'ACTIVE_CLOSING_OFFER_CANNOT_ARCHIVE' using errcode='22023';
  end if;
  return new;
end;
$function$;
revoke all on function app_private.protect_offer_with_closing() from public;

drop trigger if exists purchase_offers_10_closing_guard on public.purchase_offers;
create trigger purchase_offers_10_closing_guard before update on public.purchase_offers
for each row execute function app_private.protect_offer_with_closing();
