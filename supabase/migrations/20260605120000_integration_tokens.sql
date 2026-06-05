-- Integration tokens: encrypted per-user credentials for Jira and Google Calendar.

create table public.integration_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('jira', 'google_calendar')),
  encrypted_payload text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create index integration_tokens_user_id_idx on public.integration_tokens (user_id);

alter table public.integration_tokens enable row level security;

create policy "Users can manage their own integration tokens"
  on public.integration_tokens
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger integration_tokens_set_updated_at
  before update on public.integration_tokens
  for each row
  execute function public.set_updated_at();
