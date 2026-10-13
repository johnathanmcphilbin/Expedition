-- A participant who qualifies asks for their travel grant. One request per
-- person: a declined or withdrawn one can be made again (same row). Approving
-- locks their travel fund (users.travel_locked_at) so the amount can't move
-- while organisers book things.
create table if not exists travel_grant_requests (
  user_id        uuid primary key references users (id) on delete cascade,
  status         text not null default 'requested'
                   check (status in ('requested', 'approved', 'declined', 'withdrawn')),
  hours_banked   numeric(6, 2) not null,     -- travel fund when they asked; the grant is this x $8
  approved_hours numeric(6, 2) not null,     -- approved build hours when they asked
  hours_needed   numeric(6, 2) not null,     -- what their travel cost required
  est_travel_usd integer,                    -- flight + visa estimate when they asked
  home_airport   text,
  note           text,                       -- theirs
  admin_note     text,                       -- shown to them on decline
  requested_at   timestamptz not null default now(),
  decided_at     timestamptz,
  decided_by     uuid references users (id)
);

alter table travel_grant_requests enable row level security;
revoke all on travel_grant_requests from anon, authenticated;
