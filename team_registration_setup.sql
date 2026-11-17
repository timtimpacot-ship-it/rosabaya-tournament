-- Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run
-- Creates the table for team registrations (team name, captain, optional logo)
-- and a public list of team names used by the Player Registration dropdown.

create table if not exists public.team_registrations (
  id          bigint generated always as identity primary key,
  name        text not null check (char_length(name) between 1 and 60),
  captain     text not null check (char_length(captain) between 1 and 60),
  logo        text,                                   -- optional (base64 image), can be NULL
  status      text not null default 'pending',        -- pending / approved / rejected
  created_at  timestamptz not null default now()
);

-- one team name only (not case-sensitive): "Alpha" and "alpha" count as the same
create unique index if not exists team_registrations_name_uq
  on public.team_registrations (lower(name));

alter table public.team_registrations enable row level security;

-- anyone can submit a new team, but only as "pending"
drop policy if exists "anyone can register a team" on public.team_registrations;
create policy "anyone can register a team"
  on public.team_registrations for insert
  to anon, authenticated
  with check (status = 'pending');

-- names only (no captain, no logo) so the dropdown works even before login
create or replace view public.public_team_names as
  select name from public.team_registrations
  where status <> 'rejected'
  order by name;

grant select on public.public_team_names to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admin panel functions (same style as list_registrations / resolve_registration)
-- The PIN is checked by calling your existing list_registrations(p_pin), which
-- already raises an error when the PIN is wrong.
-- ---------------------------------------------------------------------------
create or replace function public.list_team_registrations(p_pin text)
returns setof public.team_registrations
language plpgsql security definer set search_path = public as $$
begin
  perform public.list_registrations(p_pin);          -- wrong PIN -> error
  return query
    select * from public.team_registrations
    where status = 'pending' order by created_at;
end $$;

create or replace function public.resolve_team_registration(p_pin text, p_id bigint, p_status text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.list_registrations(p_pin);          -- wrong PIN -> error
  if p_status not in ('approved','rejected') then
    raise exception 'invalid status';
  end if;
  update public.team_registrations set status = p_status where id = p_id;
end $$;

grant execute on function public.list_team_registrations(text) to anon, authenticated;
grant execute on function public.resolve_team_registration(text, bigint, text) to anon, authenticated;
