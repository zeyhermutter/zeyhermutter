-- This single staging row predates the rule that an object-related inquiry can
-- only be closed after a property has been linked. Reopen it so the invariant
-- is true and subsequent updates are possible. The predicates make the repair
-- a no-op if the record has already been corrected or linked in the meantime.
update public.inquiries
set status = 'CONTACTED'
where id = '081636c7-80a6-46ab-bd12-1d756aab7a18'
  and inquiry_number = 'ZM-A-000004'
  and status = 'CLOSED'
  and property_id is null
  and search_profile_id is null;
