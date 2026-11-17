-- SCDAid Hackathon Prototype — Expert Insights
-- Run this in the Supabase SQL Editor (or via supabase db push).

create extension if not exists pgcrypto;

create type public.insights_role as enum ('admin', 'supervisor');
create type public.feedback_status as enum ('new', 'under_review', 'considered', 'implemented');
create type public.professional_role as enum ('physician', 'pharmacist', 'researcher', 'student', 'other');
create type public.feedback_category as enum ('clinical', 'usability', 'ai_technology', 'general');

create table public.insights_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role public.insights_role not null,
  display_name text,
  created_at timestamptz not null default now()
);

create table public.expert_feedback (
  id uuid primary key default gen_random_uuid(),
  professional_role public.professional_role not null,
  category public.feedback_category not null,
  name text,
  email text,
  message text not null,
  status public.feedback_status not null default 'new',
  status_updated_at timestamptz,
  status_updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  submitter_ip_hash text,
  user_agent text,
  constraint expert_feedback_message_len check (char_length(message) between 20 and 2000),
  constraint expert_feedback_name_len check (name is null or char_length(name) <= 120),
  constraint expert_feedback_email_len check (email is null or char_length(email) <= 254)
);

-- Persistent rate-limit ledger (shared across Edge Function isolates)
create table public.feedback_rate_limits (
  ip_hash text not null,
  window_start timestamptz not null,
  hit_count integer not null default 0 check (hit_count >= 0),
  primary key (ip_hash, window_start)
);

create index expert_feedback_created_at_idx on public.expert_feedback (created_at desc);
create index expert_feedback_status_idx on public.expert_feedback (status);
create index expert_feedback_role_idx on public.expert_feedback (professional_role);
create index expert_feedback_category_idx on public.expert_feedback (category);
create index feedback_rate_limits_window_idx on public.feedback_rate_limits (window_start);

-- ---------------------------------------------------------------------------
-- Role helper (security definer so RLS can read profiles safely)
-- ---------------------------------------------------------------------------

create or replace function public.current_insights_role()
returns public.insights_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.insights_profiles
  where user_id = auth.uid()
$$;

revoke all on function public.current_insights_role() from public;
grant execute on function public.current_insights_role() to authenticated;

-- ---------------------------------------------------------------------------
-- Immutability: original feedback content cannot change after insert
-- ---------------------------------------------------------------------------

create or replace function public.enforce_expert_feedback_immutability()
returns trigger
language plpgsql
as $$
begin
  if new.professional_role is distinct from old.professional_role
     or new.category is distinct from old.category
     or new.name is distinct from old.name
     or new.email is distinct from old.email
     or new.message is distinct from old.message
     or new.created_at is distinct from old.created_at
     or new.submitter_ip_hash is distinct from old.submitter_ip_hash
     or new.user_agent is distinct from old.user_agent
     or new.id is distinct from old.id then
    raise exception 'Expert feedback content is immutable';
  end if;

  if new.status is distinct from old.status then
    if public.current_insights_role() is distinct from 'admin'::public.insights_role then
      raise exception 'Only administrators may update feedback status';
    end if;
    new.status_updated_at := now();
    new.status_updated_by := auth.uid();
  end if;

  return new;
end;
$$;

create trigger expert_feedback_immutability
before update on public.expert_feedback
for each row
execute function public.enforce_expert_feedback_immutability();

-- ---------------------------------------------------------------------------
-- Atomic rate-limit check (called only by Edge Function with service role)
-- Returns true when the request is allowed.
-- ---------------------------------------------------------------------------

create or replace function public.check_feedback_rate_limit(
  p_ip_hash text,
  p_limit integer default 5,
  p_window_seconds integer default 900
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz;
  v_count integer;
begin
  if p_ip_hash is null or length(p_ip_hash) < 16 then
    return false;
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.feedback_rate_limits (ip_hash, window_start, hit_count)
  values (p_ip_hash, v_window_start, 1)
  on conflict (ip_hash, window_start)
  do update set hit_count = public.feedback_rate_limits.hit_count + 1
  returning hit_count into v_count;

  delete from public.feedback_rate_limits
  where window_start < now() - make_interval(secs => p_window_seconds * 4);

  return v_count <= p_limit;
end;
$$;

revoke all on function public.check_feedback_rate_limit(text, integer, integer) from public;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.insights_profiles enable row level security;
alter table public.expert_feedback enable row level security;
alter table public.feedback_rate_limits enable row level security;

create policy insights_profiles_select_own
  on public.insights_profiles
  for select
  to authenticated
  using (user_id = auth.uid());

create policy expert_feedback_select_authorized
  on public.expert_feedback
  for select
  to authenticated
  using (
    public.current_insights_role() in (
      'admin'::public.insights_role,
      'supervisor'::public.insights_role
    )
  );

create policy expert_feedback_update_admin
  on public.expert_feedback
  for update
  to authenticated
  using (public.current_insights_role() = 'admin'::public.insights_role)
  with check (public.current_insights_role() = 'admin'::public.insights_role);

-- No INSERT/DELETE policies for anon or authenticated on expert_feedback.
-- No policies on feedback_rate_limits for clients.
-- Service role (Edge Function) bypasses RLS for insert + rate-limit RPC.

-- ---------------------------------------------------------------------------
-- After creating Auth users, assign roles (replace UUIDs):
--
-- insert into public.insights_profiles (user_id, role, display_name) values
--   ('ADMIN-USER-UUID', 'admin', 'Project Administrator'),
--   ('SUPERVISOR-USER-UUID', 'supervisor', 'Dr. Ali Alghubayshi');
-- ---------------------------------------------------------------------------
