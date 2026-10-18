-- Documentation only (never run by Vercel). The app creates these lazily.
create table if not exists links (
  code text primary key,
  url text not null,
  created_at timestamptz default now(),
  hits bigint default 0,
  last_hit timestamptz,
  expires_at timestamptz,
  note text
);
-- failed PIN tries, for lockout that survives serverless cold starts
create table if not exists link_attempts (key text not null, at timestamptz not null default now());
create index if not exists link_attempts_key_at on link_attempts (key, at);
