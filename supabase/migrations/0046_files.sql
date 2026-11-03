-- File bytes that used to live in Supabase Storage.
-- Paths stay the same (`{user_id}/{uuid}.ext`). The server streams them from
-- /files/{bucket}/{path} after checking the same access rules the signed
-- URLs used to enforce. RLS is on with no policies, like every other table;
-- the PostgREST role bypasses RLS (see deploy/postgrest/roles.sql).

create table if not exists public.files (
  bucket       text not null,
  path         text not null,
  content_type text,
  size         bigint not null,
  bytes        bytea not null,
  created_at   timestamptz not null default now(),
  primary key (bucket, path),
  constraint files_bucket_known check (
    bucket in ('checkpoint-images', 'submission-screenshots', 'submission-evidence')
  ),
  constraint files_path_safe check (
    length(path) between 1 and 1024
    and path !~ '(^|/)\.\.(/|$)'
    and path !~ '//'
  ),
  constraint files_size_matches check (size >= 0 and size = octet_length(bytes))
);

alter table public.files enable row level security;

create index if not exists checkpoints_image_path_idx
  on checkpoints (image_path)
  where image_path is not null;

create index if not exists submission_queue_screenshot_path_idx
  on submission_queue (screenshot_path)
  where screenshot_path is not null;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'expedition') then
    grant all on public.files to expedition;
  end if;
end $$;

notify pgrst, 'reload schema';
