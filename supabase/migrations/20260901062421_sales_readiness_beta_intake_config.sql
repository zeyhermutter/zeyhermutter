create table if not exists public.sales_readiness_public_intake_config (
  id text primary key,
  enabled boolean not null default false,
  responsible_user uuid references public.profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_readiness_public_intake_config_id_check check (id = 'SELLER_CHECK')
);

alter table public.sales_readiness_public_intake_config enable row level security;
revoke all on table public.sales_readiness_public_intake_config from anon, authenticated;
grant select on table public.sales_readiness_public_intake_config to service_role;
