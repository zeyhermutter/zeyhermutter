alter table public.properties
  drop constraint if exists properties_check;

alter table public.properties
  add constraint properties_transaction_price_check
  check (
    (transaction_type = 'SALE' and rent_cold is null)
    or
    (transaction_type = 'RENT' and purchase_price is null)
  );
