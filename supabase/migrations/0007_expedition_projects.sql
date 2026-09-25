-- The Hackatime projects a participant has said they're working on for
-- Expedition. Hackatime lists every folder that ever sent a heartbeat —
-- often dozens — so the dashboard shows only these, not the whole list.
--
-- A shortlist, nothing more: hours still come only from approved reviews,
-- and a project doesn't need to be here to be submitted or reviewed.

create table expedition_projects (
  user_id           uuid not null references users (id) on delete cascade,
  hackatime_project text not null,
  created_at        timestamptz not null default now(),
  primary key (user_id, hackatime_project),
  constraint expedition_projects_name_length check (char_length(hackatime_project) between 1 and 200)
);

alter table expedition_projects enable row level security;
