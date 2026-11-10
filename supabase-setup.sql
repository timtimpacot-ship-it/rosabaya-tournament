-- I-paste at i-run sa Supabase: SQL Editor -> New query -> Run
-- BAGUHIN ANG '2468' kung iba ang PIN ng admin panel mo.

create table registrations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  ign text not null check (char_length(ign) between 1 and 40),
  team text not null check (char_length(team) between 1 and 60),
  role text not null check (role in ('Tank','Fighter','Core','Mage','Marksman','Flex')),
  photo text check (char_length(photo) <= 400000),
  status text not null default 'pending'
);
alter table registrations enable row level security;

-- Ang players (anon) ay pwede lang mag-INSERT. Hindi sila makakabasa o makakabago.
create policy "players can register" on registrations
  for insert to anon with check (status = 'pending');

create table admin_config (pin text not null);
alter table admin_config enable row level security;   -- walang policy = walang access
insert into admin_config (pin) values ('2468');

-- Admin functions, protektado ng PIN
create function list_registrations(p_pin text)
returns setof registrations language plpgsql security definer set search_path = public as $$
begin
  if p_pin is distinct from (select pin from admin_config limit 1) then raise exception 'Wrong PIN'; end if;
  return query select * from registrations where status = 'pending' order by created_at;
end $$;

create function resolve_registration(p_pin text, p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_pin is distinct from (select pin from admin_config limit 1) then raise exception 'Wrong PIN'; end if;
  if p_status not in ('approved','rejected') then raise exception 'Bad status'; end if;
  update registrations set status = p_status where id = p_id;
end $$;

grant execute on function list_registrations(text) to anon;
grant execute on function resolve_registration(text, uuid, text) to anon;
