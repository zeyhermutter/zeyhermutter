-- Historical marker for the one-time BETA demo asset seed.
-- Fresh environments must not enable the network-capable HTTP extension.

do $$
begin
  raise notice 'Skipping historical BETA-only HTTP extension activation';
end
$$;
