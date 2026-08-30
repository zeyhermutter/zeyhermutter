alter table public.property_owners
  drop constraint if exists property_owners_property_id_contact_id_valid_from_key;

alter table public.property_owners
  add constraint property_owners_property_contact_valid_from_key
  unique nulls not distinct (property_id, contact_id, valid_from);
