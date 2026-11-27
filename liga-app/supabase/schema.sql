-- Darts & Durstig Liga – Supabase-Schema
-- Im Supabase-Dashboard unter "SQL Editor" einfügen und einmal ausführen
-- (kann auch erneut ausgeführt werden, z. B. nach einem Update).
-- Danach: Authentication -> Sign In / Providers -> "Allow new users to sign up" AUS
-- und die Konten unter Authentication -> Users -> "Add user" anlegen (siehe README).

-- 1) Tabelle mit dem kompletten Liga-Stand (ein Datensatz, id = 'main')
create table if not exists public.league_state (
  id          text primary key,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);

-- 2) Admin-PIN (für niemanden direkt lesbar)
create table if not exists public.league_admin (
  id   int primary key default 1 check (id = 1),
  pin  text not null
);
insert into public.league_admin (id, pin) values (1, '1800') on conflict (id) do nothing;

-- 3) Row Level Security: nur angemeldete Liga-Mitglieder dürfen lesen, niemand darf direkt schreiben
alter table public.league_state enable row level security;
alter table public.league_admin enable row level security;

drop policy if exists "league_state lesen" on public.league_state;
create policy "league_state lesen" on public.league_state for select to authenticated using (true);
-- (keine Policies auf league_admin -> PIN ist für die App nicht auslesbar)

-- 4) Schreiben nur über Funktionen, die den PIN prüfen
create or replace function public.save_league_state(p_pin text, p_data jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from league_admin where id = 1 and pin = p_pin) then
    raise exception 'Falscher Admin-PIN' using errcode = '28000';
  end if;
  insert into league_state (id, data, updated_at) values ('main', p_data, now())
  on conflict (id) do update set data = excluded.data, updated_at = now();
end $$;

create or replace function public.verify_admin_pin(p_pin text)
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from league_admin where id = 1 and pin = p_pin);
$$;

create or replace function public.change_admin_pin(p_old text, p_new text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_new !~ '^[0-9]{4}$' then raise exception 'PIN muss 4-stellig sein'; end if;
  update league_admin set pin = p_new where id = 1 and pin = p_old;
  return found;
end $$;

revoke all on function public.save_league_state(text, jsonb) from public;
revoke all on function public.verify_admin_pin(text) from public;
revoke all on function public.change_admin_pin(text, text) from public;
revoke all on function public.save_league_state(text, jsonb) from anon;
revoke all on function public.verify_admin_pin(text) from anon;
revoke all on function public.change_admin_pin(text, text) from anon;
grant execute on function public.save_league_state(text, jsonb) to authenticated;
grant execute on function public.verify_admin_pin(text) to authenticated;
grant execute on function public.change_admin_pin(text, text) to authenticated;

-- 5) Echtzeit-Updates aktivieren
do $$ begin
  alter publication supabase_realtime add table public.league_state;
exception when duplicate_object then null;
end $$;
