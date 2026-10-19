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

-- shareable, editable notes (api/notes.js): anyone with the link can read AND edit. Do not store secrets.
-- id = 24 random base64url chars generated server-side. Head row + last 50 versions per note.
-- Expiry (1d / 7d / 30d / keep) renews on every save; expired rows are deleted lazily.
-- Rate limits reuse link_attempts with keys 'notes-new:<hash>' / 'notes-save:<hash>' / 'notes-read:<hash>' / 'notes-new:global'.
create table if not exists notes (
  id text primary key,
  title text not null default '',
  lang text not null default 'plain',
  content text not null default '',   -- <= 200 KB
  version integer not null default 1, -- head version; saves send the base they started from
  expiry text not null default '30d', -- 1d | 7d | 30d | keep
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz              -- null = keep
);
create index if not exists notes_expires on notes (expires_at);
create table if not exists note_versions (
  id text not null,
  version integer not null,
  title text not null default '',
  lang text not null default 'plain',
  content text not null,
  created_at timestamptz not null default now(),
  primary key (id, version)
);
