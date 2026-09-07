-- Thema 1 · Provisionen: generierten Erwartungswert im BEFORE-Trigger nicht direkt voraussetzen.
create or replace function app_private.validate_commission()
returns trigger
language plpgsql
set search_path to 'app_private','public','pg_temp'
as $function$
declare
  v_transaction_type text;
  v_expected numeric;
  v_target numeric;
begin
  if tg_op='INSERT' and new.status <> 'DRAFT' then
    raise exception 'COMMISSION_MUST_START_DRAFT' using errcode='22023';
  end if;

  if tg_op='UPDATE' then
    if old.commission_number is distinct from new.commission_number then
      raise exception 'COMMISSION_NUMBER_IMMUTABLE' using errcode='42501';
    end if;

    if old.status is distinct from new.status and not exists(
      select 1 from public.commission_status_transitions t
      where t.from_status=old.status and t.to_status=new.status
    ) then
      raise exception 'INVALID_COMMISSION_STATUS_TRANSITION:%->%',old.status,new.status using errcode='22023';
    end if;

    if old.archived_at is not null and new.archived_at is not null and row(
      new.property_id,new.purchase_offer_id,new.party_contact_id,new.side,new.calculation_method,
      new.calculation_basis,new.agreed_percent,new.agreed_fixed_amount,new.actual_amount,new.due_date,
      new.invoice_reference,new.paid_amount,new.paid_at,new.status,new.primary_responsible_user,new.internal_notes
    ) is distinct from row(
      old.property_id,old.purchase_offer_id,old.party_contact_id,old.side,old.calculation_method,
      old.calculation_basis,old.agreed_percent,old.agreed_fixed_amount,old.actual_amount,old.due_date,
      old.invoice_reference,old.paid_amount,old.paid_at,old.status,old.primary_responsible_user,old.internal_notes
    ) then
      raise exception 'ARCHIVED_COMMISSION_IMMUTABLE' using errcode='22023';
    end if;
  end if;

  select p.transaction_type into v_transaction_type from public.properties p where p.id=new.property_id;
  if v_transaction_type is null then raise exception 'COMMISSION_PROPERTY_NOT_FOUND' using errcode='P0002'; end if;
  if v_transaction_type <> 'SALE' then raise exception 'COMMISSION_SALE_PROPERTY_REQUIRED' using errcode='22023'; end if;

  if not exists(select 1 from public.profiles p where p.user_id=new.primary_responsible_user and p.status='ACTIVE') then
    raise exception 'COMMISSION_RESPONSIBLE_USER_INACTIVE' using errcode='22023';
  end if;

  if new.party_contact_id is not null and not exists(select 1 from public.contacts c where c.id=new.party_contact_id and c.archived_at is null) then
    raise exception 'COMMISSION_PARTY_NOT_AVAILABLE' using errcode='22023';
  end if;

  if new.purchase_offer_id is not null and not exists(
    select 1 from public.purchase_offers po
    where po.id=new.purchase_offer_id and po.property_id=new.property_id and po.archived_at is null
  ) then
    raise exception 'COMMISSION_OFFER_PROPERTY_MISMATCH' using errcode='22023';
  end if;

  if new.side='SELLER' and new.party_contact_id is not null and not exists(
    select 1 from public.property_owners po where po.property_id=new.property_id and po.contact_id=new.party_contact_id
  ) then
    raise exception 'COMMISSION_SELLER_MUST_BE_PROPERTY_OWNER' using errcode='22023';
  end if;

  if new.side='BUYER' and new.party_contact_id is not null and not exists(
    select 1 from public.purchase_offers po
    where po.property_id=new.property_id and po.contact_id=new.party_contact_id and po.archived_at is null
  ) then
    raise exception 'COMMISSION_BUYER_REQUIRES_PROPERTY_OFFER' using errcode='22023';
  end if;

  if new.side='BUYER' and new.purchase_offer_id is not null and new.party_contact_id is not null and not exists(
    select 1 from public.purchase_offers po where po.id=new.purchase_offer_id and po.contact_id=new.party_contact_id
  ) then
    raise exception 'COMMISSION_BUYER_OFFER_CONTACT_MISMATCH' using errcode='22023';
  end if;

  if new.status <> 'DRAFT' then
    if new.party_contact_id is null then raise exception 'COMMISSION_PARTY_REQUIRED' using errcode='22023'; end if;
    if new.calculation_method='PERCENT' and (coalesce(new.calculation_basis,0)<=0 or coalesce(new.agreed_percent,0)<=0) then
      raise exception 'COMMISSION_PERCENT_TERMS_REQUIRED' using errcode='22023';
    end if;
    if new.calculation_method='FIXED' and coalesce(new.agreed_fixed_amount,0)<=0 then
      raise exception 'COMMISSION_FIXED_AMOUNT_REQUIRED' using errcode='22023';
    end if;
  end if;

  v_expected := case
    when new.calculation_method='PERCENT' and new.calculation_basis is not null and new.agreed_percent is not null
      then round(new.calculation_basis * new.agreed_percent / 100, 2)
    when new.calculation_method='FIXED' then new.agreed_fixed_amount
    else null
  end;
  v_target := coalesce(new.actual_amount,v_expected);

  if new.status in ('DUE','INVOICED','PARTIALLY_PAID','PAID') then
    if new.due_date is null then raise exception 'COMMISSION_DUE_DATE_REQUIRED' using errcode='22023'; end if;
    if coalesce(v_target,0)<=0 then raise exception 'COMMISSION_TARGET_AMOUNT_REQUIRED' using errcode='22023'; end if;
  end if;

  if new.status in ('DRAFT','EXPECTED','DUE') then
    new.invoice_status := 'NOT_ISSUED';
    new.payment_status := 'OPEN';
    if new.paid_amount <> 0 or new.paid_at is not null then raise exception 'COMMISSION_PAYMENT_NOT_ALLOWED_YET' using errcode='22023'; end if;
  elsif new.status='INVOICED' then
    new.invoice_status := 'ISSUED';
    new.payment_status := 'OPEN';
    if new.paid_amount <> 0 or new.paid_at is not null then raise exception 'COMMISSION_INVOICED_PAYMENT_MUST_BE_OPEN' using errcode='22023'; end if;
  elsif new.status='PARTIALLY_PAID' then
    new.invoice_status := 'ISSUED';
    new.payment_status := 'PARTIALLY_PAID';
    if coalesce(new.paid_amount,0)<=0 or coalesce(v_target,0)<=new.paid_amount then
      raise exception 'COMMISSION_PARTIAL_PAYMENT_INVALID' using errcode='22023';
    end if;
    if new.paid_at is not null then raise exception 'COMMISSION_PAID_AT_ONLY_FOR_FULL_PAYMENT' using errcode='22023'; end if;
  elsif new.status='PAID' then
    new.invoice_status := 'ISSUED';
    new.payment_status := 'PAID';
    if coalesce(v_target,0)<=0 or new.paid_amount < v_target then raise exception 'COMMISSION_FULL_PAYMENT_INCOMPLETE' using errcode='22023'; end if;
    if new.paid_at is null then raise exception 'COMMISSION_PAID_AT_REQUIRED' using errcode='22023'; end if;
  elsif new.status='CANCELLED' then
    new.invoice_status := 'CANCELLED';
    new.payment_status := 'OPEN';
    if new.paid_amount <> 0 or new.paid_at is not null then raise exception 'PAID_COMMISSION_CANNOT_BE_CANCELLED' using errcode='22023'; end if;
  end if;

  return new;
end;
$function$;
