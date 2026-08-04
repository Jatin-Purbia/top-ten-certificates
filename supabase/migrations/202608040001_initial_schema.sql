create extension if not exists pgcrypto;
create extension if not exists pg_cron;
create extension if not exists http;

create type public.admin_role as enum ('super_admin','certificate_admin','viewer');
create type public.cycle_status as enum ('draft','scheduled','published','expired','purged');

create table public.admin_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role admin_role not null default 'viewer',
  active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.certificate_templates (
  id uuid primary key default gen_random_uuid(), name text not null, storage_path text not null,
  approved boolean not null default false, active boolean not null default false,
  field_config jsonb not null default '{}'::jsonb, created_by uuid references public.admin_profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.result_cycles (
  id uuid primary key default gen_random_uuid(), public_slug text not null unique default encode(gen_random_bytes(18),'hex'),
  title text not null, result_number text not null, issue_number text not null,
  display_start_at timestamptz not null, display_end_at timestamptz not null,
  publication_at timestamptz not null, expires_at timestamptz not null,
  download_window_days integer not null check (download_window_days between 1 and 365),
  status cycle_status not null default 'draft', certificate_template_id uuid references public.certificate_templates(id),
  created_by uuid references public.admin_profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  published_at timestamptz, purged_at timestamptz,
  constraint valid_display_period check (display_end_at = display_start_at + interval '15 days'),
  constraint valid_expiry check (expires_at > publication_at)
);
create table public.candidates (
  id uuid primary key default gen_random_uuid(), cycle_id uuid not null references public.result_cycles(id),
  participant_id text not null, certificate_number text not null, public_certificate_id uuid not null default gen_random_uuid() unique,
  name_hindi text not null, name_english text not null, guardian_name text not null, class_name text not null,
  age integer not null check (age between 3 and 25), city text not null, score numeric(8,2) not null check(score >= 0),
  rank integer not null check(rank between 1 and 10), result_date date not null, photo_path text,
  download_count integer not null default 0 check(download_count >= 0), first_downloaded_at timestamptz, last_downloaded_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(cycle_id, participant_id), unique(cycle_id, rank), unique(cycle_id, certificate_number)
);
create table public.candidate_claim_credentials (
  candidate_id uuid primary key references public.candidates(id) on delete cascade, hash text not null,
  reset_at timestamptz, created_at timestamptz not null default now()
);
create table public.claim_sessions (
  id uuid primary key default gen_random_uuid(), candidate_id uuid not null references public.candidates(id) on delete cascade,
  token_hash text not null unique, expires_at timestamptz not null, created_at timestamptz not null default now(), revoked_at timestamptz
);
create table public.certificate_download_events (
  id uuid primary key default gen_random_uuid(), candidate_id uuid not null references public.candidates(id) on delete cascade,
  downloaded_at timestamptz not null default now(), request_fingerprint text
);
create table public.app_settings (
  key text primary key, value jsonb not null, changed_by uuid references public.admin_profiles(id), updated_at timestamptz not null default now()
);
insert into public.app_settings(key,value) values ('certificate_availability','{"days":30}'::jsonb);
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(), actor_id uuid references public.admin_profiles(id) on delete set null,
  action text not null, entity_type text not null, entity_id uuid, metadata jsonb not null default '{}'::jsonb,
  request_id text, created_at timestamptz not null default now()
);
create table public.cleanup_runs (
  id uuid primary key default gen_random_uuid(), cycle_id uuid references public.result_cycles(id) on delete set null,
  status text not null check(status in ('running','succeeded','failed','skipped')), deleted_records integer not null default 0,
  error_code text, started_at timestamptz not null default now(), completed_at timestamptz
);
create index result_cycles_status_expiry_idx on public.result_cycles(status, expires_at);
create index candidates_cycle_idx on public.candidates(cycle_id);
create index claim_sessions_expiry_idx on public.claim_sessions(expires_at);
create index audit_logs_created_idx on public.audit_logs(created_at desc);

alter table public.admin_profiles enable row level security;
alter table public.certificate_templates enable row level security;
alter table public.result_cycles enable row level security;
alter table public.candidates enable row level security;
alter table public.candidate_claim_credentials enable row level security;
alter table public.claim_sessions enable row level security;
alter table public.certificate_download_events enable row level security;
alter table public.app_settings enable row level security;
alter table public.audit_logs enable row level security;
alter table public.cleanup_runs enable row level security;

create function public.current_admin_role() returns admin_role language sql stable security definer set search_path=public as $$
  select role from public.admin_profiles where id=auth.uid() and active=true
$$;
create policy "admins read own profile" on public.admin_profiles for select using (id=auth.uid() or public.current_admin_role()='super_admin');
create policy "authenticated read cycles" on public.result_cycles for select to authenticated using (public.current_admin_role() is not null);
create policy "authenticated read templates" on public.certificate_templates for select to authenticated using (public.current_admin_role() is not null);
-- Candidate PII and all writes intentionally have no client policy. They are backend service-role only.
create policy "admins read safe settings" on public.app_settings for select to authenticated using (public.current_admin_role() is not null);
create policy "admins read audit" on public.audit_logs for select to authenticated using (public.current_admin_role()='super_admin');
create policy "admins read cleanup" on public.cleanup_runs for select to authenticated using (public.current_admin_role()='super_admin');

create or replace function public.prevent_purged_cycle_restore() returns trigger language plpgsql as $$
begin if old.status='purged' and new.status <> 'purged' then raise exception 'Purged cycles cannot be restored'; end if; return new; end $$;
create trigger result_cycles_no_restore before update on public.result_cycles for each row execute function public.prevent_purged_cycle_restore();

create or replace function public.increment_candidate_download(candidate_uuid uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  update public.candidates set download_count=download_count+1, first_downloaded_at=coalesce(first_downloaded_at,now()), last_downloaded_at=now() where id=candidate_uuid;
end $$;

create or replace function public.purge_expired_cycle(target_cycle_id uuid) returns integer language plpgsql security definer set search_path=public as $$
declare deleted_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_cycle_id::text, 0));
  if not exists(select 1 from public.result_cycles where id=target_cycle_id and status <> 'purged' and expires_at <= now()) then return 0; end if;
  select count(*) into deleted_count from public.candidates where cycle_id=target_cycle_id;
  delete from public.candidates where cycle_id=target_cycle_id;
  update public.result_cycles set status='purged', purged_at=now(), updated_at=now() where id=target_cycle_id;
  return deleted_count;
end $$;

create or replace function public.import_candidates_transactional(target_cycle_id uuid, payload jsonb) returns integer language plpgsql security definer set search_path=public as $$
declare item jsonb; inserted_count integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_cycle_id::text, 1));
  if not exists(select 1 from public.result_cycles where id=target_cycle_id and status in ('draft','scheduled')) then raise exception 'Cycle is not editable'; end if;
  for item in select value from jsonb_array_elements(payload) loop
    insert into public.candidates(id,cycle_id,participant_id,certificate_number,public_certificate_id,name_hindi,name_english,guardian_name,class_name,age,city,score,rank,result_date,photo_path,created_at,updated_at)
    values ((item->>'id')::uuid,target_cycle_id,item->>'participant_id',item->>'certificate_number',(item->>'public_certificate_id')::uuid,item->>'name_hindi',item->>'name_english',item->>'guardian_name',item->>'class_name',(item->>'age')::integer,item->>'city',(item->>'score')::numeric,(item->>'rank')::integer,(item->>'result_date')::date,nullif(item->>'photo_path',''),now(),now());
    insert into public.candidate_claim_credentials(candidate_id,hash) values ((item->>'id')::uuid,item->>'claim_hash');
    inserted_count := inserted_count + 1;
  end loop;
  return inserted_count;
end $$;
