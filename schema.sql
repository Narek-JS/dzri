-- dzri — free item giveaway platform
-- PostgreSQL schema, v1

create extension if not exists "pgcrypto";

create table districts (
  id       serial primary key,
  slug     text not null unique,                   -- 'kentron', 'ajapnyak', 'gyumri'
  name_hy  text not null,
  name_ru  text not null,
  name_en  text not null,
  region   text not null                           -- 'yerevan' | marz name
);

-- ---------------------------------------------------------------
-- identity: phone number is the account, there is no email/password
-- ---------------------------------------------------------------

create table users (
  id            uuid primary key default gen_random_uuid(),
  phone         text not null unique,              -- E.164, e.g. +37455123456
  display_name  text not null,
  avatar_url    text,
  district_id   int references districts(id),
  is_banned     boolean not null default false,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz
);

create table otp_codes (
  id          bigserial primary key,
  phone       text not null,
  code_hash   text not null,                       -- never store the raw code
  expires_at  timestamptz not null,
  attempts    smallint not null default 0,
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);

create index on otp_codes (phone, created_at desc);

-- ---------------------------------------------------------------
-- reference data
-- ---------------------------------------------------------------


create table categories (
  id       serial primary key,
  slug     text not null unique,                   -- 'furniture', 'clothes', 'electronics'
  name_hy  text not null,
  name_ru  text not null,
  name_en  text not null,
  icon     text,
  position smallint not null default 0
);

-- ---------------------------------------------------------------
-- items
-- ---------------------------------------------------------------

create type item_status as enum (
  'draft',
  'active',
  'reserved',
  'given',
  'expired',
  'removed'
);

create type item_condition as enum (
  'working',        -- fully usable
  'needs_repair',   -- broken but has value
  'for_parts'
);

create table items (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references users(id) on delete cascade,
  category_id    int  not null references categories(id),
  district_id    int  not null references districts(id),

  title          text not null,
  description    text,
  condition      item_condition not null default 'working',
  pickup_notes   text,                             -- "3rd floor, no lift, bring a friend"

  status         item_status not null default 'active',
  reserved_for   uuid references users(id),
  reserved_until timestamptz,                      -- auto-release deadline
  given_at       timestamptz,

  view_count     int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  expires_at     timestamptz not null default now() + interval '30 days',

  constraint reserved_needs_user
    check (status <> 'reserved' or reserved_for is not null)
);

-- the feed query: active items, newest first, filtered by district/category
create index on items (status, created_at desc)
  where status = 'active';
create index on items (district_id, status, created_at desc);
create index on items (category_id, status, created_at desc);
create index on items (user_id, created_at desc);

-- for the background job that expires and un-reserves
create index on items (expires_at) where status = 'active';
create index on items (reserved_until) where status = 'reserved';

create table item_images (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null references items(id) on delete cascade,
  url        text not null,
  width      int,
  height     int,
  blurhash   text,                                 -- placeholder while loading
  position   smallint not null default 0,
  created_at timestamptz not null default now()
);

create index on item_images (item_id, position);

-- ---------------------------------------------------------------
-- claims: the core interaction
-- someone says "I want this", the giver picks one person
-- ---------------------------------------------------------------

create type claim_status as enum (
  'pending',
  'approved',
  'rejected',
  'withdrawn',
  'completed',
  'no_show'
);

create table claims (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null references items(id) on delete cascade,
  user_id      uuid not null references users(id) on delete cascade,
  message      text,                               -- "I can come today after 6"
  status       claim_status not null default 'pending',
  created_at   timestamptz not null default now(),
  responded_at timestamptz,

  -- one claim per person per item, no spamming
  unique (item_id, user_id)
);

create index on claims (item_id, status, created_at);
create index on claims (user_id, created_at desc);

-- phone numbers are revealed only after the giver approves a claim.
-- enforce that in the application layer, and never send the phone
-- field in any item or claim response until status = 'approved'.

-- ---------------------------------------------------------------
-- trust and safety
-- ---------------------------------------------------------------

create type report_reason as enum (
  'spam',
  'selling_not_giving',
  'prohibited_item',
  'fake_listing',
  'offensive',
  'other'
);

create table reports (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid references items(id) on delete cascade,
  reported_user uuid references users(id) on delete cascade,
  reporter_id  uuid not null references users(id) on delete cascade,
  reason       report_reason not null,
  detail       text,
  resolved_at  timestamptz,
  created_at   timestamptz not null default now(),

  constraint report_has_target
    check (item_id is not null or reported_user is not null)
);

create index on reports (resolved_at, created_at) where resolved_at is null;

-- no-show tracking: a giver marks a claim 'no_show', which is how
-- you identify the users who ruin the platform for everyone else
create view user_reliability as
select
  u.id,
  u.phone,
  count(*) filter (where c.status = 'completed') as completed,
  count(*) filter (where c.status = 'no_show')   as no_shows
from users u
left join claims c on c.user_id = u.id
group by u.id, u.phone;
