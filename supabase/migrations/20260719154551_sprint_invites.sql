-- Sprint invites: track EM-generated invite links for assignees to connect Google Calendar.

create table public.sprint_invites (
  id uuid primary key default gen_random_uuid(),
  sprint_id integer not null,
  jira_account_id text not null,
  jira_display_name text not null,
  invited_by uuid not null references auth.users (id) on delete cascade,
  token text not null unique,
  status text not null default 'pending' check (status in ('pending', 'consumed')),
  connected_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  consumed_at timestamptz,
  unique (sprint_id, jira_account_id)
);

create index sprint_invites_invited_by_idx on public.sprint_invites (invited_by);

alter table public.sprint_invites enable row level security;

create policy "EMs manage their own invites"
  on public.sprint_invites
  for all
  using (auth.uid() = invited_by)
  with check (auth.uid() = invited_by);
