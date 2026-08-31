-- Historical marker for a BETA-only data repair that has already been applied.
-- Fresh environments must never target a fixed business-data identifier.
do $$
begin
  raise notice 'Skipping historical BETA-only inquiry repair';
end
$$;
