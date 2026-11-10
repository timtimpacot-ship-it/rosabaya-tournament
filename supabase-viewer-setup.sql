-- I-run ito SA SUPABASE (SQL Editor -> New query -> Run), pagkatapos ng supabase-setup.sql

create table published (
  id int primary key default 1 check (id = 1),
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table published enable row level security;

-- Mga naka-login na viewer lang ang makakabasa
create policy "viewers can read" on published for select to authenticated using (true);

-- Ang admin lang (may tamang PIN) ang makakapag-publish
create function publish_data(p_pin text, p_data jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_pin is distinct from (select pin from admin_config limit 1) then raise exception 'Wrong PIN'; end if;
  insert into published (id, data, updated_at) values (1, p_data, now())
  on conflict (id) do update set data = excluded.data, updated_at = now();
end $$;
grant execute on function publish_data(text, jsonb) to anon;
